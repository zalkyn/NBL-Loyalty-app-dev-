import prisma from "../../db.server.js";
import { logger } from "../../utils/logger.js";
import { dbRetry } from "../../utils/retry/dbRetry.js";

// ─── Default Select ───────────────────────────────────────────────────────────

/**
 * Default fields selected for all transaction queries.
 * Override by passing a custom `select` object.
 */
const DEFAULT_TRANSACTION_SELECT = {
    id: true,
    customerId: true,
    type: true,
    points: true,
    balanceAfter: true,
    status: true,
    reason: true,
    activity: true,
    eventId: true,
    rewardId: true,
    referralId: true,
    pointsRuleId: true,
    expiresAt: true,
    metadata: true,
    createdAt: true,
    notifiedAt: true,
};

// ─── Create Transaction ───────────────────────────────────────────────────────

/**
 * Creates a points transaction and updates the customer's balance atomically.
 *
 * Transaction types:
 * - EARN / REFERRAL   -> adds points, increases lifetimePoints
 * - REDEEM / EXPIRE   -> deducts points (throws if insufficient balance)
 * - ADJUST            -> signed value (+/-), balance floored at 0, adjusts lifetimePoints
 * - REVERSAL          -> signed value (+/-), balance NOT floored — can go
 *                        negative (a real "debt" if the customer already
 *                        spent points a cancelled/refunded order earned;
 *                        see the REVERSAL case below), lifetimePoints untouched
 * - BACKFILL          -> always non-negative (throws otherwise — use ADJUST/
 *                        REVERSAL to correct an existing backfill, never a
 *                        negative BACKFILL), adds points, increases
 *                        lifetimePoints — same arithmetic as EARN, but kept
 *                        as its own `type` value so a one-time retroactive
 *                        award (see ShadowRule/PointsBackfillEntry) can be
 *                        filtered/reported on separately from real,
 *                        order-driven earning. Any code that branches on
 *                        Transaction.type (dashboard stats, admin tables)
 *                        needs to decide explicitly what to do with this
 *                        type — nothing here does that automatically.
 * - SUBSCRIPTION_CANCEL_RESET -> always resets points to exactly 0 (computed
 *                        from the customer's live balance inside the
 *                        transaction — input.points is ignored, caller
 *                        doesn't need to know the balance up front).
 *                        lifetimePoints is deliberately left untouched
 *                        (it's the customer's permanent historical record,
 *                        not affected by a subscription cancelling — see
 *                        subscriptionCancelledJob.js for the trigger).
 * - SUBSCRIPTION_CANCEL_RESTORE -> gives back part or all of a prior
 *                        SUBSCRIPTION_CANCEL_RESET — input.points is the
 *                        amount restored, always positive. lifetimePoints
 *                        is left untouched, same as the RESET it's undoing
 *                        — see app/layout/subscription-cancellations for
 *                        the admin action that triggers this.
 *
 * @param {Object}                                                    input
 * @param {number}                                                    input.customerId
 * @param {"EARN"|"REDEEM"|"ADJUST"|"EXPIRE"|"REVERSAL"|"REFERRAL"|"BACKFILL"|"SUBSCRIPTION_CANCEL_RESET"|"SUBSCRIPTION_CANCEL_RESTORE"}  input.type
 * @param {number}                                                    [input.points]      - EARN/REDEEM/EXPIRE/REFERRAL/BACKFILL/SUBSCRIPTION_CANCEL_RESTORE: always positive (BACKFILL/SUBSCRIPTION_CANCEL_RESTORE throw otherwise). ADJUST/REVERSAL: signed (+/-). SUBSCRIPTION_CANCEL_RESET: ignored.
 * @param {string}                                                    [input.status]      - "ACTIVE" | "PENDING" | "COMPLETED" | "CANCELLED" | "REVERSED" (default: "ACTIVE")
 * @param {string}                                                    [input.reason]
 * @param {number}                                                    [input.eventId]
 * @param {number}                                                    [input.rewardId]
 * @param {number}                                                    [input.referralId]
 * @param {number}                                                    [input.pointsRuleId]
 * @param {string}                                                    [input.activity]
 * @param {Date|string}                                               [input.expiresAt]
 * @param {Object}                                                    [input.metadata]
 * @param {Date}                                                      [input.notifiedAt] - Set to `new Date()` ONLY for actions the customer
 *   triggers themselves live inside the open widget (reward redeem, physical
 *   prize claim, applying a referral code) — they already see a direct
 *   success confirmation on screen, so this transaction should never also
 *   surface as a toast notification later. Leave unset/null (default) for
 *   anything that happens while the customer isn't looking at the widget
 *   (order-paid webhooks, admin/merchant dashboard actions, third-party app
 *   triggers) — those SHOULD still generate a toast on their next visit.
 * @param {Object}                                                    session
 * @param {string}                                                    session.id
 * @param {Object}                                                    [select]            - Prisma select object to control returned fields.
 * @returns {Promise<Object|null>} Created transaction or null on failure.
 *
 * @example
 * // Earn points for order — background/webhook-driven, customer isn't
 * // present, so leave notifiedAt unset (they'll get a toast next visit).
 * await createTransaction(
 *     {
 *         customerId:   12,
 *         type:         "EARN",
 *         points:       150,
 *         activity:     "Earned 150 pts for order #1234",
 *         eventId:      3,
 *         pointsRuleId: 7,
 *         status:       "COMPLETED",
 *         metadata:     { orderId: "gid://shopify/Order/1234" },
 *     },
 *     session
 * )
 *
 * // Reward redeemed live, inside the widget — customer already sees the
 * // voucher code on screen, so mark it notified immediately.
 * await createTransaction(
 *     { customerId: 12, type: "REDEEM", points: 100, rewardId: 4, notifiedAt: new Date() },
 *     session
 * )
 *
 * // Minimal select — only return what's needed
 * await createTransaction(input, session, { id: true, points: true, balanceAfter: true })
 *
 * // Points Backfill — one-time retroactive award for pre-install lifetime
 * // spend. NEVER pass a ShadowRule id as pointsRuleId: that FK only
 * // accepts real PointsRule ids. This is NOT reliably self-enforcing —
 * // ShadowRule and PointsRule have independent id sequences, so a
 * // ShadowRule id CAN coincidentally match a real PointsRule id (e.g.
 * // both tables' first row is id=1), in which case Postgres sees a
 * // valid reference and silently links to the wrong rule instead of
 * // erroring. (When the id genuinely doesn't exist in PointsRule, THAT
 * // case does throw a Postgres FK-violation inside the $transaction
 * // below, which this function's own catch block turns into a silent
 * // `return null` — so a caller must still always check the return
 * // value regardless.) Link back to the ShadowRule via metadata (and
 * // PointsBackfillEntry, which is the queryable, collision-proof record
 * // of this) instead — never pointsRuleId.
 * await createTransaction(
 *     {
 *         customerId: 12,
 *         type:       "BACKFILL",
 *         points:     250,
 *         activity:   "Backfilled 250 pts for lifetime spend",
 *         status:     "COMPLETED",
 *         metadata:   { source: "BACKFILL", shadowRuleId: 3, jobId: 42, amountSpent: 500 },
 *     },
 *     session
 * )
 */
export default async function createTransaction(input, session, select = DEFAULT_TRANSACTION_SELECT) {
    try {
        // Wrapped in dbRetry: the $transaction below is atomic (all-or-nothing)
        // AND runs at Repeatable Read isolation (see isolationLevel below), so a
        // transient DB error (connection reset) or a genuine write conflict
        // (two concurrent redemptions/earn events for the same customer —
        // e.g. an order-paid webhook and a live widget redemption landing at
        // the same time) are both safe to retry. Business errors thrown
        // inside (not found, unauthorized, insufficient points, unknown
        // type) don't match dbRetry's retryable patterns, so they still fail
        // immediately without wasted retry attempts.
        //
        // ── Why an isolation level above READ COMMITTED at all ────────────
        // The balance update below reads customer.points, computes
        // newBalance in JS, then writes that literal number back — NOT an
        // atomic SQL `points = points - X`. Under READ COMMITTED, two
        // concurrent calls for the same customer can both read the same
        // starting balance, and whichever commits second silently
        // overwrites the first's update with its own stale-based number —
        // a classic lost update that would let a customer redeem two
        // rewards while only ever having enough points for one.
        //
        // ── Why REPEATABLE READ and not SERIALIZABLE ──────────────────────
        // This was Serializable, and that was over-strong for what the
        // transaction actually does. The dangerous interleaving here is
        // read-then-write against ONE row: customer X is read and customer
        // X is written. PostgreSQL's Repeatable Read already makes that
        // safe — a transaction whose snapshot predates a committed update
        // to a row it then tries to update is aborted with 40001, which
        // dbRetry re-runs against the current balance. Serializable adds
        // protection against write skew across DIFFERENT rows, and nothing
        // in this function does that.
        //
        // What it cost: Serializable uses SSI, whose predicate locks are
        // taken on index and heap PAGES rather than individual rows.
        // pointsBackfillJob processes members in id order, ten at a time,
        // so those ten customers reliably live on the same page — and SSI
        // reported them as conflicting even though every one is a
        // different customer with a different balance. The result was a
        // retry storm of pure false positives: near enough every award
        // failing its first attempt, recovering on the second, and paying
        // ~1.3s of backoff for the privilege. A 250-member batch that
        // should take a few seconds was taking 75.
        const result = await dbRetry(
            () =>
                prisma.$transaction(
                    async (tx) => {
                        const customer = await tx.customer.findUnique({
                            where: { id: input.customerId },
                            select: {
                                points: true,
                                lifetimePoints: true,
                                sessionId: true,
                            },
                        });

                        if (!customer) {
                            throw new Error("Customer not found");
                        }

                        if (customer.sessionId !== session.id) {
                            throw new Error("Unauthorized: customer does not belong to this shop");
                        }

                        const amount = Number(input.points);
                        let signedPoints;
                        let newBalance;
                        let newLifetimePoints = customer.lifetimePoints;

                        switch (input.type) {
                            case "EARN":
                            case "REFERRAL":
                                signedPoints = amount;
                                newBalance = customer.points + amount;
                                newLifetimePoints += amount;
                                break;

                            case "REDEEM":
                            case "EXPIRE":
                                if (amount > customer.points) {
                                    throw new Error(
                                        `Insufficient points: has ${customer.points.toLocaleString()}, attempted ${amount.toLocaleString()}`
                                    );
                                }
                                signedPoints = -amount;
                                newBalance = customer.points - amount;
                                break;

                            case "ADJUST":
                                signedPoints = amount;
                                newBalance = Math.max(0, customer.points + amount);
                                newLifetimePoints += amount;
                                break;
                            case "REVERSAL":
                                // Signed value passed directly from caller (+/-).
                                // Deliberately NOT floored at 0 like ADJUST above:
                                // a REVERSAL fires when an order is cancelled or
                                // refunded, reversing points the customer earned
                                // from it. If they already spent those points on
                                // a reward/prize before the cancellation/refund,
                                // flooring at 0 would silently forgive that
                                // shortfall — letting a customer buy something,
                                // immediately redeem the points it earned, then
                                // cancel the order and keep the reward for free.
                                // Instead the balance is allowed to go negative,
                                // recording a real "debt" that blocks new reward/
                                // prize claims (their pointsCost > any negative
                                // balance) until it's paid down by future earning
                                // or a manual admin adjustment.
                                signedPoints = amount;
                                newBalance = customer.points + amount;
                                break;

                            case "BACKFILL":
                                // Always non-negative — a BACKFILL is a one-time
                                // retroactive award for pre-install lifetime
                                // spend (see ShadowRule/PointsBackfillEntry), and
                                // should never itself carry a negative value.
                                // Correcting an existing backfill (wrong amount,
                                // reversing it entirely) is what ADJUST/REVERSAL
                                // are for — mixing a negative into BACKFILL would
                                // break the "BACKFILL = one-time award" audit
                                // meaning that's the whole reason this type
                                // exists separately from ADJUST in the first
                                // place.
                                if (amount < 0) {
                                    throw new Error(
                                        `BACKFILL points must be non-negative (got ${amount}) — use ADJUST or REVERSAL to correct an existing backfill`
                                    );
                                }
                                signedPoints = amount;
                                newBalance = customer.points + amount;
                                newLifetimePoints += amount;
                                break;

                            case "SUBSCRIPTION_CANCEL_RESET":
                                // Always resets to exactly 0, computed from
                                // the live balance just read above — NOT
                                // input.points (caller enqueues this without
                                // knowing the customer's current balance).
                                // lifetimePoints is intentionally left as-is:
                                // it's the customer's permanent historical
                                // record and a subscription cancelling
                                // doesn't erase what they've earned overall
                                // — see subscriptionCancelledJob.js.
                                signedPoints = -customer.points;
                                newBalance = 0;
                                break;

                            case "SUBSCRIPTION_CANCEL_RESTORE":
                                // Gives back part or all of a prior
                                // SUBSCRIPTION_CANCEL_RESET — input.points is
                                // the amount being restored, always positive
                                // (the caller, handleRestorePoints, already
                                // caps it at what that reset actually took).
                                // lifetimePoints is deliberately left as-is,
                                // same as the RESET case it's undoing: these
                                // points were already counted once when
                                // originally earned, and RESET never
                                // decremented lifetimePoints — so adding them
                                // again here (the way ADJUST/EARN would) would
                                // double-count them into the customer's
                                // permanent historical total. This is why a
                                // restore can't just reuse ADJUST.
                                if (amount <= 0) {
                                    throw new Error(
                                        `SUBSCRIPTION_CANCEL_RESTORE points must be positive (got ${amount})`
                                    );
                                }
                                signedPoints = amount;
                                newBalance = customer.points + amount;
                                break;

                            default:
                                throw new Error(`Unknown transaction type: ${input.type}`);
                        }

                        const transaction = await tx.transaction.create({
                            data: {
                                customerId: input.customerId,
                                type: input.type,
                                points: signedPoints,
                                balanceAfter: newBalance,
                                status: input.status ?? "COMPLETED",
                                reason: input.reason ?? null,
                                activity: input.activity ?? null,
                                eventId: input.eventId ?? null,
                                rewardId: input.rewardId ?? null,
                                referralId: input.referralId ?? null,
                                pointsRuleId: input.pointsRuleId ?? null,
                                expiresAt: input.expiresAt ?? null,
                                metadata: input.metadata ?? {},
                                notifiedAt: input.notifiedAt ?? null,
                            },
                            select,
                        });

                        await tx.customer.update({
                            where: { id: input.customerId },
                            data: {
                                points: newBalance,
                                lifetimePoints: newLifetimePoints,
                            },
                        });

                        // Deliberately NOT logged here. This callback is the
                        // transaction — every millisecond spent inside it is a
                        // millisecond the row locks stay held, and console I/O
                        // is not free at ten concurrent awards per batch. The
                        // log is emitted after commit instead, where it also
                        // becomes truthful: a line saying a transaction was
                        // created, written before the commit that creates it,
                        // is a line that can be followed by a rollback.
                        return { transaction, signedPoints, newBalance };
                    },
                    { isolationLevel: "RepeatableRead" }
                ),
            { customerId: input.customerId, type: input.type }
        );

        logger.info("Transaction created", {
            transactionId: result.transaction.id,
            customerId: input.customerId,
            type: input.type,
            points: result.signedPoints,
            balanceAfter: result.newBalance,
        });

        // The transaction row itself, exactly as before — the wrapper above
        // exists only to carry the two figures the log line needs out past
        // the commit, and must not leak into what callers receive.
        return result.transaction;
    } catch (error) {
        logger.error("Failed to create transaction", {
            error: error?.message,
            input,
            module: "createTransaction.js",
        });
        return null;
    }
}
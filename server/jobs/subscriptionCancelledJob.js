import prisma from "../../app/db.server.js";
import { unauthenticated } from "../../app/shopify.server.js";
import { logger } from "../../app/utils/logger.js";
import { dbRetry } from "../../app/utils/retry/dbRetry.js";
import createTransaction from "../../app/controller/transaction/createTransaction.js";
import { syncCustomerConfig } from "../../app/controller/metafieldsSync/syncCustomerConfig.js";
import { getSubscriptionCancelResetSettings } from "../../app/controller/appSettings/subscriptionCancelResetSettings.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "subscriptionCancelledJob";

/**
 * Maximum number of PENDING jobs to process in a single poller cycle.
 *
 * @constant {number}
 */
const BATCH_SIZE = 50;

/**
 * How long (ms) a job may remain in PROCESSING before it is considered
 * stale and re-queued. Covers server crash mid-execution scenarios.
 *
 * @constant {number}
 */
const STALE_LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ─────────────────────────────────────────────────────────────────────────────
// Job Entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main entry point called by jobManager on each cron cycle.
 *
 * Handles SUBSCRIPTION_CANCELLED jobs, enqueued by
 * webhooks/appstle/subscription_cancelled (Appstle's subscription.cancelled
 * event, delivered via Svix). Resets the customer's current points balance
 * to 0 — lifetimePoints is left untouched (kept as a historical record) —
 * per the product decision in the Slack thread with Nick/Bez Agency
 * (2026-09-02): "on cancel: reset the current balance to zero ... lifetime
 * total can stay as a record."
 *
 * Payload shape confirmed against a real production subscription.cancelled
 * event: Appstle sends `{ data: <raw Shopify SubscriptionContract>, type:
 * "subscription.cancelled" }`, with `data.customer.id` as the Shopify
 * Customer GID and `data.status` === "CANCELLED".
 *
 * Same crash-recovery + batching + backoff shape as orderReversalJob.js.
 *
 * @returns {Promise<void>}
 */
export async function runSubscriptionCancelledJob() {
    await requeueStaleJobs();

    const jobs = await dbRetry(
        () =>
            prisma.job.findMany({
                where: {
                    type: "SUBSCRIPTION_CANCELLED",
                    status: "PENDING",
                    runAt: { lte: new Date() },
                },
                orderBy: { runAt: "asc" },
                take: BATCH_SIZE,
            }),
        { module: MODULE }
    );

    if (!jobs.length) {
        logger.info(MODULE, "No pending SUBSCRIPTION_CANCELLED jobs — skipping cycle");
        return;
    }

    logger.info(MODULE, `Processing ${jobs.length} SUBSCRIPTION_CANCELLED job(s)`);

    for (const job of jobs) {
        try {
            await processJob(job);
        } catch (err) {
            logger.error(MODULE, `Job #${job.id} threw outside its own error handling — skipping`, {
                shop: job.shop,
                error: err?.message,
            });
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stale Lock Recovery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resets SUBSCRIPTION_CANCELLED jobs stuck in PROCESSING back to PENDING.
 *
 * @returns {Promise<void>}
 */
async function requeueStaleJobs() {
    const staleThreshold = new Date(Date.now() - STALE_LOCK_TIMEOUT_MS);

    const { count } = await dbRetry(
        () =>
            prisma.job.updateMany({
                where: {
                    type: "SUBSCRIPTION_CANCELLED",
                    status: "PROCESSING",
                    lockedAt: { lte: staleThreshold },
                },
                data: {
                    status: "PENDING",
                    lockedAt: null,
                    lastError: "Re-queued after stale lock detected (possible server crash)",
                },
            }),
        { module: MODULE }
    );

    if (count > 0) {
        logger.warn(MODULE, `Re-queued ${count} stale SUBSCRIPTION_CANCELLED job(s)`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-Job Processor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Processes a single SUBSCRIPTION_CANCELLED job end-to-end.
 *
 * @param {{ id: number, shop: string, payload: object, attempts: number, maxAttempts: number }} job
 * @returns {Promise<void>}
 */
async function processJob(job) {
    const { id, shop, payload, attempts, maxAttempts } = job;

    // ── 1. Claim ──────────────────────────────────────────────────────────────
    const claim = await dbRetry(
        () =>
            prisma.job.updateMany({
                where: { id, status: "PENDING" },
                data: { status: "PROCESSING", lockedAt: new Date() },
            }),
        { module: MODULE, jobId: id }
    );

    if (claim.count === 0) {
        logger.info(MODULE, `Job #${id} already claimed by another process — skipping`, { shop });
        return;
    }

    logger.info(MODULE, `Processing job #${id}`, { shop, attempt: attempts + 1, maxAttempts });

    try {
        const { admin, session } = await unauthenticated.admin(shop);

        if (!session) throw new Error(`No active session for shop: ${shop}`);

        await mainHandler({ admin, session, shop, payload });

        // ── 3a. Success ───────────────────────────────────────────────────────
        await dbRetry(
            () =>
                prisma.job.update({
                    where: { id },
                    data: {
                        status: "COMPLETED",
                        lockedAt: null,
                        completedAt: new Date(),
                        attempts: attempts + 1,
                    },
                }),
            { module: MODULE, jobId: id }
        );

        logger.success(MODULE, `Job #${id} completed`, { shop });
    } catch (err) {
        const nextAttempt = attempts + 1;
        const exhausted = nextAttempt >= maxAttempts;

        // ── 3b. Failure — exponential backoff: 2min -> 4min -> 8min ────────────
        const backoffMs = exhausted
            ? 0
            : Math.min(2 ** nextAttempt * 60 * 1000, 30 * 60 * 1000);

        await dbRetry(
            () =>
                prisma.job.update({
                    where: { id },
                    data: {
                        status: exhausted ? "FAILED" : "PENDING",
                        lockedAt: null,
                        attempts: nextAttempt,
                        lastError: err?.message,
                        failedAt: exhausted ? new Date() : null,
                        runAt: exhausted ? undefined : new Date(Date.now() + backoffMs),
                    },
                }),
            { module: MODULE, jobId: id }
        ).catch((updateErr) => {
            logger.error(MODULE, `Failed to record failure for job #${id}`, { error: updateErr?.message });
        });

        if (exhausted) {
            logger.error(MODULE, `Job #${id} permanently failed`, { shop, error: err?.message });
        } else {
            logger.warn(MODULE, `Job #${id} failed — retrying in ${Math.round(backoffMs / 1000)}s`, {
                shop, attempt: nextAttempt, error: err?.message,
            });
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resets a customer's current points balance to 0 following a subscription
 * cancellation, and always records a SubscriptionCancelEvent audit row —
 * whether or not the reset was actually applied. lifetimePoints is left
 * untouched — see createTransaction.js's SUBSCRIPTION_CANCEL_RESET case for
 * the balance arithmetic.
 *
 * A reset is SKIPPED (audit row written, no Transaction) when:
 *   - the customer isn't enrolled in the loyalty program at all
 *   - the shop has turned this feature off (see subscriptionCancelResetSettings.js)
 *   - the balance is already 0 (nothing to do)
 * An admin can manually apply a skipped reset later from
 * /app/subscription-cancellations — see that page's _data.server.js.
 *
 * @param {Object} args
 * @param {Object} args.admin   - Shopify Admin API client
 * @param {Object} args.session - Shopify session (session.id required by createTransaction)
 * @param {string} args.shop    - Shop domain
 * @param {Object} args.payload - Job payload: { raw: <verified Appstle payload>, svixId }
 * @returns {Promise<void>}
 */
async function mainHandler({ admin, session, shop, payload }) {
    const contract = payload?.raw?.data;
    const svixId = payload?.svixId;

    const status = contract?.status;
    const customerGid = contract?.customer?.id;
    const contractGid = contract?.id;

    if (status !== "CANCELLED") {
        logger.warn(MODULE, "Unexpected status on subscription.cancelled event — skipping", {
            shop, svixId, status, contractGid,
        });
        return;
    }

    if (!customerGid) {
        logger.warn(MODULE, "No customer id in payload — skipping", { shop, svixId, contractGid });
        return;
    }

    // ── 1. Idempotency — look up any existing audit row for this event ─────
    // Its mere EXISTENCE (not just its final fields) is now the durability
    // marker — claimed in step 3 below, BEFORE the reset decision, not
    // after. Previously this row was only written at the very end, so a
    // crash between the reset committing and that final write left the
    // reset genuinely applied but no audit row to say so; a retry then saw
    // the balance already at 0 and recorded a false "ALREADY_ZERO",
    // permanently losing the real story. Claiming first means a crash past
    // that point always leaves something to resume from.
    let event = await dbRetry(
        () => prisma.subscriptionCancelEvent.findUnique({ where: { svixId } }),
        { module: MODULE, shop, svixId }
    );

    const isFinalized = event && (event.resetApplied || event.skipReason !== null);
    if (isFinalized) {
        logger.info(MODULE, "SubscriptionCancelEvent already finalized for this svixId — skipping (retry)", { shop, svixId });
        return;
    }
    // event is now either null (fresh event) or an unfinalized row claimed
    // by a previous attempt that crashed before finishing.
    const isResuming = !!event;

    // ── 2. If resuming, check whether the reset transaction ITSELF already
    // landed before the earlier crash — createTransaction succeeding but
    // the finalize step (5) never running is exactly the window this
    // guards. Without this check, redoing the decision below would treat
    // the now-already-0 balance as "ALREADY_ZERO" (nothing to do) instead
    // of recognizing a real reset already happened, permanently orphaning
    // that first transaction (never linked to this event) and mislabeling
    // the outcome. metadata.svixId is how the transaction below tags
    // itself specifically so this lookup is possible.
    const existingTransaction = isResuming
        ? await dbRetry(
            () => prisma.transaction.findFirst({
                where: { type: "SUBSCRIPTION_CANCEL_RESET", metadata: { path: ["svixId"], equals: svixId } },
            }),
            { module: MODULE, shop, svixId }
        )
        : null;

    // ── 3. Find the customer ────────────────────────────────────────────────
    const customer = await dbRetry(
        () => prisma.customer.findUnique({
            where: { shopifyId: customerGid },
            select: { id: true, shopifyId: true, points: true },
        }),
        { module: MODULE, shop, customerGid }
    );

    const previousBalance = event?.previousBalance ?? customer?.points ?? 0;
    const settings = await getSubscriptionCancelResetSettings(shop);

    // ── 4. Claim the audit row now — BEFORE deciding/applying the reset —
    // if this is genuinely the first time we're seeing this event. See
    // step 1's comment for why the claim has to happen here, not at the
    // end. Redoing the reset decision below (for the non-existingTransaction
    // path) is safe even on a resumed attempt — SUBSCRIPTION_CANCEL_RESET
    // always computes from the customer's LIVE balance (createTransaction.js),
    // so calling it again after the balance is already 0 is a harmless
    // no-op (signedPoints = -0), never a double deduction.
    if (!event) {
        const customerName =
            contract?.customer?.displayName
            || [contract?.customer?.firstName, contract?.customer?.lastName].filter(Boolean).join(" ")
            || null;

        event = await dbRetry(
            () =>
                prisma.subscriptionCancelEvent.create({
                    data: {
                        shop,
                        sessionId: session.id,
                        customerId: customer?.id ?? null,
                        customerShopifyId: customerGid,
                        customerEmail: contract?.customer?.email ?? null,
                        customerName,
                        subscriptionContractId: contractGid,
                        previousBalance,
                        svixId,
                        cancelledAt: contract?.updatedAt ? new Date(contract.updatedAt) : new Date(),
                    },
                }),
            { module: MODULE, shop, svixId }
        );
    }

    let resetApplied = false;
    let skipReason = null;
    let transactionId = null;

    if (existingTransaction) {
        // A resumed attempt whose reset already landed before the earlier
        // crash — just link it, don't redecide or create a second one.
        resetApplied = true;
        transactionId = existingTransaction.id;
        logger.info(MODULE, "Resuming a crashed attempt — reset transaction already existed, finalizing audit row only", {
            shop, svixId, transactionId: existingTransaction.id,
        });
    } else if (!customer) {
        skipReason = "CUSTOMER_NOT_ENROLLED";
        logger.info(MODULE, "Customer not enrolled in loyalty program — recording event, no reset", { shop, svixId, customerGid });
    } else if (!settings.enabled) {
        skipReason = "FEATURE_DISABLED";
        logger.info(MODULE, "Subscription-cancel-reset feature is off for this shop — recording event, no reset", { shop, svixId, customerId: customer.id });
    } else if (customer.points === 0) {
        skipReason = "ALREADY_ZERO";
        logger.info(MODULE, "Customer balance already 0 — recording event, nothing to reset", { shop, svixId, customerId: customer.id });
    } else if (customer.points < 0) {
        // Deliberately left untouched, not reset to 0 — a negative balance
        // is a real REVERSAL debt (see createTransaction.js's REVERSAL
        // case: it blocks new reward/prize claims until repaid, preventing
        // a customer from earning points, redeeming a reward, then
        // cancelling/refunding the order to keep it for free). Forgiving
        // that debt just because an unrelated subscription was also
        // cancelled would open a side door around that fraud check.
        skipReason = "NEGATIVE_BALANCE";
        logger.info(MODULE, "Customer balance is negative (debt) — recording event, deliberately not reset", { shop, svixId, customerId: customer.id, balance: customer.points });
    } else {
        // ── 5. Reset current balance to 0, lifetimePoints untouched ─────────
        const transaction = await createTransaction(
            {
                customerId: customer.id,
                type: "SUBSCRIPTION_CANCEL_RESET",
                status: "COMPLETED",
                reason: "Subscription cancelled — points balance reset",
                activity: "Points reset to 0 (subscription cancelled)",
                metadata: { subscriptionContractId: contractGid, svixId },
            },
            session
        );

        if (!transaction) {
            throw new Error(`createTransaction returned null for customer #${customer.id}`);
        }

        resetApplied = true;
        transactionId = transaction.id;

        logger.info(MODULE, "Points reset to 0 for cancelled subscription", {
            shop, customerId: customer.id, contractGid, previousBalance,
        });
    }

    // ── 6. Finalize the claimed audit row (UPDATE, not create — it already
    // exists from step 4, whether claimed fresh just now or resumed) ───────
    await dbRetry(
        () =>
            prisma.subscriptionCancelEvent.update({
                where: { id: event.id },
                data: {
                    customerId: customer?.id ?? null,
                    resetApplied,
                    skipReason,
                    transactionId,
                },
            }),
        { module: MODULE, shop, svixId }
    );

    // Non-critical — points already reset. syncCustomerConfig retries
    // transient failures internally and never throws, so no outer catch
    // is needed here.
    if (resetApplied) {
        await syncCustomerConfig(admin, customer.shopifyId);
    }

    logger.success(MODULE, "Subscription cancel event handled", { shop, customerId: customer?.id ?? null, resetApplied, skipReason });
}

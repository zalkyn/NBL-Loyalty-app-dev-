import prisma from "db-server";
import createTransaction from "app/controller/transaction/createTransaction.js";
import { syncCustomerConfig } from "app/controller/metafieldsSync/syncCustomerConfig.js";
import { updateSubscriptionCancelResetSettings, getSubscriptionCancelResetSettings } from "app/controller/appSettings/subscriptionCancelResetSettings.js";
import { MANUAL_RESET_MODES, cancelResetDeduction } from "app/utils/subscriptionCancelReset.js";
import { logger } from "app/utils/logger.js";
import { restorableTotal, restoreRemaining, pickResetSibling } from "./_data";

/** @constant {string} Module identifier for structured logging */
const MODULE = "layout/subscription-cancellations/_data.server.js";

// ─────────────────────────────────────────────────────────────────────────────
// Server-only action logic, split out of route.jsx so the action stays a
// thin dispatcher. Never import this file from client code (_hooks.js or
// components/) — it pulls in prisma directly.
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch + verify a SubscriptionCancelEvent belongs to this session. */
async function getVerifiedEvent(sessionId, id) {
    const parsed = parseInt(id, 10);
    if (!Number.isFinite(parsed)) return null;

    const event = await prisma.subscriptionCancelEvent.findFirst({
        where: { id: parsed, sessionId },
        // Restore cap = what the reset actually removed (see restoreRemaining).
        include: { transaction: { select: { points: true } } },
    });
    return event;
}

/**
 * Sum of every positive transaction a customer has had since `since` —
 * what KEEP_EARNED_AFTER mode keeps (see utils/subscriptionCancelReset.js).
 * createTransaction recomputes this inside its own DB transaction for the
 * actual write; this copy only decides up front whether there's anything
 * to remove at all.
 */
async function pointsAddedSince(customerId, since) {
    const added = await prisma.transaction.aggregate({
        where: { customerId, points: { gt: 0 }, createdAt: { gt: since } },
        _sum: { points: true },
    });
    return added._sum.points ?? 0;
}

/**
 * For the confirm modal: how many points a manual reset would remove right
 * now for each actionable event on the page, under the current mode. One
 * query for the page's customers, not one per row. Read-only.
 *
 * @param {Array<Object>} events - Rows with `customer` ({ id, points }) included
 * @param {string} mode          - One of MANUAL_RESET_MODES
 * @returns {Promise<Array<Object>>} The same events, actionable ones with `pointsToRemove`
 */
export async function attachResetPreview(events, mode) {
    const pending = events.filter((e) => !e.resetApplied && e.customer && e.customer.points > 0);
    if (!pending.length) return events;

    let added = [];
    if (mode === "KEEP_EARNED_AFTER") {
        const earliest = new Date(Math.min(...pending.map((e) => new Date(e.cancelledAt).getTime())));
        added = await prisma.transaction.findMany({
            where: { customerId: { in: [...new Set(pending.map((e) => e.customer.id))] }, points: { gt: 0 }, createdAt: { gt: earliest } },
            select: { customerId: true, points: true, createdAt: true },
        });
    }

    return events.map((e) => {
        if (!pending.includes(e)) return e;
        const since = new Date(e.cancelledAt).getTime();
        const addedAfter = added
            .filter((t) => t.customerId === e.customer.id && new Date(t.createdAt).getTime() > since)
            .reduce((n, t) => n + t.points, 0);
        return { ...e, pointsToRemove: cancelResetDeduction(e.customer.points, addedAfter, mode) };
    });
}

/**
 * Applies the reset for one already-recorded (but skipped) event: resolves
 * the customer live (they may have enrolled since the event was first
 * recorded as CUSTOMER_NOT_ENROLLED), writes the SUBSCRIPTION_CANCEL_RESET
 * transaction, and marks the event resolved. If the live balance is already
 * 0, no transaction is written — the event is resolved as ALREADY_ZERO
 * instead (`alreadyZero: true`). Returns `ok: false` on any failure instead
 * of throwing, so bulk callers can just skip and continue.
 *
 * In KEEP_EARNED_AFTER mode, points added after the cancellation are kept.
 * If that leaves nothing to remove, no transaction is written either — the
 * event is resolved as NOTHING_BEFORE_CANCEL (`nothingToRemove: true`).
 *
 * @param {Object} event   - A verified SubscriptionCancelEvent row
 * @param {Object} session - Shopify session
 * @param {Object} admin   - Shopify Admin API client
 * @param {string} mode    - One of MANUAL_RESET_MODES (the shop's setting)
 * @returns {Promise<{ok: true, alreadyZero?: true, nothingToRemove?: true, removed?: number, customerShopifyId: string} | {ok: false, reason: string}>}
 */
async function applyManualReset(event, session, admin, mode) {
    if (event.resetApplied) return { ok: false, reason: "Already reset." };

    let customerId = event.customerId;
    let customerShopifyId = event.customerShopifyId;
    let currentPoints;

    if (!customerId) {
        const customer = await prisma.customer.findUnique({
            where: { shopifyId: event.customerShopifyId },
            select: { id: true, shopifyId: true, points: true },
        });
        if (!customer) return { ok: false, reason: "Customer still isn't enrolled in the loyalty program." };
        customerId = customer.id;
        customerShopifyId = customer.shopifyId;
        currentPoints = customer.points;
    } else {
        const customer = await prisma.customer.findUnique({
            where: { id: customerId },
            select: { points: true },
        });
        if (!customer) return { ok: false, reason: "Customer record no longer exists." };
        currentPoints = customer.points;
    }

    // Live re-check, not event.skipReason — that field only reflects the
    // situation at the time this event was first evaluated (possibly never,
    // for the CUSTOMER_NOT_ENROLLED/FEATURE_DISABLED cases that reach this
    // point). A balance that was fine then can be negative now — e.g. an
    // unrelated REVERSAL debt from a cancelled/refunded order since then —
    // and createTransaction's SUBSCRIPTION_CANCEL_RESET always resets from
    // the LIVE balance with no floor of its own (see its case there), so
    // resetting a negative balance would ADD points back, forgiving that
    // debt. That's the exact fraud-prevention hole
    // subscriptionCancelledJob.js's own live check was built to close for
    // the automatic path (see its NEGATIVE_BALANCE case) — this closes the
    // same hole for the manual path here, which previously trusted the
    // stale skipReason instead of checking live.
    if (currentPoints < 0) {
        return { ok: false, reason: "This customer has a negative balance (existing debt) — resetting it is not supported here." };
    }
    // Balance already 0 — typically a second cancel event for a customer
    // whose balance an earlier event's reset already zeroed (e.g. two
    // subscriptions cancelled minutes apart). Previously this returned an
    // error WITHOUT touching the event, so it stayed actionable forever:
    // "Reset Now" kept showing, every click hit this same error, and bulk
    // reset skipped it on every run. Resolve it as ALREADY_ZERO instead
    // (a NON_ACTIONABLE_SKIP_REASONS value — drops it out of Needs Action,
    // the profile's "Needs Reset" card and bulk selection).
    //
    // resetApplied deliberately stays false — no points were deducted by
    // THIS event, so "Restore Points" (gated on resetApplied) must not
    // become available for it, or an admin could restore previousBalance
    // a second time on top of the event that actually did the reset.
    //
    // updateMany guarded on resetApplied: false so a concurrent real reset
    // of this same event (another admin/tab) is never relabeled.
    if (currentPoints === 0) {
        await prisma.subscriptionCancelEvent.updateMany({
            where: { id: event.id, resetApplied: false },
            data: { skipReason: "ALREADY_ZERO", customerId },
        });
        return { ok: true, alreadyZero: true, customerShopifyId };
    }

    const keepEarnedAfter = mode === "KEEP_EARNED_AFTER";

    // Nothing left from before the cancellation — every point came after it
    // and this mode keeps those. Resolve without a transaction, same shape
    // as ALREADY_ZERO above (resetApplied stays false: nothing deducted, so
    // nothing to restore), guarded the same way against a concurrent reset.
    if (keepEarnedAfter && cancelResetDeduction(currentPoints, await pointsAddedSince(customerId, event.cancelledAt), mode) === 0) {
        await prisma.subscriptionCancelEvent.updateMany({
            where: { id: event.id, resetApplied: false },
            data: { skipReason: "NOTHING_BEFORE_CANCEL", customerId },
        });
        return { ok: true, nothingToRemove: true, customerShopifyId };
    }

    const transaction = await createTransaction(
        {
            customerId,
            type: "SUBSCRIPTION_CANCEL_RESET",
            status: "COMPLETED",
            reason: keepEarnedAfter
                ? "Subscription cancelled — points from before cancelling removed (manual)"
                : "Subscription cancelled — points balance reset (manual)",
            activity: keepEarnedAfter
                ? "Points from before cancelling removed (subscription cancelled, applied manually by admin; points earned since kept)"
                : "Points reset to 0 (subscription cancelled, applied manually by admin)",
            metadata: { subscriptionContractId: event.subscriptionContractId, svixId: event.svixId, manualReset: true, manualResetMode: mode },
            ...(keepEarnedAfter ? { keepPointsAddedAfter: event.cancelledAt } : {}),
        },
        session
    );

    if (!transaction) return { ok: false, reason: "Failed to write the reset transaction." };

    await prisma.subscriptionCancelEvent.update({
        where: { id: event.id },
        data: { resetApplied: true, resolvedManually: true, transactionId: transaction.id, customerId },
    });

    await syncCustomerConfig(admin, customerShopifyId);

    return { ok: true, removed: Math.max(0, -transaction.points), balanceAfter: transaction.balanceAfter, customerShopifyId };
}

/** The shop's manual reset mode, read fresh for every reset action. */
async function manualResetModeFor(shop) {
    return (await getSubscriptionCancelResetSettings(shop)).manualResetMode;
}

// ── RESET SIBLINGS (loader) ──────────────────────────────────────────────

/**
 * For every ALREADY_ZERO event in `events`, finds the same customer's
 * cancellation that actually deducted points (resetApplied: true) and
 * attaches it as `resetBySibling: { id, cancelledAt }`.
 *
 * An ALREADY_ZERO row has no "Restore Points" on purpose (nothing was
 * deducted by it — see applyManualReset above), which otherwise reads as a
 * missing button. When the same customer has another cancellation that DID
 * reset points (e.g. two subscriptions cancelled minutes apart), the table
 * points the admin at that row instead. Read-only; one query bounded by the
 * current page's rows, not a per-row lookup.
 *
 * @param {string} sessionId
 * @param {Array<Object>} events - SubscriptionCancelEvent rows for the current page
 * @returns {Promise<Array<Object>>} The same events, ALREADY_ZERO ones with `resetBySibling` when found
 */
export async function attachResetSiblings(sessionId, events) {
    const zeroCustomerIds = [...new Set(
        events.filter((e) => e.skipReason === "ALREADY_ZERO" && e.customerId).map((e) => e.customerId)
    )];
    if (!zeroCustomerIds.length) return events;

    const siblings = await prisma.subscriptionCancelEvent.findMany({
        where: { sessionId, customerId: { in: zeroCustomerIds }, resetApplied: true },
        orderBy: { cancelledAt: "desc" },
        select: { id: true, customerId: true, cancelledAt: true, resetApplied: true, previousBalance: true, restoredAmount: true, transaction: { select: { points: true } } },
    });

    const byCustomer = new Map();
    for (const s of siblings) {
        if (!byCustomer.has(s.customerId)) byCustomer.set(s.customerId, []);
        byCustomer.get(s.customerId).push(s);
    }

    return events.map((e) => {
        const sibling = e.skipReason === "ALREADY_ZERO" ? pickResetSibling(byCustomer.get(e.customerId) ?? []) : null;
        return sibling ? { ...e, resetBySibling: sibling } : e;
    });
}

// ── RESET ONE ─────────────────────────────────────────────────────────────

export async function handleResetPoints({ formData, session, admin }) {
    const submitType = "resetPoints";
    const eventId = formData.get("eventId");
    if (!eventId) return { message: "Event ID is required.", status: "error", submitType };

    try {
        const event = await getVerifiedEvent(session.id, eventId);
        if (!event) return { message: "Event not found or access denied.", status: "error", submitType };

        const result = await applyManualReset(event, session, admin, await manualResetModeFor(session.shop));
        if (!result.ok) return { message: result.reason, status: "error", submitType, eventId: event.id };

        const message = result.alreadyZero
            ? "Balance is already 0 — marked as resolved."
            : result.nothingToRemove
                ? "Nothing to remove — all of this customer's points were earned after cancelling. Marked as resolved."
                : result.balanceAfter > 0
                    ? `${result.removed.toLocaleString()} points removed. ${result.balanceAfter.toLocaleString()} points earned after cancelling were kept.`
                    : "Points reset to 0.";
        return { message, status: "success", submitType, eventId: event.id };
    } catch (err) {
        logger.error(MODULE, "Manual reset failed", { error: err?.message, eventId });
        return { message: err.message || "Failed to reset points.", status: "error", submitType };
    }
}

// ── BULK RESET ───────────────────────────────────────────────────────────

export async function handleBulkResetPoints({ formData, session, admin }) {
    const submitType = "bulkResetPoints";
    let eventIds;

    try {
        eventIds = JSON.parse(formData.get("eventIds") || "[]");
        if (!Array.isArray(eventIds)) throw new Error();
    } catch {
        return { message: "Invalid event IDs.", status: "error", submitType };
    }

    if (!eventIds.length) return { message: "No cancellations selected.", status: "error", submitType };

    try {
        const results = { success: [], alreadyZero: [], nothingToRemove: [], failed: [] };
        const mode = await manualResetModeFor(session.shop);

        // Batch-verify all selected ids in ONE query instead of a findFirst
        // per id (getVerifiedEvent, called in a loop) — that turned a
        // 50-item bulk selection into 50 serialized round trips just to
        // check ownership. The writes below still run one at a time on
        // purpose: each does a real points-affecting Transaction plus a
        // Shopify Admin API call via syncCustomerConfig inside
        // applyManualReset, and those need to stay serialized for
        // correctness/rate-limit safety, not batched.
        const parsedIds = eventIds.map((id) => parseInt(id, 10)).filter(Number.isFinite);
        const verifiedEvents = await prisma.subscriptionCancelEvent.findMany({
            where: { id: { in: parsedIds }, sessionId: session.id },
        });
        const verifiedById = new Map(verifiedEvents.map((e) => [e.id, e]));

        for (const id of eventIds) {
            const event = verifiedById.get(parseInt(id, 10));
            if (!event) { results.failed.push(id); continue; }

            const result = await applyManualReset(event, session, admin, mode);
            if (!result.ok) {
                logger.warn(MODULE, "Bulk reset: skipped one event", { eventId: event.id, reason: result.reason });
                results.failed.push(id);
                continue;
            }
            (result.alreadyZero ? results.alreadyZero : result.nothingToRemove ? results.nothingToRemove : results.success).push(id);
        }

        const parts = [`${results.success.length} customer${results.success.length === 1 ? "" : "s"} reset.`];
        if (results.alreadyZero.length) parts.push(`${results.alreadyZero.length} already at 0 (marked resolved).`);
        if (results.nothingToRemove.length) parts.push(`${results.nothingToRemove.length} had only points earned after cancelling, kept (marked resolved).`);
        if (results.failed.length) parts.push(`${results.failed.length} skipped (already resolved or not eligible).`);

        return {
            message: parts.join(" "),
            status: "success",
            submitType,
            updatedIds: [...results.success, ...results.alreadyZero, ...results.nothingToRemove],
        };
    } catch (err) {
        logger.error(MODULE, "Bulk reset failed", { error: err?.message });
        return { message: err.message || "Bulk reset failed.", status: "error", submitType };
    }
}

// ── RESTORE POINTS ────────────────────────────────────────────────────────

export async function handleRestorePoints({ formData, session, admin }) {
    const submitType = "restorePoints";
    const eventId = formData.get("eventId");
    const rawAmount = formData.get("amount");

    if (!eventId) return { message: "Event ID is required.", status: "error", submitType };

    const amount = parseInt(rawAmount, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { message: "Enter a valid, positive amount.", status: "error", submitType };
    }

    try {
        const event = await getVerifiedEvent(session.id, eventId);
        if (!event) return { message: "Event not found or access denied.", status: "error", submitType };

        if (!event.resetApplied) {
            return { message: "Nothing to restore — points were never reset for this cancellation.", status: "error", submitType, eventId: event.id };
        }

        // Hard cap at what THIS reset actually took — its linked
        // transaction, not previousBalance (see restoreRemaining in
        // _data.js for why those differ). Restoring more than that is out
        // of scope for this tool on purpose (see route.jsx's header
        // comment): a deliberate bonus is what the separate generic Adjust
        // Points tool is for, which doesn't carry this event's "undo a
        // specific reset" meaning.
        if (restorableTotal(event) === 0) {
            // e.g. the second of two cancellations reset at the same moment:
            // the first already zeroed the balance, so this one took nothing.
            return { message: "Nothing to restore — this reset didn't remove any points.", status: "error", submitType, eventId: event.id };
        }
        const remaining = restoreRemaining(event);
        if (remaining <= 0) {
            return { message: "Already fully restored.", status: "error", submitType, eventId: event.id };
        }
        if (amount > remaining) {
            return {
                message: `Only ${remaining.toLocaleString()} pts remain restorable for this cancellation.`,
                status: "error", submitType, eventId: event.id,
            };
        }

        // ── Reserve the amount FIRST, atomically, before touching points ──
        // The `remaining`/cap check above reads restoredAmount, then this
        // writes it — two requests racing (double-click, two admin tabs)
        // could both pass that check against the same stale value and both
        // proceed, together restoring more than the reset removed.
        // Closing that requires the check-and-write to be one atomic
        // operation: this updateMany's `where` re-asserts the EXACT
        // restoredAmount this request read (optimistic-lock style) — if
        // another request already changed it in between, zero rows match
        // and `reserved.count` is 0, so this request backs off instead of
        // also writing. Only the request that wins this gets to create the
        // points transaction below.
        const reserved = await prisma.subscriptionCancelEvent.updateMany({
            where: { id: event.id, restoredAmount: event.restoredAmount },
            data: { restoredAmount: { increment: amount }, lastRestoredAt: new Date() },
        });

        if (reserved.count === 0) {
            return {
                message: "This cancellation was just updated by someone else — please refresh and try again.",
                status: "error", submitType, eventId: event.id,
            };
        }

        // event.customerId is guaranteed set here: resetApplied can only be
        // true after createTransaction succeeded for a real customerId (see
        // applyManualReset above and subscriptionCancelledJob.js's
        // mainHandler — both only ever set resetApplied alongside a
        // customerId).
        const transaction = await createTransaction(
            {
                customerId: event.customerId,
                type: "SUBSCRIPTION_CANCEL_RESTORE",
                points: amount,
                status: "COMPLETED",
                reason: "Subscription cancellation reset — points restored (manual)",
                activity: `+${amount.toLocaleString()} points restored (subscription cancellation reset reversed)`,
                metadata: { subscriptionCancelEventId: event.id },
            },
            session
        );

        if (!transaction) {
            // The reservation above already committed, but the actual
            // points transaction failed — roll the reservation back so the
            // cap stays accurate (otherwise this amount would look
            // "restored" while the customer never actually got it).
            await prisma.subscriptionCancelEvent.update({
                where: { id: event.id },
                data: { restoredAmount: { decrement: amount } },
            }).catch((rollbackErr) => {
                logger.error(MODULE, "Failed to roll back reserved restore amount after transaction failure — restoredAmount may now overstate what was actually given back", {
                    error: rollbackErr?.message, eventId: event.id, amount,
                });
            });
            return { message: "Failed to restore points. Please try again.", status: "error", submitType, eventId: event.id };
        }

        await syncCustomerConfig(admin, event.customerShopifyId);

        return { message: `${amount.toLocaleString()} points restored.`, status: "success", submitType, eventId: event.id };
    } catch (err) {
        logger.error(MODULE, "Restore points failed", { error: err?.message, eventId, amount });
        return { message: err.message || "Failed to restore points.", status: "error", submitType };
    }
}

// ── SETTINGS TOGGLE ─────────────────────────────────────────────────────

export async function handleUpdateSettings({ formData, session }) {
    const submitType = "updateSettings";
    // Each setting is saved on its own — only the field that was sent
    // changes (a missing "enabled" must not read as false).
    const rawEnabled = formData.get("enabled");
    const rawMode = formData.get("manualResetMode");
    const enabled = rawEnabled === null ? undefined : rawEnabled === "true";
    const manualResetMode = rawMode === null ? undefined : String(rawMode);

    if (enabled === undefined && manualResetMode === undefined) {
        return { message: "Nothing to update.", status: "error", submitType };
    }
    if (manualResetMode !== undefined && !MANUAL_RESET_MODES.includes(manualResetMode)) {
        return { message: "Choose a valid manual reset option.", status: "error", submitType };
    }

    try {
        const settings = await updateSubscriptionCancelResetSettings({ shop: session.shop, sessionId: session.id, enabled, manualResetMode });
        const message = manualResetMode !== undefined
            ? (settings.manualResetMode === "KEEP_EARNED_AFTER"
                ? "Manual resets will now keep points earned after cancelling."
                : "Manual resets will now reset the whole balance to 0.")
            : `Automatic points reset on cancellation is now ${settings.enabled ? "ON" : "OFF"}.`;
        return { message, status: "success", submitType, settings };
    } catch (err) {
        logger.error(MODULE, "Update settings failed", { error: err?.message });
        return { message: "Failed to update settings.", status: "error", submitType };
    }
}

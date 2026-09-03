import prisma from "db-server";
import createTransaction from "app/controller/transaction/createTransaction.js";
import { syncCustomerConfig } from "app/controller/metafieldsSync/syncCustomerConfig.js";
import { updateSubscriptionCancelResetSettings } from "app/controller/appSettings/subscriptionCancelResetSettings.js";
import { logger } from "app/utils/logger.js";

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

    const event = await prisma.subscriptionCancelEvent.findFirst({ where: { id: parsed, sessionId } });
    return event;
}

/**
 * Applies the reset for one already-recorded (but skipped) event: resolves
 * the customer live (they may have enrolled since the event was first
 * recorded as CUSTOMER_NOT_ENROLLED), writes the SUBSCRIPTION_CANCEL_RESET
 * transaction, and marks the event resolved. Returns null on any failure
 * instead of throwing, so bulk callers can just skip and continue.
 *
 * @param {Object} event   - A verified SubscriptionCancelEvent row
 * @param {Object} session - Shopify session
 * @param {Object} admin   - Shopify Admin API client
 * @returns {Promise<{ok: true, customerShopifyId: string} | {ok: false, reason: string}>}
 */
async function applyManualReset(event, session, admin) {
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
    if (currentPoints === 0) {
        return { ok: false, reason: "Nothing to reset — balance is already 0." };
    }

    const transaction = await createTransaction(
        {
            customerId,
            type: "SUBSCRIPTION_CANCEL_RESET",
            status: "COMPLETED",
            reason: "Subscription cancelled — points balance reset (manual)",
            activity: "Points reset to 0 (subscription cancelled, applied manually by admin)",
            metadata: { subscriptionContractId: event.subscriptionContractId, svixId: event.svixId, manualReset: true },
        },
        session
    );

    if (!transaction) return { ok: false, reason: "Failed to write the reset transaction." };

    await prisma.subscriptionCancelEvent.update({
        where: { id: event.id },
        data: { resetApplied: true, resolvedManually: true, transactionId: transaction.id, customerId },
    });

    await syncCustomerConfig(admin, customerShopifyId);

    return { ok: true, customerShopifyId };
}

// ── RESET ONE ─────────────────────────────────────────────────────────────

export async function handleResetPoints({ formData, session, admin }) {
    const submitType = "resetPoints";
    const eventId = formData.get("eventId");
    if (!eventId) return { message: "Event ID is required.", status: "error", submitType };

    try {
        const event = await getVerifiedEvent(session.id, eventId);
        if (!event) return { message: "Event not found or access denied.", status: "error", submitType };

        const result = await applyManualReset(event, session, admin);
        if (!result.ok) return { message: result.reason, status: "error", submitType, eventId: event.id };

        return { message: "Points reset to 0.", status: "success", submitType, eventId: event.id };
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
        const results = { success: [], failed: [] };

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

            const result = await applyManualReset(event, session, admin);
            if (!result.ok) {
                logger.warn(MODULE, "Bulk reset: skipped one event", { eventId: event.id, reason: result.reason });
                results.failed.push(id);
                continue;
            }
            results.success.push(id);
        }

        const msg = results.failed.length
            ? `${results.success.length} reset. ${results.failed.length} skipped (already resolved or not eligible).`
            : `${results.success.length} customer${results.success.length > 1 ? "s" : ""} reset.`;

        return { message: msg, status: "success", submitType, updatedIds: results.success };
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

        // Hard cap at what THIS reset actually took — restoring more than
        // that is out of scope for this tool on purpose (see route.jsx's
        // header comment): a deliberate bonus beyond the original balance
        // is what the separate generic Adjust Points tool is for, which
        // doesn't carry this event's "undo a specific reset" meaning.
        const remaining = event.previousBalance - event.restoredAmount;
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
        // proceed, together restoring more than previousBalance allows.
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
    const enabled = formData.get("enabled") === "true";

    try {
        const settings = await updateSubscriptionCancelResetSettings({ shop: session.shop, sessionId: session.id, enabled });
        return {
            message: `Automatic points reset on cancellation is now ${settings.enabled ? "ON" : "OFF"}.`,
            status: "success", submitType, settings,
        };
    } catch (err) {
        logger.error(MODULE, "Update settings failed", { error: err?.message });
        return { message: "Failed to update settings.", status: "error", submitType };
    }
}

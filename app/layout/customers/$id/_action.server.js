import prisma from "db-server";
import createTransaction from "@controller/transaction/createTransaction";
import { syncCustomerConfig } from "app/controller/metafieldsSync/syncCustomerConfig";
import enqueueDiscountDeleteJob from "app/controller/jobs/enqueueDiscountDeleteJob.js";
import { logger } from "app/utils/logger.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "layout/customers/$id/_action.server.js";

/**
 * Handles manual point adjustments (add/remove) for a customer by an admin.
 *
 * Flow:
 *  1. Parse & validate form input (customerId, mode, amount, reason).
 *  2. Convert amount into a signed value based on mode ("add" -> +amount, "remove" -> -amount).
 *  3. Create an ADJUST-type transaction via `createTransaction`.
 *  4. Sync the customer's metafield config in Shopify so the storefront reflects the new balance.
 *  5. Return a structured result object indicating success/error, suitable for returning
 *     directly from a Remix/Next.js action handler.
 *
 * @async
 * @function handleAdjustPoints
 *
 * @param {Object} params
 * @param {FormData} params.formData - Incoming form data submitted from the admin UI.
 *   Expected fields:
 *     - customerId {string} Internal customer ID (numeric string, required)
 *     - shopifyId  {string} Shopify customer GID/ID (required for metafield sync)
 *     - mode       {"add"|"remove"} Whether points are being added or removed
 *     - amount     {string} Positive integer amount of points to adjust (numeric string)
 *     - reason     {string} [optional] Custom reason/note for the adjustment
 * @param {Object} params.session - Current auth/session object, passed through to `createTransaction`.
 * @param {Object} params.admin - Shopify Admin API client, used for metafield sync.
 *
 * @returns {Promise<{
 *   message: string,
 *   status: "success" | "error",
 *   submitType: string,
 *   balanceAfter?: number
 * }>} Result object describing the outcome of the adjustment.
 *   - On validation failure: `{ message, status: "error", submitType }`
 *   - On success: `{ message, status: "success", submitType, balanceAfter }`
 *   - On thrown error: `{ message, status: "error", submitType }`
 */
export async function handleAdjustPoints({ formData, session, admin }) {
    // Identifies this action's type in the returned result (useful for UI to know which form submitted)
    const submitType = "adjustPoints";

    // --- Parse incoming form fields ---
    const customerId = parseInt(formData.get("customerId"), 10);
    const shopifyId = formData.get("shopifyId");
    const mode = formData.get("mode");   // "add" | "remove"
    const amount = parseInt(formData.get("amount"), 10);
    const reason = formData.get("reason")?.trim() || null;

    // --- Validation ---
    if (!customerId) {
        return { message: "Customer ID is required.", status: "error", submitType };
    }
    if (!["add", "remove"].includes(mode)) {
        return { message: "Invalid mode.", status: "error", submitType };
    }
    if (!amount || amount <= 0) {
        return { message: "Points must be greater than 0.", status: "error", submitType };
    }

    // ADJUST transaction type accepts a signed value:
    // positive points => add to balance, negative points => subtract from balance
    const signedPoints = mode === "add" ? amount : -amount;

    // Human-readable helpers used across reason/activity/message for consistency
    const formattedAmount = amount.toLocaleString(); // e.g. 1500 -> "1,500"
    const actionWord = mode === "add" ? "added" : "removed";

    try {
        // Create the point-adjustment transaction record
        const tx = await createTransaction({
            customerId,
            type: "ADJUST",
            points: signedPoints,
            // Use custom reason if provided, otherwise fall back to an auto-generated one
            reason: reason ?? `Admin ${actionWord} ${formattedAmount} points`,
            activity: `Admin ${actionWord} ${formattedAmount} points`,
            status: "COMPLETED",
        }, session);

        // createTransaction returning falsy means the transaction wasn't created
        if (!tx) {
            logger.error("Transaction creation returned falsy result", {
                module: MODULE,
                customerId,
                mode,
                amount,
            });
            return { message: "Failed to adjust points.", status: "error", submitType };
        }

        // Keep Shopify customer metafields in sync with the new points balance
        await syncCustomerConfig(admin, shopifyId);

        return {
            message: `${formattedAmount} points ${actionWord} successfully.`,
            status: "success",
            submitType,
            balanceAfter: tx.balanceAfter,
        };
    } catch (err) {
        // Log full error with context for debugging, but return a safe message to the client
        logger.error("Failed to adjust points", {
            module: MODULE,
            error: err?.message,
            customerId,
            mode,
            amount,
        });
        return { message: err.message || "Failed to adjust points.", status: "error", submitType };
    }
}

/**
 * Cancels a customer's redeemed reward voucher and refunds the points it
 * cost — admin-only control from the customer details page.
 *
 * Only rewards that are still ACTIVE and NOT yet used at checkout
 * (discountUsed === false) can be cancelled this way. A voucher the
 * customer already applied at checkout is blocked from cancellation here —
 * refunding points for a discount that's already been spent would be a
 * free giveaway, and the voucher code itself can't be un-applied from a
 * completed order anyway. Already-cancelled rewards are also blocked to
 * avoid double refunds.
 *
 * Mirrors the (now-fixed) refund pattern in
 * physical-prizes-claims-manage/_data.server.js: only the Reward's own
 * status is updated directly — customer.points and lifetimePoints are
 * updated exactly once, atomically, inside createTransaction() itself.
 * Manually incrementing points here AND then also calling createTransaction
 * with a positive ADJUST would double-credit the refund.
 *
 * @param {Object} params
 * @param {FormData} params.formData - Expected field: rewardId (numeric string, required)
 * @param {Object} params.session - Current auth/session object; used to verify
 *   the reward belongs to this shop and passed through to createTransaction.
 * @param {Object} params.admin - Shopify Admin API client, used for metafield sync.
 * @returns {Promise<{ message: string, status: "success"|"error", submitType: string, rewardId?: number }>}
 */
export async function handleCancelReward({ formData, session, admin }) {
    const submitType = "cancelReward";
    const rewardId = formData.get("rewardId");

    if (!rewardId) {
        return { message: "Reward ID is required.", status: "error", submitType };
    }

    const rewardIdInt = parseInt(rewardId, 10);
    if (!Number.isFinite(rewardIdInt)) {
        return { message: "Invalid reward ID.", status: "error", submitType };
    }

    try {
        // Verify the reward belongs to a customer in THIS shop's session —
        // Reward rows are keyed by an auto-increment id shared across all
        // shops in the database, so this check is essential, not optional.
        const reward = await prisma.reward.findFirst({
            where: { id: rewardIdInt },
            include: { customer: { select: { id: true, shopifyId: true, sessionId: true } } },
        });

        if (!reward || reward.customer.sessionId !== session.id) {
            return { message: "Reward not found or access denied.", status: "error", submitType };
        }

        if (reward.status === "CANCELLED") {
            return { message: "This reward is already cancelled.", status: "error", submitType };
        }
        if (reward.discountUsed === true || reward.status === "USED") {
            return {
                message: "This reward has already been used at checkout and can't be cancelled.",
                status: "error", submitType,
            };
        }

        const pointsCost = Math.abs(Number(reward.pointsCost) || 0);
        const title = reward.title || "Voucher";

        await prisma.reward.update({
            where: { id: rewardIdInt },
            data: { status: "CANCELLED" },
        });

        // Non-critical, fire-and-forget by design — enqueueDiscountDeleteJob
        // itself never throws (see its own doc comment), and no-ops if the
        // shop hasn't turned this on (Customize-adjacent settings, not
        // widget config — see discountDeleteSettings.js) or this reward
        // pre-dates discountNodeId being captured at creation time.
        enqueueDiscountDeleteJob({
            shop: session.shop,
            discountNodeId: reward.discountNodeId,
            source: "reward_cancel",
            entityType: "reward",
            entityId: rewardIdInt,
        });

        const transaction = await createTransaction({
            customerId: reward.customer.id,
            type: "ADJUST",
            rewardId: rewardIdInt,
            reason: `Points refunded — reward cancelled: ${title}`,
            activity: `+${pointsCost.toLocaleString()} points refunded for cancelled reward: ${title}`,
            points: pointsCost,
            status: "COMPLETED",
        }, session);

        if (!transaction) {
            // Reward is already marked CANCELLED at this point — that part
            // succeeded and shouldn't be rolled back (the voucher must stay
            // unusable either way). Only the refund itself failed, so say so
            // clearly rather than reporting a clean success.
            logger.error("Reward cancelled but points refund failed", {
                module: MODULE, rewardId: rewardIdInt, customerId: reward.customer.id, pointsCost,
            });
            return {
                message: "Reward cancelled, but the points refund failed. Please adjust points manually.",
                status: "error", submitType, rewardId: rewardIdInt,
            };
        }

        await syncCustomerConfig(admin, reward.customer.shopifyId);

        return {
            message: `Reward cancelled. ${pointsCost.toLocaleString()} points refunded.`,
            status: "success", submitType, rewardId: rewardIdInt,
            balanceAfter: transaction.balanceAfter,
        };
    } catch (err) {
        logger.error("Cancel reward failed", { module: MODULE, error: err?.message, rewardId: rewardIdInt });
        return { message: err.message || "Failed to cancel reward.", status: "error", submitType };
    }
}
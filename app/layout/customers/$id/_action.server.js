import createTransaction from "@controller/transaction/createTransaction";
import { syncCustomerConfig } from "app/controller/metafieldsSync/syncCustomerConfig";
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
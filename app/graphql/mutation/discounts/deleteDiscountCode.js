import { logger } from "../../../utils/logger.js";
import { shopifyGraphqlWithRetry } from "../../../utils/shopifyGraphql.js";

const MODULE = "graphql/mutation/discounts/deleteDiscountCode.js";

/**
 * Deletes a discount code from Shopify by its codeDiscountNode GID.
 *
 * There is no "delete by code string" mutation in the Admin API — only by
 * ID — which is exactly why Reward.discountNodeId / Referral.discountNodeId
 * are captured at creation time (see their schema comments) instead of
 * looked up here. See discountDeleteJob.js for the caller.
 *
 * Retries internally on transient network failure / Shopify throttling
 * (shopifyGraphqlWithRetry — 3 attempts, exponential backoff), so callers
 * don't need their own retry layer around this.
 *
 * Idempotent from the caller's point of view: if the node was already
 * deleted (e.g. this job retried after a transient failure that actually
 * succeeded, or a merchant manually deleted it in Shopify admin), Shopify
 * returns a userError rather than throwing — the job treats "not found" as
 * a successful outcome (nothing left to delete), everything else as a real
 * failure to retry.
 *
 * @param {object} admin - Shopify Admin GraphQL client
 * @param {string} discountNodeId - GID of the codeDiscountNode to delete
 * @returns {Promise<{ deleted: boolean, alreadyGone: boolean }>}
 * @throws {Error} On transport/GraphQL failure (after retries), or a userError other than "not found".
 */
export async function deleteDiscountCode(admin, discountNodeId) {
    if (!discountNodeId) throw new Error("discountNodeId is required");

    const json = await shopifyGraphqlWithRetry(
        admin,
        `#graphql
        mutation DiscountCodeDelete($id: ID!) {
            discountCodeDelete(id: $id) {
                deletedCodeDiscountId
                userErrors {
                    field
                    message
                    code
                }
            }
        }`,
        { id: discountNodeId },
        { context: { module: MODULE, discountNodeId } }
    );

    const result = json?.data?.discountCodeDelete;
    const userErrors = result?.userErrors;

    if (userErrors?.length) {
        // Shopify's DiscountErrorCode enum uses "DISCOUNT_DOES_NOT_EXIST" for
        // a node that's already gone — that's a successful outcome for a
        // cleanup job, not a failure to retry.
        const alreadyGone = userErrors.some((e) => e.code === "DISCOUNT_DOES_NOT_EXIST");
        if (alreadyGone) {
            logger.info(MODULE, "Discount already deleted (or never existed) — treating as success", {
                discountNodeId,
                userErrors,
            });
            return { deleted: false, alreadyGone: true };
        }

        logger.error(MODULE, "discountCodeDelete userErrors", { discountNodeId, userErrors });
        throw new Error(`discountCodeDelete userErrors: ${userErrors.map((e) => e.message).join("; ")}`);
    }

    logger.success(MODULE, "Discount code deleted", { discountNodeId });
    return { deleted: true, alreadyGone: false };
}

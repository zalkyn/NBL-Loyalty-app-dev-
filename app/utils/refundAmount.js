import { shopifyGraphqlWithRetry } from "./shopifyGraphql.js";

const MODULE = "utils/refundAmount.js";

/** Marker the refunds/create webhook sends when one refund mixes currencies. */
export const MIXED_CURRENCIES = "MIXED";

/**
 * The refund's currency as it appears on the webhook's transactions: the one
 * shared currency code, MIXED_CURRENCIES when they differ, null when the
 * payload carries no currency at all.
 *
 * @param {Object} refund - Shopify Refund webhook payload
 * @returns {string|null}
 */
export function getRefundCurrency(refund) {
    const codes = new Set(
        (refund?.transactions ?? [])
            .filter((t) => t.kind === "refund" && t.status === "success" && t.currency)
            .map((t) => String(t.currency).toUpperCase())
    );
    if (codes.size === 0) return null;
    return codes.size === 1 ? [...codes][0] : MIXED_CURRENCIES;
}

/**
 * Refund amount in the ORDER's shop currency — the same currency the order
 * total stored on the EARN transaction is in, which is what the proportional
 * points reversal divides by.
 *
 * Webhook transaction amounts are in the currency the customer paid in
 * (`transactions[].currency`). When that is the order's shop currency the
 * webhook amount is already right and is returned untouched. When it differs
 * (a Markets / multi-currency sale) the amount would be divided by a total in
 * another currency, so the refund's shop-currency total is read from Shopify.
 *
 * Throws if that lookup fails so the job retries rather than reversing a wrong
 * amount of points.
 *
 * @param {Object} args
 * @param {Object} args.admin
 * @param {string|number} args.refundId       - numeric refund id from the webhook
 * @param {number} args.refundAmount          - webhook-summed amount
 * @param {string|null|undefined} args.refundCurrency
 * @returns {Promise<number>}
 */
export async function resolveRefundAmountInShopCurrency({ admin, refundId, refundAmount, refundCurrency }) {
    // Jobs queued before this field existed carry no currency — keep the old behaviour.
    if (!refundCurrency || !refundId) return Number(refundAmount || 0);

    const json = await shopifyGraphqlWithRetry(
        admin,
        `#graphql
        query RefundInShopCurrency($id: ID!) {
            refund(id: $id) {
                totalRefundedSet { shopMoney { amount currencyCode } }
                order { currencyCode }
            }
        }`,
        { id: `gid://shopify/Refund/${refundId}` },
        { context: { module: MODULE } }
    );

    const refund = json.data?.refund;
    const shopMoney = refund?.totalRefundedSet?.shopMoney;
    const orderShopCurrency = refund?.order?.currencyCode;
    if (!shopMoney || !orderShopCurrency) {
        throw new Error(`Could not read refund ${refundId} in shop currency`);
    }

    if (refundCurrency === orderShopCurrency) return Number(refundAmount || 0);
    return Number(shopMoney.amount || 0);
}

import { logger } from "../../../utils/logger.js";
import { shopifyGraphqlWithRetry } from "../../../utils/shopifyGraphql.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "graphql/query/shop/shopCurrency.js";

/**
 * Fetches the shop's currency code (e.g. "USD", "BDT").
 *
 * Used by the Points Backfill admin UI to default/validate a new
 * ShadowRule's currencyCode field when it's created — NOT used to verify
 * currency during an actual POINTS_BACKFILL run. That per-run check is
 * done per-customer instead, against Customer.amountSpent.currencyCode
 * (already fetched by every customers query in customers.js) — see
 * currencyMatches() in utils/backfill/computePoints.js. A single shop-level
 * currency isn't precise enough for that: Shopify Markets can present a
 * customer's amountSpent in a different currency per market, so relying on
 * this shop-level value for the actual run could pass a customer whose
 * individual amountSpent doesn't really match the rule's currency.
 *
 * @param {Object} admin - Shopify Admin GraphQL client
 * @returns {Promise<string|null>} Currency code (e.g. "USD"), or null on failure
 */
export default async function shopCurrency(admin) {
    try {
        const json = await shopifyGraphqlWithRetry(
            admin,
            `#graphql
            query ShopCurrency {
                shop {
                    currencyCode
                }
            }`,
            undefined,
            { context: { module: MODULE } }
        );

        return json.data?.shop?.currencyCode ?? null;
    } catch (error) {
        logger.error(MODULE, "Failed to fetch shop currency", { error: error?.message });
        return null;
    }
}

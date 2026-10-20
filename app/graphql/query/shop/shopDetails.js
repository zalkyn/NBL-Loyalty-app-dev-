import { logger } from "../../../utils/logger.js";
import { shopifyGraphqlWithRetry } from "../../../utils/shopifyGraphql.js";

const MODULE = "graphql/query/shop/shopDetails.js";

/**
 * Store details shown on the Settings overview (reference only — nothing in
 * the app is configured from them). These `shop` fields need no extra scope.
 *
 * @param {Object} admin - Shopify Admin GraphQL client
 * @returns {Promise<{ name, domain, primaryDomain, currencyCode, timezone, sellingCurrencies }|null>}
 */
export default async function shopDetails(admin) {
    try {
        const json = await shopifyGraphqlWithRetry(
            admin,
            `#graphql
            query ShopDetails {
                shop {
                    name
                    myshopifyDomain
                    primaryDomain { url }
                    currencyCode
                    ianaTimezone
                    enabledPresentmentCurrencies
                }
            }`,
            undefined,
            { context: { module: MODULE } }
        );
        const shop = json.data?.shop;
        if (!shop) return null;
        return {
            name: shop.name ?? null,
            domain: shop.myshopifyDomain ?? null,
            primaryDomain: shop.primaryDomain?.url ?? null,
            currencyCode: shop.currencyCode ?? null,
            timezone: shop.ianaTimezone ?? null,
            sellingCurrencies: shop.enabledPresentmentCurrencies ?? [],
        };
    } catch (error) {
        logger.error(MODULE, "Failed to fetch shop details", { error: error?.message });
        return null;
    }
}

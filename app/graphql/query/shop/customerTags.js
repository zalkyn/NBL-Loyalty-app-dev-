import { logger } from "../../../utils/logger.js";
import { shopifyGraphqlWithRetry } from "../../../utils/shopifyGraphql.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "graphql/query/shop/customerTags.js";

/**
 * Fetches distinct customer tags used in the shop, for autocomplete
 * suggestions only — NOT used anywhere in the actual backfill
 * audience-matching logic — audiences are Shopify customer segments now
 * (see controller/backfillAudience/snapshot.js), so this list is purely a
 * convenience and is never a source of truth.
 *
 * Known limitation, confirmed against Shopify's own developer community
 * (years of open complaints, no fix as of this writing): shop.customerTags
 * does NOT support the `after` cursor argument, so if a shop has more
 * distinct customer tags than fit in one page, the rest are silently
 * unreachable — there's no way to paginate to them. Acceptable here
 * specifically because this is a "quick pick" convenience list, not a
 * source of truth: a merchant can still type any tag by hand regardless
 * of whether it appears in these suggestions.
 *
 * @param {Object} admin - Shopify Admin GraphQL client
 * @returns {Promise<string[]>} Sorted list of distinct tags, or [] on failure/none.
 */
export default async function customerTags(admin) {
    try {
        const json = await shopifyGraphqlWithRetry(
            admin,
            `#graphql
            query CustomerTags {
                shop {
                    customerTags(first: 250) {
                        nodes
                    }
                }
            }`,
            undefined,
            { context: { module: MODULE } }
        );

        const tags = json.data?.shop?.customerTags?.nodes ?? [];
        return [...tags].sort((a, b) => a.localeCompare(b));
    } catch (error) {
        logger.error(MODULE, "Failed to fetch customer tags", { error: error?.message });
        return [];
    }
}

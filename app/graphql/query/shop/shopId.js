import { logger } from "../../../utils/logger.js";
import { withRetry } from "../../../utils/retry/withRetry.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "graphql/query/shop/shopId.js";

/**
 * Fetches the Shopify GID of the current shop.
 *
 * Retries on transient network failures — this is typically the first call
 * in a metafield sync chain (see syncAppConfig.js), so a single dropped
 * request here would otherwise abort the whole sync.
 *
 * @param {Object} admin - Shopify Admin GraphQL client
 * @returns {Promise<string|null>} Shop GID (e.g. "gid://shopify/Shop/123"), or null on failure
 */
export default async function shopId(admin) {
    try {
        const json = await withRetry(
            async () => {
                const response = await admin.graphql(
                    `#graphql
                    query ShopId {
                        shop {
                            id
                        }
                    }`
                );
                return response.json();
            },
            {
                maxAttempts: 3,
                baseDelayMs: 800,
                retryableErrors: ["fetch failed", "ECONNRESET", "ETIMEDOUT"],
                context: { module: MODULE },
            }
        );

        return json.data?.shop?.id ?? null;
    } catch (error) {
        logger.error(MODULE, "Failed to fetch shop ID", { error: error?.message });
        return null;
    }
}

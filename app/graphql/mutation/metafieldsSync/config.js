import { logger } from "../../../utils/logger.js";

const MODULE = "graphql/mutation/metafieldsSync/config.js";

/**
 * Syncs a single metafield to Shopify via the `metafieldsSet` mutation.
 *
 * Throws on every real failure (transport, GraphQL, userErrors, or invalid
 * input) so the caller's retry layer (utils/retry/withRetry.js) can decide
 * what to do. Error messages are preserved verbatim so `withRetry`'s
 * `retryableErrors` string matching keeps working. All callers already wrap
 * this in `.catch()`, so throwing never crashes a job.
 *
 * @param {object} admin - Authenticated Admin GraphQL client.
 * @param {object} metafield - Metafield input.
 * @param {string} metafield.ownerId - GID of the resource that owns the metafield.
 * @param {string} metafield.namespace - Metafield namespace.
 * @param {string} metafield.key - Metafield key.
 * @param {string} metafield.type - Metafield type (e.g. "json").
 * @param {string} metafield.value - Serialized value. MUST be a string.
 * @returns {Promise<object|null>} The synced metafield node, or null if none returned.
 * @throws {Error} On invalid input, transport failure, GraphQL errors, or userErrors.
 */
export default async function configMetafieldSyncMutation(admin, metafield) {
    metafield = metafield || {};

    // Guard bad input early — these are caller bugs, not runtime faults.
    if (!admin) {
        throw new Error("configMetafieldSyncMutation: admin client is required");
    }
    if (!metafield.ownerId || !metafield.key || !metafield.namespace) {
        throw new Error("configMetafieldSyncMutation: ownerId, key and namespace are required");
    }
    if (typeof metafield.value !== "string") {
        throw new Error("configMetafieldSyncMutation: metafield value must be a string");
    }

    let payload;
    try {
        const response = await admin.graphql(
            `#graphql
            mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
                metafieldsSet(metafields: $metafields) {
                    metafields {
                        id
                        key
                        namespace
                        createdAt
                        updatedAt
                    }
                    userErrors {
                        field
                        message
                        code
                    }
                }
            }`,
            { variables: { metafields: [{ ...metafield }] } },
        );

        payload = await response.json();
    } catch (err) {
        // No HTTP response came back (fetch failed / ECONNRESET / ETIMEDOUT).
        // Re-throw so withRetry can retry it.
        logger.error(MODULE, "Metafield sync transport error", {
            ownerId: metafield.ownerId,
            key: metafield.key,
            error: err?.message,
        });
        throw err;
    }

    // GraphQL-level errors (bad query, throttling, etc.).
    const topLevelErrors = payload?.errors;
    if (topLevelErrors?.length) {
        const message = topLevelErrors.map((e) => e?.message).filter(Boolean).join("; ") || "GraphQL error";
        logger.error(MODULE, "Metafield sync GraphQL error", {
            ownerId: metafield.ownerId,
            key: metafield.key,
            error: message,
        });
        throw new Error(`metafieldsSet GraphQL error: ${message}`);
    }

    // Per-metafield validation errors (invalid value, wrong type, ownership).
    // Not transport errors, so withRetry treats these as non-retryable.
    const result = payload?.data?.metafieldsSet;
    const userErrors = result?.userErrors;
    if (userErrors?.length) {
        const message = userErrors
            .map((e) => `${e.field?.join(".") ?? "?"}: ${e.message}${e.code ? ` (${e.code})` : ""}`)
            .join("; ");
        logger.error(MODULE, "Metafield sync userErrors", {
            ownerId: metafield.ownerId,
            key: metafield.key,
            error: message,
        });
        throw new Error(`metafieldsSet userErrors: ${message}`);
    }

    logger.success(MODULE, "Metafield successfully synced", {
        ownerId: metafield.ownerId,
        key: metafield.key,
    });

    return result?.metafields?.[0] ?? null;
}
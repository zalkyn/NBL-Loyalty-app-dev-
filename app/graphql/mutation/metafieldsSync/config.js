import { logger } from "../../../utils/logger.js";

const MODULE = "graphql/mutation/metafieldsSync/config.js";

/**
 * Syncs one OR MORE metafields to Shopify via a single `metafieldsSet`
 * mutation call.
 *
 * Accepts either a single metafield object (legacy call shape — still used
 * by syncAppConfig.js for the single shop-level `nbl_config_v1` metafield)
 * or an array of metafield objects (used by syncCustomerConfig.js to write
 * the split `nbl_customer_core_v1` / `_transactions_v1` / `_rewards_v1` /
 * `_prizeclaims_v1` metafields together). Either way, exactly ONE Shopify
 * Admin API call is made — `metafieldsSet` natively accepts an array, so
 * batching multiple metafields here costs no more than writing a single
 * one, and is what keeps the split-metafield design from multiplying API
 * calls per sync event.
 *
 * Deliberately does NOT attempt partial-success/partial-retry bookkeeping
 * per metafield — if ANY metafield in the batch userErrors, the whole call
 * throws and the caller's retry layer (withRetry) retries the WHOLE batch.
 * This is intentionally simpler (and safer for a production app) than
 * per-field retry logic: metafieldsSet is idempotent (each retry just
 * re-writes fresh values pulled from the DB moments earlier), so a full
 * retry has no double-effect risk, and the reduced complexity means fewer
 * ways for this critical-path-adjacent code to have a subtle bug.
 *
 * @param {object} admin - Authenticated Admin GraphQL client.
 * @param {object|object[]} metafields - One metafield input, or an array of them.
 * @param {string} metafields[].ownerId - GID of the resource that owns the metafield.
 * @param {string} metafields[].namespace - Metafield namespace.
 * @param {string} metafields[].key - Metafield key.
 * @param {string} metafields[].type - Metafield type (e.g. "json").
 * @param {string} metafields[].value - Serialized value. MUST be a string.
 * @returns {Promise<object[]>} The synced metafield nodes (always an array,
 *   regardless of whether a single object or array was passed in).
 * @throws {Error} On invalid input, transport failure, GraphQL errors, or userErrors.
 */
export default async function configMetafieldSyncMutation(admin, metafields) {
    const list = Array.isArray(metafields) ? metafields : [metafields || {}];

    // Guard bad input early — these are caller bugs, not runtime faults.
    if (!admin) {
        throw new Error("configMetafieldSyncMutation: admin client is required");
    }
    if (!list.length) {
        throw new Error("configMetafieldSyncMutation: at least one metafield is required");
    }
    for (const metafield of list) {
        if (!metafield.ownerId || !metafield.key || !metafield.namespace) {
            throw new Error("configMetafieldSyncMutation: ownerId, key and namespace are required for every metafield");
        }
        if (typeof metafield.value !== "string") {
            throw new Error("configMetafieldSyncMutation: metafield value must be a string");
        }
    }

    const keysForLog = list.map((m) => m.key).join(",");

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
            { variables: { metafields: list.map((m) => ({ ...m })) } },
        );

        payload = await response.json();
    } catch (err) {
        // No HTTP response came back (fetch failed / ECONNRESET / ETIMEDOUT).
        // Re-throw so withRetry can retry it.
        logger.error(MODULE, "Metafield sync transport error", {
            ownerId: list[0]?.ownerId,
            keys: keysForLog,
            error: err?.message,
        });
        throw err;
    }

    // GraphQL-level errors (bad query, throttling, etc.).
    const topLevelErrors = payload?.errors;
    if (topLevelErrors?.length) {
        const message = topLevelErrors.map((e) => e?.message).filter(Boolean).join("; ") || "GraphQL error";
        logger.error(MODULE, "Metafield sync GraphQL error", {
            ownerId: list[0]?.ownerId,
            keys: keysForLog,
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
            ownerId: list[0]?.ownerId,
            keys: keysForLog,
            error: message,
        });
        throw new Error(`metafieldsSet userErrors: ${message}`);
    }

    logger.success(MODULE, "Metafield(s) successfully synced", {
        ownerId: list[0]?.ownerId,
        keys: keysForLog,
        count: result?.metafields?.length ?? 0,
    });

    return result?.metafields ?? [];
}
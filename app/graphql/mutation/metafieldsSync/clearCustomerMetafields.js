import { logger } from "../../../utils/logger.js";

const MODULE = "graphql/mutation/metafieldsSync/clearCustomerMetafields.js";

/** The 4 split customer metafields — see syncCustomerConfig.js's
 *  module-level comment for the full design. */
const METAFIELD_KEYS = [
    "nbl_customer_core_v1",
    "nbl_customer_transactions_v1",
    "nbl_customer_rewards_v1",
    "nbl_customer_prizeclaims_v1",
];

// The old single-blob metafield, pre-dating the split above. See
// syncCustomerConfig.js's module comment: nothing writes to this anymore,
// but main.preact.jsx's mergeCustomerConfig() still reads it as a
// PER-FIELD FALLBACK for any customer who hasn't had a split-metafield
// write yet. That's exactly why this file deliberately does NOT clear it
// by default (see `includeLegacy` below) — for the "Empty config"
// self-heal test, leaving it in place is correct and intentional.
const LEGACY_KEY = "nbl_customer_v1";

const NAMESPACE = "app";

/**
 * TESTING ONLY. Deletes (not just empties — actually removes) a customer's
 * split app metafields from Shopify, via `metafieldsDelete`. Used by the
 * Version Tracking page's "empty already-synced customers' config" button
 * (self-heal test) and "delete record entirely" button (join-flow test) —
 * see `includeLegacy` below for the one difference between them.
 *
 * `metafieldsDelete` takes owner+namespace+key identifiers directly — no
 * need to look up each metafield's own GID first.
 *
 * Idempotent: deleting a metafield that's already gone is not an error in
 * Shopify's API (returns it in `deletedMetafields` either way), so this is
 * always safe to retry.
 *
 * @param {object} admin - Authenticated Admin GraphQL client.
 * @param {string} customerShopifyId - GID of the customer to clear.
 * @param {object} [options]
 * @param {boolean} [options.includeLegacy=false] - Also delete the old
 *   `nbl_customer_v1` blob metafield, not just the 4 split ones.
 *
 *   Default (false) — for "empty already-synced customers' config": the
 *   whole point of that tool is to simulate a customer whose SPLIT
 *   metafields went missing while everything else about them (including
 *   the legacy blob, if they still have one) stays real — see
 *   ensureAndSyncCustomer.js for why that scenario matters. Leaving the
 *   legacy metafield alone here is correct and intentional, exactly
 *   mirroring what production code does (see LEGACY_KEY comment above).
 *
 *   true — for "delete customer's app record entirely": that tool exists
 *   specifically to reproduce a genuinely brand-new customer (nothing to
 *   self-heal OR fall back to) for testing the widget's "Join our
 *   Program" step. Leaving the legacy metafield in place there would
 *   silently defeat the whole point — main.preact.jsx's
 *   mergeCustomerConfig() would keep reading points/rewards/etc. straight
 *   out of it, and the widget would look fully joined even with the DB
 *   row and all 4 split metafields gone. See deleteCustomerRecord.js.
 * @returns {Promise<void>}
 * @throws {Error} On transport/GraphQL failure or userErrors.
 */
export default async function clearCustomerMetafields(admin, customerShopifyId, options = {}) {
    const { includeLegacy = false } = options;
    const keys = includeLegacy ? [...METAFIELD_KEYS, LEGACY_KEY] : METAFIELD_KEYS;
    const metafields = keys.map((key) => ({
        ownerId: customerShopifyId,
        namespace: NAMESPACE,
        key,
    }));

    let payload;
    try {
        const response = await admin.graphql(
            `#graphql
            mutation MetafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
                metafieldsDelete(metafields: $metafields) {
                    deletedMetafields {
                        key
                        namespace
                        ownerId
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }`,
            { variables: { metafields } }
        );
        payload = await response.json();
    } catch (err) {
        logger.error(MODULE, "Metafields delete transport error", { customerShopifyId, error: err?.message });
        throw err;
    }

    const topLevelErrors = payload?.errors;
    if (topLevelErrors?.length) {
        const message = topLevelErrors.map((e) => e?.message).filter(Boolean).join("; ") || "GraphQL error";
        logger.error(MODULE, "Metafields delete GraphQL error", { customerShopifyId, error: message });
        throw new Error(`metafieldsDelete GraphQL error: ${message}`);
    }

    const userErrors = payload?.data?.metafieldsDelete?.userErrors;
    if (userErrors?.length) {
        const message = userErrors.map((e) => `${e.field?.join(".") ?? "?"}: ${e.message}`).join("; ");
        logger.error(MODULE, "Metafields delete userErrors", { customerShopifyId, error: message });
        throw new Error(`metafieldsDelete userErrors: ${message}`);
    }

    logger.warn(MODULE, "TESTING: customer metafields cleared", { customerShopifyId, includeLegacy });
}
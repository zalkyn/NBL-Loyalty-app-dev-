import configMetafieldSyncMutation from "../../graphql/mutation/metafieldsSync/config.js";
import prisma from "../../db.server.js";
import { normalizeCustomerGid } from "../customers/normalizeCustomerGid.js";
import { logger } from "../../utils/logger.js";
import { withRetry } from "../../utils/retry/withRetry.js";
import { SHOPIFY_RETRYABLE_ERRORS } from "../../utils/shopifyGraphql.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "controller/metafieldsSync/syncCustomerConfig.js";

/** @constant {object} Shared retry options for a single metafield sync. Both exported functions below always
 *  retry internally, so callers never need to wrap them in `withRetry` themselves. Includes "Throttled" —
 *  configMetafieldSyncMutation (config.js) preserves Shopify's own error text verbatim when it re-throws a
 *  GraphQL-level error, so a rate-limited response reaches here as e.g. "metafieldsSet GraphQL error: Throttled",
 *  which this list's substring match still catches. */
const SYNC_RETRY_OPTIONS = { maxAttempts: 3, baseDelayMs: 800, retryableErrors: SHOPIFY_RETRYABLE_ERRORS };

// Only fields the storefront widget (app/widget-ui/ui/*) actually reads off
// this metafield. Everything else here is dead weight in every sync job and
// every page-load payload — see main.preact.jsx (customerConfig.*) and
// loyalty.liquid (customer.metafields.app.nbl_customer_v1.value.*) for the
// full list of what's consumed.
//
// Note: this is a single top-level `select` (not select+include — Prisma
// doesn't allow mixing those at the same level). `shopifyId` isn't read by
// the widget but IS needed here as the metafield's ownerId in buildMetafield().
const CUSTOMER_SELECT = {
    id: true,
    shopifyId: true,
    points: true,
    referralCode: true,

    // ActivityRow + the toast notification list read: id, type, points,
    // activity, reason (fallback text), createdAt, notifiedAt. Nothing reads
    // the nested `reward` sub-object that used to be included here.
    transactions: {
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            type: true,
            points: true,
            activity: true,
            reason: true,
            createdAt: true,
            notifiedAt: true,
        },
    },
    // ActiveRewardItem + the discountUsed/status filters (Home/Rewards/
    // Activities tabs) are all that touch this array.
    rewards: {
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            code: true,
            title: true,
            discountUsed: true,
            status: true,
        },
    },
    // referralsSent / referralsUsed removed entirely — grep confirms nothing
    // in app/widget-ui reads them. Dashboard pages and orderPaidJob.js query
    // these directly from Postgres themselves; they don't go through this
    // metafield, so dropping them here doesn't affect either.
    prizeClaims: {
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            status: true,
            pointsCost: true,
            physicalPrizeId: true,
        },
    },
};

const BATCH_SIZE = 10;

/**
 * Builds the `nbl_customer_v1` metafield payload for a customer record.
 *
 * @param {object} customer - Prisma Customer record shaped by CUSTOMER_SELECT
 * @returns {{ namespace: string, key: string, value: string, type: string, ownerId: string }}
 */
const buildMetafield = (customer) => ({
    namespace: "app",
    key: "nbl_customer_v1",
    value: JSON.stringify({
        appName: "North Borders Loyalty App",
        ...customer,
    }),
    type: "json",
    ownerId: customer.shopifyId,
});

/**
 * Syncs every customer's metafield for a shop, in batches. Used by bulk jobs
 * (e.g. after a widget config change that all customers need to see).
 *
 * Each item retries independently on transient network failure and never
 * throws — a single customer's sync failing does not affect the rest of the
 * batch or the caller. Failures are logged individually so they're visible
 * instead of silently vanishing into `Promise.allSettled`.
 *
 * @param {Object} admin   - Shopify Admin GraphQL client
 * @param {Object} session - Shopify session (used to scope customers to this shop)
 * @returns {Promise<void>}
 */
export const syncCustomersConfig = async (admin, session) => {
    try {
        const customers = await prisma.customer.findMany({
            where: { sessionId: session.id }, // scoped to current shop
            select: CUSTOMER_SELECT,
        });

        for (let i = 0; i < customers.length; i += BATCH_SIZE) {
            const batch = customers.slice(i, i + BATCH_SIZE);
            const settled = await Promise.allSettled(
                batch.map((customer) =>
                    withRetry(
                        () => configMetafieldSyncMutation(admin, buildMetafield(customer)),
                        { ...SYNC_RETRY_OPTIONS, context: { module: MODULE, shop: session?.shop, customerId: customer.id } }
                    )
                )
            );

            settled.forEach((result, idx) => {
                if (result.status === "rejected") {
                    logger.error(MODULE, "Customer metafield sync failed after retries", {
                        shop: session?.shop,
                        customerId: batch[idx]?.id,
                        error: result.reason?.message,
                    });
                }
            });
        }
    } catch (error) {
        logger.error(MODULE, "syncCustomersConfig failed", { shop: session?.shop, error: error?.message });
    }
};

/**
 * Syncs a single customer's metafield to Shopify. Retries internally on
 * transient network failure, so callers never need to wrap this in
 * `withRetry` themselves.
 *
 * Never throws — returns `null` on any failure (customer not found, invalid
 * ID, or sync failure after all retries) so callers can treat this as a
 * best-effort, non-critical operation.
 *
 * @param {Object}        admin      - Shopify Admin GraphQL client
 * @param {string|number} customerId - Internal numeric id (<=6 digits) or Shopify GID/numeric id
 * @returns {Promise<Object|null>} The synced Prisma Customer record, or null on failure
 */
export const syncCustomerConfig = async (admin, customerId) => {
    let normalizedId = null;

    try {
        let customer = null;

        if (customerId?.toString()?.length <= 6) {
            customer = await prisma.customer.findFirst({
                where: { id: Number(customerId) },
                select: CUSTOMER_SELECT,
            });
        } else {
            normalizedId = normalizeCustomerGid(customerId);
            if (!normalizedId) throw new Error("Customer ID is required");

            customer = await prisma.customer.findFirst({
                where: { shopifyId: normalizedId },
                select: CUSTOMER_SELECT,
            });
        }

        if (!customer) throw new Error(`Customer not found: ${normalizedId ?? customerId}`);

        await withRetry(
            () => configMetafieldSyncMutation(admin, buildMetafield(customer)),
            { ...SYNC_RETRY_OPTIONS, context: { module: MODULE, customerId: customer.id } }
        );

        return customer;
    } catch (error) {
        logger.error(MODULE, "syncCustomerConfig failed", {
            customerId: normalizedId ?? customerId,
            error: error?.message,
        });
        return null;
    }
};

import { logger } from "../../../utils/logger";

// ─────────────────────────────────────────────────────────────────────────────
// INTERVAL MAP
// Shopify SellingPlan billingPolicy → our internal interval string
// Must match values stored in conditions.order.intervals[n].interval
// and conditions.referral.intervals[n].interval
// ─────────────────────────────────────────────────────────────────────────────

const INTERVAL_MAP = {
    WEEK:  { 1: "weekly", 2: "every_two_weeks" },
    MONTH: { 1: "monthly", 2: "every_two_months", 3: "every_three_months", 6: "every_six_months" },
    YEAR:  { 1: "yearly" },
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches Appstle subscription metafield from an order, then resolves the
 * subscription interval via a second Shopify GraphQL call to the SellingPlan API.
 *
 * Two sequential GraphQL calls:
 *   1. Order metafield  → extracts appstle data + sellingPlanId
 *   2. SellingPlan      → resolves billingPolicy interval + intervalCount
 *
 * @param {Object} admin    - Shopify Admin GraphQL client
 * @param {string} orderId  - Order ID (numeric or full GID)
 *
 * @returns {Promise<{
 *   subscriptionContract: Object|null,
 *   subscriptionInterval: string|null,
 *   isSubscription: boolean,
 * }>}
 *
 * Always returns the shape above — never throws.
 * subscriptionInterval is null for one-time orders or unmapped plans.
 */
export const getAppstleMetafield = async (admin, orderId) => {
    const fallback = { subscriptionContract: null, subscriptionInterval: null, isSubscription: false };

    try {
        if (!orderId) {
            logger.warn("getAppstleMetafield: orderId is required");
            return fallback;
        }

        const orderGid = normalizeOrderGid(orderId);

        // ── Step 1: Fetch Appstle metafield from order ────────────────────────
        const metafieldRes = await admin.graphql(
            `#graphql
            query GetOrderAppstleMetafield($id: ID!) {
                order(id: $id) {
                    id
                    appstle_subscription: metafield(
                        key: "details",
                        namespace: "appstle_subscription"
                    ) {
                        value: jsonValue
                    }
                }
            }`,
            { variables: { id: orderGid } }
        );

        const metafieldJson = await metafieldRes.json();
        const appstle = metafieldJson?.data?.order?.appstle_subscription?.value ?? null;

        // No metafield = one-time order
        if (!appstle) return fallback;

        const contract = appstle?.subscriptionContract ?? null;

        // ── Step 2: Resolve interval from SellingPlan ─────────────────────────
        const planId = contract?.sellingPlanIds?.[0] ?? null;

        if (!planId) {
            logger.warn("getAppstleMetafield: no sellingPlanId found in contract", { orderId });
            return { subscriptionContract: contract, subscriptionInterval: null, isSubscription: true };
        }

        const planGid = normalizeSellingPlanGid(planId);

        const planRes = await admin.graphql(
            `#graphql
            query GetSellingPlanInterval($id: ID!) {
                sellingPlan(id: $id) {
                    id
                    billingPolicy {
                        ... on SellingPlanRecurringBillingPolicy {
                            interval
                            intervalCount
                        }
                    }
                }
            }`,
            { variables: { id: planGid } }
        );

        const planJson = await planRes.json();
        const billing = planJson?.data?.sellingPlan?.billingPolicy ?? null;

        const subscriptionInterval = billing?.interval && billing?.intervalCount
            ? (INTERVAL_MAP[billing.interval]?.[billing.intervalCount] ?? null)
            : null;

        if (billing && !subscriptionInterval) {
            logger.warn("getAppstleMetafield: unmapped interval", {
                interval: billing.interval,
                intervalCount: billing.intervalCount,
                planId,
                orderId,
            });
        }

        return {
            subscriptionContract: contract,
            subscriptionInterval,
            isSubscription: true,
        };

    } catch (error) {
        logger.error("getAppstleMetafield failed", {
            error: error?.message,
            stack: error?.stack,
            orderId,
            module: "graphql/order/getAppstleMetafield.js",
        });
        return fallback;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalizes Shopify Order ID to full GID.
 * Accepts: 7970071281762 or gid://shopify/Order/7970071281762
 */
const normalizeOrderGid = (orderId) => {
    if (!orderId) return null;
    const str = String(orderId).trim();
    return str.startsWith("gid://shopify/Order/")
        ? str
        : `gid://shopify/Order/${str}`;
};

/**
 * Normalizes Shopify SellingPlan ID to full GID.
 * Accepts: 3750527074 or gid://shopify/SellingPlan/3750527074
 */
const normalizeSellingPlanGid = (planId) => {
    if (!planId) return null;
    const str = String(planId).trim();
    return str.startsWith("gid://shopify/SellingPlan/")
        ? str
        : `gid://shopify/SellingPlan/${str}`;
};
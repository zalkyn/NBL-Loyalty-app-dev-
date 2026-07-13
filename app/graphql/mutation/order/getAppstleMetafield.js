import { logger } from "../../../utils/logger.js";
import { withRetry } from "../../../utils/retry/withRetry.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "graphql/order/getAppstleMetafield.js";

// ─────────────────────────────────────────────────────────────────────────────
// Interval Map
// Shopify SellingPlan billingPolicy -> our internal interval string.
// Uses Shopify's internal interval + intervalCount — never merchant-facing
// plan names, which can be renamed at any time from the Appstle dashboard.
// Must match values in conditions.order.intervals[n].interval
// and conditions.referral.intervals[n].interval.
//
// Shopify's SellingPlanInterval enum has exactly 4 values (DAY, WEEK, MONTH,
// YEAR), but intervalCount is an open-ended integer — a merchant can
// configure ANY count (MONTH:4, WEEK:3, DAY:10, ...). There are only 7 named
// buckets in the admin rule builder (see ruleConstants.js), so this map only
// needs entries for combinations that land in one of those 7 buckets —
// anything else genuinely has no matching rule to apply, and staying
// unmapped (logged via the warn below) is the correct, honest outcome for
// those, not a gap to fill.
//
// Multiple entries below map to the SAME bucket because some subscription
// apps express a given cadence in a different unit than the more common
// one — e.g. Appstle can report an annual plan as MONTH:12 instead of
// YEAR:1. Only EXACT equivalences are included (12 months = 1 year, 7 days
// = 1 week, 14 days = 2 weeks) — deliberately not approximations like
// DAY:30 for "monthly" (months are 28-31 days, not always exactly 30) or
// DAY:365 for "yearly" (leap years), since guessing wrong there would
// silently apply the wrong points rule rather than honestly logging an
// unmapped interval.
const INTERVAL_MAP = {
    DAY: { 7: "weekly", 14: "every_two_weeks" },
    WEEK: { 1: "weekly", 2: "every_two_weeks" },
    MONTH: { 1: "monthly", 2: "every_two_months", 3: "every_three_months", 6: "every_six_months", 12: "yearly" },
    YEAR: { 1: "yearly" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves subscription interval from pre-fetched Appstle metafield data.
 *
 * This function accepts the already-fetched Appstle metafield value (from
 * fetchFullOrder) so it only needs to make ONE additional API call to resolve
 * the billing interval — rather than fetching the metafield itself.
 *
 * The single API call fetches product.sellingPlanGroups and matches the plan
 * by GID to read its billingPolicy.interval + intervalCount. This is the only
 * reliable approach because:
 *   - `sellingPlan(id)` root query does not exist in Shopify Admin API
 *   - LineItemSellingPlan only exposes name + sellingPlanId — no billingPolicy
 *   - Plan names are merchant-editable and cannot be used for interval mapping
 *   - billingPolicy.interval/intervalCount are Shopify-internal, never change
 *
 * @param {Object}      admin      - Shopify Admin GraphQL client
 * @param {Object|null} appstle    - Pre-fetched Appstle metafield value (jsonValue)
 * @param {string}      orderId    - Order GID (used for logging only)
 *
 * @returns {Promise<{
 *   subscriptionContract: Object|null,
 *   subscriptionInterval: string|null,
 *   isSubscription:       boolean,
 * }>}
 *
 * Always returns the shape above — never throws.
 */
export const getAppstleMetafield = async (admin, appstle, orderId) => {
    const fallback = { subscriptionContract: null, subscriptionInterval: null, isSubscription: false };

    try {
        // No metafield = one-time order
        if (!appstle) return fallback;

        const contract = appstle?.subscriptionContract ?? null;
        const lineItems = contract?.subscriptionLineItemList ?? [];
        const productGid = lineItems[0]?.productId ?? null;
        const planId = contract?.sellingPlanIds?.[0] ?? null;

        if (!productGid || !planId) {
            logger.warn(MODULE, "Missing productId or sellingPlanId in Appstle contract", {
                orderId, productGid, planId,
            });
            return { subscriptionContract: contract, subscriptionInterval: null, isSubscription: true };
        }

        const planGid = normalizeSellingPlanGid(planId);

        // ── Fetch product.sellingPlanGroups and match by planGid ──────────────
        // This is the only Shopify-supported way to get a plan's billingPolicy by ID.
        // Retried on transient network failure — without this, a single dropped
        // request permanently misclassifies the order as non-subscription
        // (the outer catch swallows the error and returns `fallback`), since
        // this is a one-shot call during order-webhook processing, not re-run later.
        const planJson = await withRetry(
            async () => {
                const planRes = await admin.graphql(
                    `#graphql
                    query GetSellingPlanInterval($productId: ID!) {
                        product(id: $productId) {
                            sellingPlanGroups(first: 10) {
                                edges {
                                    node {
                                        sellingPlans(first: 20) {
                                            edges {
                                                node {
                                                    id
                                                    billingPolicy {
                                                        ... on SellingPlanRecurringBillingPolicy {
                                                            interval
                                                            intervalCount
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }`,
                    { variables: { productId: productGid } }
                );
                return planRes.json();
            },
            {
                maxAttempts: 3,
                baseDelayMs: 800,
                retryableErrors: ["fetch failed", "ECONNRESET", "ETIMEDOUT"],
                context: { module: MODULE, orderId, productGid },
            }
        );

        // Flatten all plans across all groups, then match by GID
        const allPlans = (planJson?.data?.product?.sellingPlanGroups?.edges ?? [])
            .flatMap(({ node }) =>
                (node?.sellingPlans?.edges ?? []).map(({ node: plan }) => plan)
            );

        const matchedPlan = allPlans.find((plan) => plan?.id === planGid) ?? null;
        const billing = matchedPlan?.billingPolicy ?? null;

        if (!billing) {
            logger.warn(MODULE, "Selling plan not found in product groups", {
                orderId, productGid, planGid,
                availablePlanIds: allPlans.map((p) => p?.id),
            });
            return { subscriptionContract: contract, subscriptionInterval: null, isSubscription: true };
        }

        const subscriptionInterval = billing?.interval && billing?.intervalCount
            ? (INTERVAL_MAP[billing.interval]?.[billing.intervalCount] ?? null)
            : null;

        if (!subscriptionInterval) {
            logger.warn(MODULE, "Unmapped billing interval — add to INTERVAL_MAP if needed", {
                orderId, interval: billing.interval, intervalCount: billing.intervalCount, planGid,
            });
        }

        logger.info(MODULE, "Subscription interval resolved", {
            orderId, planGid,
            interval: billing.interval,
            intervalCount: billing.intervalCount,
            subscriptionInterval,
        });

        return { subscriptionContract: contract, subscriptionInterval, isSubscription: true };

    } catch (error) {
        logger.error(MODULE, "getAppstleMetafield failed", { error: error?.message, orderId });
        return fallback;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Normalizers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalizes a Shopify SellingPlan ID to a full GID.
 * Accepts: 4925391098 or gid://shopify/SellingPlan/4925391098
 *
 * @param {string|number} planId
 * @returns {string|null}
 */
const normalizeSellingPlanGid = (planId) => {
    if (!planId) return null;
    const str = String(planId).trim();
    return str.startsWith("gid://shopify/SellingPlan/")
        ? str
        : `gid://shopify/SellingPlan/${str}`;
};
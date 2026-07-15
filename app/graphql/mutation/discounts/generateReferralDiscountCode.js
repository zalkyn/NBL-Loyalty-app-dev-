import { logger } from "app/utils/logger.js";
import { normalizeCustomerGid } from "../../../controller/customers/normalizeCustomerGid";
import { generateDiscountCode } from "../../../utils/generateDiscountCode.js";
import { getPointRuleByEvent } from "../../../controller/pointsRule/getPointRuleByEvent";
import { callShopifyGraphql } from "../../../utils/shopifyGraphql.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "graphql/mutation/discounts/generateReferralDiscountCode.js";

/**
 * Generates a referral-based discount code for a customer via Shopify GraphQL.
 *
 * Validation and business-rule failures throw customer-safe messages directly.
 * Transport failures (network drop, timeout) AND Shopify rate-limit
 * (Throttled) responses are converted to a single known message so the
 * caller's `withRetry` layer can match and retry them — see
 * `retryableErrors` at the call site in referral-claim.jsx. The Throttled
 * detection itself lives in callShopifyGraphql() (shopifyGraphql.js),
 * shared with every other Shopify Admin API call in the app.
 *
 * @param {Object}        admin        - Shopify Admin GraphQL client
 * @param {string|number} customerId   - Shopify customer ID
 * @param {string}        referralCode - Referral code (used for logging only)
 * @param {string}        sessionId    - Shopify session ID identifying the shop;
 *   required to resolve the correct shop's referral rule
 *
 * @returns {Promise<string>} Generated discount code
 * @throws {Error} Customer-friendly error message
 */
export const generateReferralDiscountCode = async (admin, customerId, referralCode, sessionId) => {
    // ── Validate inputs ───────────────────────────────────────────────────────
    if (!admin?.graphql) throw new Error("Something went wrong. Please try again later.");
    if (!customerId) throw new Error("Customer not found. Please login again.");
    if (!referralCode || typeof referralCode !== "string") throw new Error("Invalid referral code.");
    if (!sessionId) throw new Error("Valid shop session required.");

    const customerGid = normalizeCustomerGid(customerId);
    if (!customerGid) throw new Error("Invalid customer. Please try again.");

    const ctx = { customerId, referralCode, sessionId };

    // ── Resolve active referral rule ────────────────────────────────────────
    const referralRule = await getPointRuleByEvent("REFERRAL", sessionId);
    if (!referralRule?.isActive) throw new Error("Referral not available right now");

    const referralTrigger = referralRule?.conditions?.referral?.trigger ?? "oneTime";
    const referredEarningRule = referralRule?.conditions?.referral?.referred ?? null;
    if (!referredEarningRule) throw new Error("Referral reward is not available right now.");

    // ── Generate code ─────────────────────────────────────────────────────────
    const code = await generateDiscountCode().catch((err) => {
        logger.error(MODULE, "Failed to generate discount code", { error: err?.message, ...ctx });
        throw new Error("Something went wrong. Please try again later.");
    });

    const title = buildTitle(code, referredEarningRule);
    const discountValue = buildDiscountValue(referredEarningRule);

    // ── Shopify mutation ──────────────────────────────────────────────────────
    const json = await runDiscountMutation(admin, {
        code,
        title,
        customerGid,
        discountValue,
        referralTrigger,
    }).catch((err) => {
        logger.error(MODULE, "Shopify GraphQL request failed", { error: err?.message, ...ctx });
        throw new Error("Something went wrong. Please try again later.");
    });

    // ── Handle errors & extract code ──────────────────────────────────────────
    const userErrors = json?.data?.discountCodeBasicCreate?.userErrors;
    if (userErrors?.length) {
        logger.error(MODULE, "Shopify userErrors", { userErrors, ...ctx });
        throw new Error("Failed to create discount. Please try again.");
    }

    const discountCode =
        json?.data?.discountCodeBasicCreate?.codeDiscountNode?.codeDiscount?.codes?.nodes?.[0]?.code;
    const discountNodeId = json?.data?.discountCodeBasicCreate?.codeDiscountNode?.id || null;

    if (!discountCode) {
        logger.error(MODULE, "Discount code missing in response", { json, ...ctx });
        throw new Error("Something went wrong while generating your reward.");
    }

    logger.success(MODULE, "Discount code created", { discountCode, discountNodeId, ...ctx });

    // See generateRewardVoucher.js's matching comment — callers now get an
    // object (code + discountNodeId) instead of a plain string.
    return { code: discountCode, discountNodeId };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds the display title for the discount, e.g. "ABC123_REFERRAL_$10" or
 * "ABC123_REFERRAL_15%".
 *
 * @param {string} code
 * @param {{ discountType: "fixed"|"percentage", discountValue: number }} earningRule
 * @returns {string}
 */
function buildTitle(code, { discountType, discountValue }) {
    const suffix = discountType === "fixed" ? `$${discountValue}` : `${discountValue}%`;
    return `${code}_REFERRAL_${suffix}`;
}

/**
 * Builds the Shopify discount value object based on the referral earning rule.
 *
 * @param {{ discountType: "fixed"|"percentage", discountValue: number }} earningRule
 * @returns {Object} Shopify-compatible discount value input
 * @throws {Error} If discountType is neither "fixed" nor "percentage"
 */
function buildDiscountValue({ discountType, discountValue }) {
    if (discountType === "fixed") {
        return {
            discountAmount: {
                amount: String(discountValue || 0),
                appliesOnEachItem: false,
            },
        };
    }

    if (discountType === "percentage") {
        const raw = Number(discountValue || 0);
        return { percentage: Math.min(1, raw > 1 ? raw / 100 : raw) };
    }

    throw new Error("Invalid reward configuration.");
}

/**
 * Executes the Shopify discountCodeBasicCreate GraphQL mutation for a referral reward.
 *
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {Object} params
 * @param {string} params.code            - Generated discount code string
 * @param {string} params.title           - Display title for the discount
 * @param {string} params.customerGid     - Shopify customer GID
 * @param {Object} params.discountValue   - Shopify-compatible discount value input
 * @param {"oneTime"|"subscription"|"both"} params.referralTrigger - Which purchase types the discount applies to
 *
 * @returns {Promise<Object>} Raw Shopify GraphQL JSON response
 */
async function runDiscountMutation(admin, { code, title, customerGid, discountValue, referralTrigger }) {
    return callShopifyGraphql(
        admin,
        `#graphql
        mutation CreateDiscountCode($basicCodeDiscount: DiscountCodeBasicInput!) {
            discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
                codeDiscountNode {
                    id
                    codeDiscount {
                        ... on DiscountCodeBasic {
                            title
                            codes(first: 1) {
                                nodes { code }
                            }
                        }
                    }
                }
                userErrors { field message }
            }
        }`,
        {
            basicCodeDiscount: {
                title,
                code,
                startsAt: new Date().toISOString(),
                endsAt: null,
                customerSelection: { customers: { add: [customerGid] } },
                customerGets: {
                    appliesOnOneTimePurchase: referralTrigger === "oneTime" || referralTrigger === "both",
                    appliesOnSubscription: referralTrigger === "subscription" || referralTrigger === "both",
                    value: discountValue,
                    items: { all: true },
                },
                usageLimit: 1,
                appliesOncePerCustomer: true,
            },
        }
    );
}

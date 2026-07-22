import { logger } from "app/utils/logger";
import { normalizeCustomerGid } from "../../../controller/customers/normalizeCustomerGid";
import { generateDiscountCode } from "../../../utils/generateDiscountCode";
import { callShopifyGraphql } from "../../../utils/shopifyGraphql.js";

/**
 * Generates a reward voucher/discount code for a customer via Shopify GraphQL.
 *
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string|number} customerId - Shopify customer ID (GID or numeric)
 * @param {Object} rewardRule - Reward rule config
 * @param {number} rewardRule.id - Reward rule ID
 * @param {"fixed"|"percentage"} rewardRule.discountType - Discount type
 * @param {number} rewardRule.rewardValue - Discount amount or percentage
 *
 * @returns {Promise<{code: string, discountNodeId: string|null}>} Generated discount code and its Shopify GID
 *
 * @throws {Error} Customer-friendly error message
 */
export const generateRewardVoucher = async (admin, customerId, rewardRule) => {
    // ── Validate inputs ───────────────────────────────────────────────────────
    if (!admin?.graphql) throw new Error("Something went wrong. Please try again later.");
    if (!customerId) throw new Error("Customer not found. Please login again.");
    if (!rewardRule?.id) throw new Error("Reward is not available right now.");
    if (!["fixed", "percentage"].includes(rewardRule.discountType)) throw new Error("Invalid reward configuration.");

    const customerGid = normalizeCustomerGid(customerId);
    if (!customerGid) throw new Error("Invalid customer. Please try again.");

    const ctx = { customerId, rewardRuleId: rewardRule.id };

    // ── Generate code ─────────────────────────────────────────────────────────
    const code = await generateDiscountCode().catch((err) => {
        logger.error("Failed to generate discount code", err, ctx);
        throw new Error("Something went wrong. Please try again later.");
    });

    // ── Build discount value ──────────────────────────────────────────────────
    const discountValue = buildDiscountValue(rewardRule);

    // ── Shopify mutation ──────────────────────────────────────────────────────
    const json = await runDiscountMutation(admin, { code, customerGid, discountValue }).catch((err) => {
        logger.error("Shopify GraphQL request failed", err, ctx);
        throw new Error("Something went wrong. Please try again later.");
    });

    // ── Handle errors & extract code ──────────────────────────────────────────
    const userErrors = json?.data?.discountCodeBasicCreate?.userErrors;
    if (userErrors?.length) {
        logger.error("Shopify userErrors", { userErrors, ...ctx });
        throw new Error("Failed to create voucher. Please try again.");
    }

    const discountCode =
        json?.data?.discountCodeBasicCreate?.codeDiscountNode?.codeDiscount?.codes?.nodes?.[0]?.code;
    const discountNodeId = json?.data?.discountCodeBasicCreate?.codeDiscountNode?.id || null;

    if (!discountCode) {
        logger.error("Discount code missing in response", { json, ...ctx });
        throw new Error("Something went wrong while generating your reward. Please try again.");
    }

    logger.success("Reward voucher created", { discountCode, discountNodeId, ...ctx });

    // Callers previously got just the code string back — now an object, so
    // the codeDiscountNode GID can be persisted on the Reward row at
    // creation time (see Reward.discountNodeId's schema comment for why:
    // it's needed later by discountDeleteJob.js, and there's no cheaper way
    // to get it than capturing it right here).
    return { code: discountCode, discountNodeId };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds the Shopify discount value object based on reward rule config.
 *
 * @param {Object} rewardRule
 * @param {"fixed"|"percentage"} rewardRule.discountType
 * @param {number} rewardRule.rewardValue
 *
 * @returns {Object} Shopify-compatible discount value input
 */
function buildDiscountValue({ discountType, rewardValue }) {
    if (discountType === "fixed") {
        return {
            discountAmount: {
                amount: String(rewardValue ?? 0),
                appliesOnEachItem: false,
            },
        };
    }

    const raw = Number(rewardValue ?? 0);
    return { percentage: Math.min(1, raw > 1 ? raw / 100 : raw) };
}

/**
 * Executes the Shopify discountCodeBasicCreate GraphQL mutation.
 *
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {Object} params
 * @param {string} params.code - Generated discount code string
 * @param {string} params.customerGid - Shopify customer GID
 * @param {Object} params.discountValue - Shopify-compatible discount value input
 *
 * @returns {Promise<Object>} Raw Shopify GraphQL JSON response
 */
async function runDiscountMutation(admin, { code, customerGid, discountValue }) {
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
                title: code,
                code,
                startsAt: new Date().toISOString(),
                endsAt: null,
                customerSelection: { customers: { add: [customerGid] } },
                customerGets: {
                    appliesOnOneTimePurchase: true,
                    appliesOnSubscription: true,
                    value: discountValue,
                    items: { all: true },
                },
                usageLimit: 1,
                appliesOncePerCustomer: true,
            },
        }
    );
}
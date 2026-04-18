import { logger } from "app/utils/logger";
import { normalizeCustomerGid } from "../../../controller/customers/normalizeCustomerGid";
import { generateDiscountCode } from "../../../utils/generateDiscountCode";
import { getPointRuleByEvent } from "../../../controller/pointsRule/getPointRuleByEvent";

/**
 * Generates a referral-based discount code for a specific customer using Shopify GraphQL API.
 *
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {Function} admin.graphql - GraphQL executor
 * @param {string|number} customerId - Shopify customer ID
 * @param {string} referralCode - Referral code (for tracking)
 *
 * @returns {Promise<string>} Discount code
 *
 * @throws {Error} Customer-friendly error message
 */
export const generateReferralDiscountCode = async (admin, customerId, referralCode) => {
    try {
        // ==============================
        // 🔴 INPUT VALIDATION
        // ==============================
        if (!admin || typeof admin.graphql !== "function") {
            throw new Error("Something went wrong. Please try again later.");
        }

        if (!customerId) {
            throw new Error("Customer not found. Please login again.");
        }

        if (!referralCode || typeof referralCode !== "string") {
            throw new Error("Invalid referral code.");
        }

        // ==============================
        // 🔹 Normalize customer GID
        // ==============================
        const customerGid = normalizeCustomerGid(customerId);

        if (!customerGid) {
            throw new Error("Invalid customer. Please try again.");
        }

        // ==============================
        // 🔹 Get referral rule
        // ==============================
        const referralRule = await getPointRuleByEvent("Referral");
        const referredEarningRule = referralRule?.conditions?.referredEarning ?? null;

        if (!referredEarningRule) {
            throw new Error("Referral reward is not available right now.");
        }

        // ==============================
        // 🔹 Generate discount code
        // ==============================
        const randomCode = generateDiscountCode();

        const discountCodeInput = `${randomCode}_${referredEarningRule.type === "fixed"
            ? `$${referredEarningRule.amount}`
            : `${referredEarningRule.amount}%`
            }`;

        // ==============================
        // 🔹 Build discount value
        // ==============================
        let discountInput = null;

        if (referredEarningRule.type === "fixed") {
            discountInput = {
                discountAmount: {
                    amount: String(referredEarningRule.amount || 0),
                    appliesOnEachItem: false
                }
            };
        } else if (referredEarningRule.type === "percentage") {
            const percentValue = Number(referredEarningRule.amount || 0);

            discountInput = {
                percentage: Math.min(
                    1,
                    percentValue > 1 ? percentValue / 100 : percentValue
                )
            };
        } else {
            throw new Error("Invalid reward configuration.");
        }

        // ==============================
        // 🔹 Shopify GraphQL Call
        // ==============================
        const response = await admin.graphql(
            `#graphql
            mutation CreateDiscountCode($basicCodeDiscount: DiscountCodeBasicInput!) {
                discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
                    codeDiscountNode {
                        id
                        codeDiscount {
                            ... on DiscountCodeBasic {
                                title
                                codes(first: 1) {
                                    nodes {
                                        code
                                    }
                                }
                            }
                        }
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }`,
            {
                variables: {
                    basicCodeDiscount: {
                        title: discountCodeInput,
                        code: discountCodeInput,
                        startsAt: new Date().toISOString(),
                        endsAt: null,
                        customerSelection: {
                            customers: {
                                add: [customerGid]
                            }
                        },
                        customerGets: {
                            value: discountInput,
                            items: { all: true }
                        },
                        usageLimit: 1,
                        appliesOncePerCustomer: true
                    }
                }
            }
        );

        const json = await response.json();

        // ==============================
        // 🔴 Shopify Errors
        // ==============================
        const errors = json?.data?.discountCodeBasicCreate?.userErrors;

        if (errors?.length) {
            logger.error("Shopify Discount Error", { errors });

            // Show only safe message to user
            throw new Error("Failed to create discount. Please try again.");
        }

        // ==============================
        // 🔹 Extract code
        // ==============================
        const discountCode =
            json?.data?.discountCodeBasicCreate?.codeDiscountNode?.codeDiscount?.codes?.nodes?.[0]?.code;

        if (!discountCode) {
            logger.error("Discount code missing in response", { json });
            throw new Error("Something went wrong while generating your reward.");
        }

        logger.success("Discount code created", {
            customerId,
            referralCode,
            discountCode
        });

        return discountCode;

    } catch (error) {
        // 🔴 Internal log (full details)
        logger.error("generateReferralDiscountCode failed", {
            message: error.message,
            stack: error.stack,
            customerId,
            referralCode
        });

        // 🔴 Throw clean message (frontend-safe)
        throw new Error(error.message || "Something went wrong. Please try again.");
    }
};
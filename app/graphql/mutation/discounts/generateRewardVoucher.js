import { logger } from "app/utils/logger";
import { normalizeCustomerGid } from "../../../controller/customers/normalizeCustomerGid";
import { generateDiscountCode } from "../../../utils/generateDiscountCode";

/**
 * Generates a reward voucher/discount code for a specific customer using Shopify GraphQL API.
 *
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {Function} admin.graphql - GraphQL executor
 * @param {string|number} customerId - Shopify customer ID
 * @param {json} reward - Reward data (for validation and config)
 *
 * @returns {Promise<string>} Discount code
 *
 * @throws {Error} Customer-friendly error message
 */
export const generateRewardVoucher = async (admin, customerId, reward) => {
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

        if (!reward && !reward?.id) {
            throw new Error("Reward is not available right now.");
        }

        // ==============================
        // 🔹 Normalize customer GID
        // ==============================
        const customerGid = normalizeCustomerGid(customerId);

        if (!customerGid) {
            throw new Error("Invalid customer. Please try again.");
        }

        // ==============================
        // 🔹 Generate discount code
        // ==============================
        const discountCodeInput = generateDiscountCode();


        // ==============================
        // 🔹 Build discount value
        // ==============================
        let discountInput = null;

        if (reward.discountType === "fixed") {
            discountInput = {
                discountAmount: {
                    amount: String(reward.rewardValue || 0),
                    appliesOnEachItem: false
                }
            };
        } else if (reward.discountType === "percentage") {
            const percentValue = Number(reward.rewardValue || 0);

            discountInput = {
                percentage: Math.min(1, percentValue > 1 ? percentValue / 100 : percentValue)
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
                            appliesOnOneTimePurchase: true,
                            appliesOnSubscription: true,
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
            throw new Error("Failed to create voucher/discount. Please try again.");
        }

        // ==============================
        // 🔹 Extract code
        // ==============================
        const discountCode =
            json?.data?.discountCodeBasicCreate?.codeDiscountNode?.codeDiscount?.codes?.nodes?.[0]?.code;

        if (!discountCode) {
            logger.error("Discount code missing in response", { json });
            throw new Error("Something went wrong while generating your reward voucher.");
        }

        logger.success("Reward Voucher/Discount code created", {
            customerId,
            rewardId: reward?.id,
            discountCode
        });

        return discountCode;

    } catch (error) {
        // 🔴 Internal log (full details)
        logger.error("Generate reward/discount code failed", {
            message: error.message,
            stack: error.stack,
            module: "graphql/mutation/discount/generateRewardVoucher.js"
        });

        // 🔴 Throw clean message (frontend-safe)
        throw new Error(error.message || "Something went wrong. Please try again.");
    }
};
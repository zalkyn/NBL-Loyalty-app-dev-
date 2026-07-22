import prisma from "../../db.server.js";
import { logger } from "../../utils/logger.js";
import { dbRetry } from "../../utils/retry/dbRetry.js";
import { DEFAULT_REWARD_SELECT } from "./rewardSelect.js";

/**
 * Fetches a single customer reward by ID.
 *
 * @param {number|string} rewardId
 * @param {Object} [select] - Prisma select object to control returned fields.
 * @returns {Promise<Object|null>} Reward or null if not found.
 *
 * @example
 * // All default fields
 * await getCustomerReward(101)
 *
 * // Only specific fields
 * await getCustomerReward(101, { id: true, status: true, code: true })
 */
export const getCustomerReward = async (rewardId, select = DEFAULT_REWARD_SELECT) => {
    try {
        const reward = await dbRetry(
            () => prisma.reward.findUnique({ where: { id: Number(rewardId) }, select }),
            { rewardId }
        );

        if (!reward) {
            logger.warn("Reward not found", { rewardId });
            return null;
        }

        return reward;
    } catch (error) {
        logger.error("Failed to fetch customer reward", {
            rewardId,
            error: error?.message,
            stack: error?.stack,
        });
        return null;
    }
};

/**
 * Fetches all rewards for a specific customer.
 * Optionally filter by status, event, type, and expiry.
 *
 * @param {number|string} customerId
 * @param {Object}  [filters={}]
 * @param {string}  [filters.status]          - "PENDING" | "ACTIVE" | "USED" | "EXPIRED" | "CANCELLED" | "REDEEMED" | "FAILED"
 * @param {string}  [filters.event]           - "ORDER" | "REFERRAL" | "BIRTHDAY" | "REVIEW" | "SIGNUP" | "SUBSCRIPTION" | "MANUAL" | "CAMPAIGN"
 * @param {string}  [filters.type]            - "FIRST" | "RECURRING" | "VERIFIED" | "BONUS" | "DEFAULT"
 * @param {boolean} [filters.excludeExpired]  - Exclude rewards past their expiresAt date.
 * @param {Object}  [select]                  - Prisma select object to control returned fields.
 * @returns {Promise<Object[]>} List of rewards or empty array on failure.
 *
 * @example
 * // All rewards with default fields
 * await getCustomerRewards(42)
 *
 * // Filtered rewards with only specific fields
 * await getCustomerRewards(
 *     42,
 *     { status: "ACTIVE", excludeExpired: true },
 *     { id: true, code: true, expiresAt: true }
 * )
 */
export const getCustomerRewards = async (customerId, filters = {}, select = DEFAULT_REWARD_SELECT) => {
    try {
        const { status, event, type, excludeExpired = false } = filters;

        const rewards = await dbRetry(
            () =>
                prisma.reward.findMany({
                    where: {
                        customerId: Number(customerId),
                        ...(status && { status }),
                        ...(event && { event }),
                        ...(type && { type }),
                        ...(excludeExpired && {
                            OR: [
                                { expiresAt: null },
                                { expiresAt: { gt: new Date() } },
                            ],
                        }),
                    },
                    select,
                    orderBy: { createdAt: "desc" },
                }),
            { customerId }
        );

        return rewards;
    } catch (error) {
        logger.error("Failed to fetch customer rewards", {
            customerId,
            filters,
            error: error?.message,
            stack: error?.stack,
        });
        return [];
    }
};

/**
 * Fetches a reward by its unique rewardKey (idempotency key).
 *
 * @param {string} rewardKey
 * @param {Object} [select] - Prisma select object to control returned fields.
 * @returns {Promise<Object|null>} Reward or null if not found.
 *
 * @example
 * // Check existence only
 * await getCustomerRewardByKey("ORDER:FIRST:42:ORD_001", { id: true })
 */
export const getCustomerRewardByKey = async (rewardKey, select = DEFAULT_REWARD_SELECT) => {
    try {
        const reward = await dbRetry(
            () => prisma.reward.findUnique({ where: { rewardKey }, select }),
            { rewardKey }
        );

        if (!reward) {
            logger.warn("Reward not found by key", { rewardKey });
            return null;
        }

        return reward;
    } catch (error) {
        logger.error("Failed to fetch reward by key", {
            rewardKey,
            error: error?.message,
            stack: error?.stack,
        });
        return null;
    }
};

/**
 * Fetches a reward by its discount code, optionally scoped to a customer.
 *
 * `code` has no unique constraint at the database level, so two shops
 * could in principle generate matching codes. Passing `customerId` narrows
 * the match to that customer's own reward and prevents a cross-shop
 * collision from resolving to the wrong reward record; omit it only for
 * callers that intentionally search across all customers.
 *
 * Retried on transient DB failure — this backs the redemption/validation
 * flow, where a dropped connection should not surface as a false
 * "reward not found" to the customer.
 *
 * @param {string} code
 * @param {Object} [select] - Prisma select object to control returned fields.
 * @param {number|string} [customerId] - Restricts the match to this customer's rewards.
 * @returns {Promise<Object|null>} Reward or null if not found.
 *
 * @example
 * // Fetch for redemption — scoped to the customer, only fields needed for validation
 * await getCustomerRewardByCode("NBL_A3K9XZT_REFERRAL", {
 *     id:        true,
 *     status:    true,
 *     expiresAt: true,
 *     pointsCost: true,
 * }, customerId)
 */
export const getCustomerRewardByCode = async (code, select = DEFAULT_REWARD_SELECT, customerId = null) => {
    try {
        const reward = await dbRetry(
            () =>
                prisma.reward.findFirst({
                    where: {
                        code,
                        ...(customerId !== null && { customerId: Number(customerId) }),
                    },
                    select,
                }),
            { code, customerId }
        );

        if (!reward) {
            logger.warn("Reward not found by code", { code, customerId });
            return null;
        }

        return reward;
    } catch (error) {
        logger.error("Failed to fetch reward by code", {
            code,
            customerId,
            error: error?.message,
            stack: error?.stack,
        });
        return null;
    }
};

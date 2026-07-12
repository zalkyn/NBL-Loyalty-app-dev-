import prisma from "../../db.server.js";
import { logger } from "../../utils/logger.js";
import { dbRetry } from "../../utils/retry/dbRetry.js";
import { DEFAULT_REFERRAL_SELECT } from "./referralSelect.js";

/**
 * Fetches a single referral by ID.
 *
 * @param {number|string} referralId
 * @param {Object} [select] - Prisma select object to control returned fields.
 * @returns {Promise<Object|null>} Referral or null if not found.
 *
 * @example
 * await getReferral(10)
 * await getReferral(10, { id: true, status: true })
 */
export const getReferral = async (referralId, select = DEFAULT_REFERRAL_SELECT) => {
    try {
        const referral = await dbRetry(
            () => prisma.referral.findUnique({ where: { id: Number(referralId) }, select }),
            { referralId }
        );

        if (!referral) {
            logger.warn("Referral not found", { referralId });
            return null;
        }

        return referral;
    } catch (error) {
        logger.error("Failed to fetch referral", {
            referralId,
            error: error?.message,
            stack: error?.stack,
        });
        // "Not found" is already handled above via the `!referral` check —
        // reaching this catch means the query itself failed, so surface it
        // instead of returning the same null a legitimate not-found would.
        throw error;
    }
};

/**
 * Fetches the referral record for a referred customer.
 * Since @@unique([referredId]), a customer can only be referred once.
 *
 * @param {number|string} referredId
 * @param {Object} [select] - Prisma select object to control returned fields.
 * @returns {Promise<Object|null>} Referral or null if not found.
 *
 * @example
 * await getReferralByReferredId(42)
 */
export const getReferralByReferredId = async (referredId, select = DEFAULT_REFERRAL_SELECT) => {
    try {
        const referral = await dbRetry(
            () => prisma.referral.findUnique({ where: { referredId: Number(referredId) }, select }),
            { referredId }
        );

        if (!referral) {
            logger.warn("Referral not found for referred customer", { referredId });
            return null;
        }

        return referral;
    } catch (error) {
        logger.error("Failed to fetch referral by referredId", {
            referredId,
            error: error?.message,
            stack: error?.stack,
        });
        // Same reasoning as getReferral() above — don't let a failed query
        // masquerade as "this customer has no referral".
        throw error;
    }
};

/**
 * Fetches all referrals made by a specific referrer customer.
 * Optionally filter by status.
 *
 * @param {number|string} referrerId
 * @param {Object}  [filters={}]
 * @param {string}  [filters.status]        - "ACTIVE" | "PENDING" | "USED" | "CANCELLED" | "EXPIRED"
 * @param {boolean} [filters.rewardGiven]   - Filter by whether reward has been given.
 * @param {boolean} [filters.discountUsed]  - Filter by whether discount has been used.
 * @param {Object}  [select]                - Prisma select object to control returned fields.
 * @returns {Promise<Object[]>} List of referrals or empty array on failure.
 *
 * @example
 * // All referrals by referrer
 * await getReferralsByReferrerId(1)
 *
 * // Only pending referrals
 * await getReferralsByReferrerId(1, { status: "PENDING" })
 *
 * // Referrals where reward not yet given
 * await getReferralsByReferrerId(1, { rewardGiven: false })
 */
export const getReferralsByReferrerId = async (referrerId, filters = {}, select = DEFAULT_REFERRAL_SELECT) => {
    try {
        const { status, rewardGiven, discountUsed } = filters;

        const referrals = await dbRetry(
            () =>
                prisma.referral.findMany({
                    where: {
                        referrerId: Number(referrerId),
                        ...(status !== undefined && { status }),
                        ...(rewardGiven !== undefined && { rewardGiven }),
                        ...(discountUsed !== undefined && { discountUsed }),
                    },
                    select,
                    orderBy: { createdAt: "desc" },
                }),
            { referrerId }
        );

        return referrals;
    } catch (error) {
        logger.error("Failed to fetch referrals by referrerId", {
            referrerId,
            filters,
            error: error?.message,
            stack: error?.stack,
        });
        // An empty array here would read as "referrer has no referrals",
        // which is a real, valid state — don't conflate it with a failed query.
        throw error;
    }
};

/**
 * Fetches a referral by its discount code.
 * Useful for validating and redeeming referral discounts at checkout.
 *
 * Retried on transient DB failure — this backs checkout-time validation,
 * where a dropped connection should not surface as a false "not found".
 *
 * @param {string} discountCode
 * @param {Object} [select] - Prisma select object to control returned fields.
 * @returns {Promise<Object|null>} Referral or null if not found.
 *
 * @example
 * await getReferralByDiscountCode("NBL_A3K9XZT_REFERRAL")
 *
 * // Minimal select for checkout validation
 * await getReferralByDiscountCode("NBL_A3K9XZT_REFERRAL", {
 *     id:           true,
 *     status:       true,
 *     discountUsed: true,
 *     referredId:   true,
 * })
 */
export const getReferralByDiscountCode = async (discountCode, select = DEFAULT_REFERRAL_SELECT) => {
    try {
        const referral = await dbRetry(
            () => prisma.referral.findFirst({ where: { discountCode }, select }),
            { discountCode }
        );

        if (!referral) {
            logger.warn("Referral not found by discount code", { discountCode });
            return null;
        }

        return referral;
    } catch (error) {
        logger.error("Failed to fetch referral by discount code", {
            discountCode,
            error: error?.message,
            stack: error?.stack,
        });
        // Same reasoning as above — a failed lookup is not the same thing
        // as "this discount code doesn't exist", and checkout-time callers
        // need to be able to tell the two apart.
        throw error;
    }
};

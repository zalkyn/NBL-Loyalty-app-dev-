import prisma from "../../db.server.js";
import { logger } from "../../utils/logger.js";

/**
 * ============================================================
 * 🎁 Create Customer Reward
 * ============================================================
 *
 * Creates a reward entry for a customer with idempotency support.
 * Prevents duplicate reward creation using a generated rewardKey.
 *
 * Supports multiple event sources:
 * - REFERRAL
 * - ORDER
 * - REVIEW
 * - MANUAL
 *
 * @param {Object} input
 * @param {number|string} input.customerId - Customer ID (required)
 * @param {string} [input.event] - Reward event type
 * (REFERRAL | ORDER | REVIEW | CAMPAIGN | MANUAL)
 *
 * @param {string} [input.type] - Reward sub type
 * REFERRAL: FIRST | RECURRING | BONUS
 * ORDER: FIRST_ORDER | REPEAT_ORDER | HIGH_VALUE
 * REVIEW: VERIFIED | PHOTO_REVIEW | VIDEO_REVIEW
 * DEFAULT: GEN | MANUAL
 * 
 * @param {string} [input.status] - Reward Status // PENDING, COMPLETED, CANCELLED
 *
 * @param {string} [input.title] - Reward title
 * @param {string} [input.code] - Coupon or referral code
 * @param {string} [input.orderId] - Order reference ID (optional)
 * @param {string} [input.reviewId] - Review reference ID (optional)
 * @param {string} [input.referralId] - Referral reference ID (optional)
 * @param {number|string} [input.pointsCost] - Points value
 * @param {string} [input.expiresAt] - Expiry date
 * @param {Object} [input.metadata] - Extra JSON data
 * @param {string} [input.description] - Reward description
 * @param {number|string} [input.rewardId] - Linked reward ID
 * @param {Object} [externalTx] - Optional Prisma transaction client
 *
 * @returns {Promise<Object|undefined>}
 * Returns created reward or undefined if duplicate/error occurs
 */



export const createCustomerReward = async (input) => {
    try {
        const customerId = Number(input.customerId);

        /**
         * Idempotency key (prevents duplicate rewards)
         */
        const random8 = () => Math.random().toString(36).slice(2, 10);

        const entityId = input.orderId || input.reviewId || input.referralId || "0";

        const rewardKey =
            `${input.event || "EVT"}:${input.type || "GEN"}:${customerId}:${entityId}:${random8()}`;

        /**
         * Build database payload
         */
        const data = {
            customerId,
            rewardKey,
            usedAt: new Date()
        };

        if (input.title) data.title = input.title;
        if (input.event) data.event = input.event;
        if (input.type) data.type = input.type;
        if (input.code) data.code = input.code;
        if (input.orderId) data.orderId = input.orderId;
        if (input.pointsCost !== undefined) data.pointsCost = Number(input.pointsCost);
        if (input.expiresAt) data.expiresAt = input.expiresAt;
        if (input.metadata) data.metadata = input.metadata;
        if (input.description) data.description = input.description;
        if (input.rewardId) data.rewardId = Number(input.rewardId);

        /**
         * Create reward record
         */

        // 1. Create Customer Reward
        const newReward = await prisma.customerReward.create({
            data
        });

        // 2. Create Activity Log for Reward
        await prisma.activityLog.create({
            data: {
                customerId: Number(input.customerId),
                activityType: "REWARD_ISSUED",
                source: input.event || "SYSTEM",
                status: "SUCCESS",
                referenceId: newReward.id.toString(),
                metadata: { rewardKey, event: input.event, type: input.type }
            }
        });

        /**
         * SUCCESS LOG
         */
        logger.info("Customer reward created", {
            rewardId: newReward.id,
            customerId,
            event: input.event,
            type: input.type,
            pointsCost: newReward.pointsCost,
            rewardKey: newReward.rewardKey
        });

        return newReward;

    } catch (error) {
        /**
         * Ignore duplicate reward (idempotency hit)
         */
        if (error?.code === "P2002") {
            logger.warn("Duplicate reward skipped", {
                customerId: input.customerId,
                event: input.event,
                type: input.type
            });
            return;
        }

        /**
         * Log unexpected errors
         */
        logger.error("Customer reward creation failed", {
            error: error?.message,
            stack: error?.stack
        });

        return;
    }
};
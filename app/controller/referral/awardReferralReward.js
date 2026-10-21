import prisma from "../../db.server.js";
import { logger } from "../../utils/logger.js";
import { dbRetry } from "../../utils/retry/dbRetry.js";
import createTransaction from "../transaction/createTransaction.js";
import { updateReferral } from "./updateReferral.js";
import { getCustomerRewardByCode } from "../customerReward/getCustomerReward.js";
import { updateCustomerReward } from "../customerReward/updateCustomerReward.js";

const MODULE = "controller/referral/awardReferralReward.js";

/**
 * Creates one referral EARN transaction exactly once per (customer, referral,
 * order), and throws if it could not be created.
 *
 * Two problems this closes:
 *  - createTransaction() returns null on any failure instead of throwing, and
 *    callers used to ignore that — the referral was still marked USED /
 *    rewardGiven, so a failed points award vanished with no retry.
 *  - Throwing so a job retries is only safe if a retry can't award the same
 *    customer twice, so an already-recorded award for this order is reused.
 *
 * @returns {Promise<Object>} the existing or newly created transaction
 */
export const awardReferralEarn = async ({ session, shop, referral, orderGid, input }) => {
    const existing = await dbRetry(
        () =>
            prisma.transaction.findFirst({
                where: {
                    customerId: input.customerId,
                    referralId: referral.id,
                    type: "EARN",
                    metadata: { path: ["orderId"], equals: orderGid },
                },
                select: { id: true },
            }),
        { module: MODULE, shop, referralId: referral.id }
    );
    if (existing) {
        logger.warn(MODULE, "Referral points already recorded for this order — not awarding twice", {
            shop, referralId: referral.id, customerId: input.customerId, orderId: orderGid,
        });
        return existing;
    }

    const transaction = await createTransaction(input, session);
    if (!transaction) {
        throw new Error(`Referral points could not be recorded for customer ${input.customerId} (referral ${referral.id})`);
    }
    return transaction;
};

/**
 * Marks the referred customer's discount-code reward as used — scoped to the
 * referred customer so a code collision on another shop can never resolve to
 * the wrong reward.
 */
export const markReferralVoucherUsed = async ({ referral, orderGid }) => {
    const existingReward = await getCustomerRewardByCode(
        referral.discountCode,
        { id: true, status: true },
        referral.referredId
    );
    if (existingReward) {
        await updateCustomerReward(existingReward.id, {
            status: "USED",
            discountUsed: true,
            usedAt: new Date(),
            orderId: orderGid,
        });
    }
};

/**
 * Awards the FIRST-order referral reward to both customers and closes the
 * referral. Used by the order-paid job and by the merchant's "approve" action
 * on a held referral, so both do exactly the same thing.
 *
 * Points first, referral state last: if any award fails this throws, the
 * caller retries (awards are idempotent per order) and the referral stays
 * unclaimed. `rewardGiven` is only set once the points really exist.
 *
 * @param {Object} args
 * @param {Object} args.session
 * @param {string} args.shop
 * @param {Object} args.referral
 * @param {number} args.eventId
 * @param {string} args.orderGid
 * @param {string} args.orderLabel
 * @param {string|number} args.orderTotal
 * @param {number} args.referrerPoints
 * @param {number} args.referredPoints
 * @param {Object|null} [args.subscriptionContract]
 * @param {Object} [args.extraMetadata] - merged into referral.metadata (e.g. reviewFlag, approval)
 */
export const awardFirstReferralReward = async ({
    session, shop, referral, eventId, orderGid, orderLabel, orderTotal,
    referrerPoints, referredPoints, subscriptionContract = null, extraMetadata = {},
}) => {
    await awardReferralEarn({
        session, shop, referral, orderGid,
        input: {
            customerId: referral.referrerId,
            type: "EARN",
            eventId,
            referralId: referral.id,
            reason: `Referral reward — your friend placed their first order (${orderLabel})`,
            activity: `+${referrerPoints} points for successful referral`,
            points: referrerPoints,
            status: "COMPLETED",
            metadata: { orderId: orderGid, orderTotal },
        },
    });
    await awardReferralEarn({
        session, shop, referral, orderGid,
        input: {
            customerId: referral.referredId,
            type: "EARN",
            eventId,
            referralId: referral.id,
            reason: `Referral discount used on order ${orderLabel}`,
            activity: referredPoints > 0
                ? `+${referredPoints} points — referral discount applied on order ${orderLabel}`
                : `Referral discount code applied on order ${orderLabel}`,
            points: referredPoints,
            status: "COMPLETED",
            metadata: { orderId: orderGid, orderTotal },
        },
    });

    await updateReferral(referral.id, {
        status: "USED",
        discountUsed: true,
        rewardGiven: true,
        orderId: orderGid,
        subscriptionContractId: subscriptionContract?.id?.toString() ?? null,
        metadata: { ...(subscriptionContract ?? {}), ...extraMetadata },
    });

    await markReferralVoucherUsed({ referral, orderGid });
};

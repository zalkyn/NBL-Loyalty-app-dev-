import prisma from "../../db.server.js";
import { logger } from "../../utils/logger.js";
import { dbRetry } from "../../utils/retry/dbRetry.js";
import createTransaction from "../transaction/createTransaction.js";
import { updateReferral } from "./updateReferral.js";
import { getCustomerRewardByCode } from "../customerReward/getCustomerReward.js";
import { updateCustomerReward } from "../customerReward/updateCustomerReward.js";
import { notifyReferralOutcome } from "./notifyReferralOutcome.js";

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
export const awardReferralEarn = async ({ session, shop, referral, orderGid, input, kind = null }) => {
    const existing = await dbRetry(
        () =>
            prisma.transaction.findFirst({
                where: {
                    customerId: input.customerId,
                    referralId: referral.id,
                    type: "EARN",
                    // `kind` tells apart two awards on the SAME order: the referral
                    // reward that a payment releases, and the renewal points paid on
                    // that same payment when the merchant chooses both.
                    AND: [
                        { metadata: { path: ["orderId"], equals: orderGid } },
                        ...(kind ? [{ metadata: { path: ["kind"], equals: kind } }] : []),
                    ],
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
 * @param {boolean} [args.fullPrice] - true when this is the payment that released a
 *   reward that was waiting for the first full-price payment (changes the wording only)
 */
export const awardFirstReferralReward = async ({
    session, shop, referral, eventId, orderGid, orderLabel, orderTotal,
    referrerPoints, referredPoints, subscriptionContract = null, extraMetadata = {}, fullPrice = false,
}) => {
    await awardReferralEarn({
        session, shop, referral, orderGid,
        input: {
            customerId: referral.referrerId,
            type: "EARN",
            eventId,
            referralId: referral.id,
            reason: fullPrice
                ? `Referral reward — your friend's first full-price payment (${orderLabel})`
                : `Referral reward — your friend placed their first order (${orderLabel})`,
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
            reason: fullPrice
                ? `Referral bonus — your first full-price payment (${orderLabel})`
                : `Referral discount used on order ${orderLabel}`,
            activity: referredPoints > 0
                ? (fullPrice
                    ? `+${referredPoints} points — referral bonus for your first full-price payment (${orderLabel})`
                    : `+${referredPoints} points — referral discount applied on order ${orderLabel}`)
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

/**
 * Parks a referral reward until the referred member's first payment at the
 * full price. Nothing is awarded now. The discount code is already used
 * (Shopify applied it on this order), so it is closed off here.
 *
 * Both people wait: the referrer and the new member each get their points
 * only when the releasing payment arrives (see awardFirstReferralReward with
 * fullPrice = true, called from the order job).
 *
 * @param {Object} args
 * @param {Object} args.session
 * @param {string} args.shop
 * @param {Object} args.referral
 * @param {string} args.orderGid       - the first (promo) order
 * @param {string} args.orderLabel
 * @param {number} args.firstPaid      - what that order actually cost, remembered so the releasing payment must be higher
 * @param {Object|null} [args.subscriptionContract]
 * @param {Object} [args.extraMetadata] - merged in (e.g. reviewFlag, approval)
 */
export const deferFirstReferralReward = async ({
    session, shop, referral, orderGid, orderLabel, firstPaid, subscriptionContract = null, extraMetadata = {},
}) => {
    await updateReferral(referral.id, {
        status: "AWAITING_FULL_PRICE",
        discountUsed: true,
        rewardGiven: false,
        orderId: orderGid,
        subscriptionContractId: subscriptionContract?.id?.toString() ?? null,
        metadata: {
            ...(subscriptionContract ?? {}),
            ...extraMetadata,
            awaiting: { since: new Date().toISOString(), orderId: orderGid, orderLabel, firstPaid },
        },
    });
    await markReferralVoucherUsed({ referral, orderGid });

    await notifyReferralOutcome({ session, shop, referralId: referral.id, customerId: referral.referrerId, notice: "REWARD_AWAITING_REFERRER", orderGid });
    await notifyReferralOutcome({ session, shop, referralId: referral.id, customerId: referral.referredId, notice: "REWARD_AWAITING_REFERRED", orderGid });
};

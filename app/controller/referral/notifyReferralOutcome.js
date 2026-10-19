import prisma from "../../db.server.js";
import { logger } from "../../utils/logger.js";
import { dbRetry } from "../../utils/retry/dbRetry.js";
import createTransaction from "../transaction/createTransaction.js";

const MODULE = "controller/referral/notifyReferralOutcome.js";

/**
 * Customer-facing wording for every referral outcome that does NOT award
 * points. The widget shows any transaction with notifiedAt = null as a toast
 * and lists it in Activity, so a zero-point transaction is how a customer
 * finds out something happened. Neutral on purpose: a held reward must never
 * read like an accusation.
 */
export const REFERRAL_NOTICES = {
    HELD_REFERRER: {
        reason: "Referral reward is being reviewed",
        activity: "Your referral reward is being reviewed. We'll update you as soon as it's confirmed.",
    },
    HELD_REFERRED: {
        reason: "Referral bonus is being reviewed",
        activity: "Your referral discount was applied. Your referral bonus is being reviewed.",
    },
    REJECTED: {
        reason: "Referral reward was not approved",
        activity: "Your referral reward wasn't approved, so no points were added for this referral.",
    },
    SKIPPED_SUBSCRIPTION_ONLY: {
        reason: "Referral reward doesn't apply to this order",
        activity: "Your friend's first order wasn't a subscription order, so it doesn't qualify for the referral reward.",
    },
    SKIPPED_ONE_TIME_ONLY: {
        reason: "Referral reward doesn't apply to this order",
        activity: "Your friend's first order was a subscription order, so it doesn't qualify for the referral reward.",
    },
    SKIPPED_PROGRAM_INACTIVE: {
        reason: "Referral rewards are paused",
        activity: "Referral rewards are paused right now, so no points were added for this referral.",
    },
};

/**
 * Records a zero-point, customer-visible notice about a referral outcome,
 * at most once per (customer, referral, notice, order) so job retries never
 * repeat a toast. Never throws — a notice failing must not undo or block the
 * outcome it describes.
 *
 * @param {Object} args
 * @param {Object} args.session
 * @param {string} args.shop
 * @param {number} args.referralId
 * @param {number} args.customerId
 * @param {keyof REFERRAL_NOTICES} args.notice
 * @param {string} args.orderGid
 */
export async function notifyReferralOutcome({ session, shop, referralId, customerId, notice, orderGid }) {
    try {
        const text = REFERRAL_NOTICES[notice];
        if (!text) return null;

        const existing = await dbRetry(
            () =>
                prisma.transaction.findFirst({
                    where: {
                        customerId,
                        referralId,
                        AND: [
                            { metadata: { path: ["notice"], equals: notice } },
                            { metadata: { path: ["orderRef"], equals: orderGid } },
                        ],
                    },
                    select: { id: true },
                }),
            { module: MODULE, shop, referralId }
        );
        if (existing) return existing;

        return await createTransaction(
            {
                customerId,
                type: "EARN",
                points: 0,
                referralId,
                status: "PENDING",
                reason: text.reason,
                activity: text.activity,
                // "orderRef", deliberately NOT "orderId": awardReferralEarn's duplicate
                // check and orderReversalJob both look EARN transactions up by
                // metadata.orderId, and a notice must never be mistaken for an award.
                metadata: { notice, orderRef: orderGid },
            },
            session
        );
    } catch (err) {
        logger.error(MODULE, "Failed to record referral notice", { shop, referralId, customerId, notice, error: err?.message });
        return null;
    }
}

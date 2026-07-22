import prisma from "../../db.server.js";
import { logger } from "../../utils/logger.js";
import { getDiscountDeleteSettings } from "../appSettings/discountDeleteSettings.js";

const MODULE = "controller/jobs/enqueueDiscountDeleteJob.js";

/**
 * Enqueues a DISCOUNT_DELETE job for a Reward/Referral's discount code —
 * but ONLY if the shop has actually turned on cleanup for this trigger
 * (see discountDeleteSettings.js) and there's a discountNodeId to delete in
 * the first place (rows created before this feature shipped won't have
 * one — see Reward.discountNodeId's schema comment).
 *
 * Never throws — this is a best-effort hygiene action, not something that
 * should ever block or fail the caller's actual operation (a reward
 * cancellation or an order being marked paid). Any failure here is logged
 * and swallowed.
 *
 * @param {Object} params
 * @param {string} params.shop
 * @param {string} params.discountNodeId - Shopify GID of the codeDiscountNode to delete.
 * @param {"reward_cancel"|"reward_used"} params.source - Which trigger this came from; gates against the matching settings flag.
 * @param {"reward"|"referral"} params.entityType - For logging/debugging only.
 * @param {number} params.entityId - For logging/debugging only.
 * @returns {Promise<void>}
 */
export default async function enqueueDiscountDeleteJob({ shop, discountNodeId, source, entityType, entityId }) {
    try {
        if (!discountNodeId) return; // nothing to delete — pre-dates this feature, or generation never returned an id

        const settings = await getDiscountDeleteSettings(shop);
        const enabled = source === "reward_cancel" ? settings.onRewardCancel : settings.onRewardUsed;
        if (!enabled) return;

        await prisma.job.create({
            data: {
                type: "DISCOUNT_DELETE",
                shop,
                status: "PENDING",
                // Same discountNodeId could theoretically be enqueued twice
                // (e.g. a retried request) — the unique constraint on
                // idempotencyKey makes a duplicate enqueue a silent no-op
                // (P2002, caught below) rather than a second Job row.
                idempotencyKey: `DISCOUNT_DELETE:${discountNodeId}`,
                payload: { discountNodeId, source, entityType, entityId },
            },
        });

        logger.info(MODULE, "Discount-delete job enqueued", { shop, discountNodeId, source, entityType, entityId });
    } catch (error) {
        if (error?.code === "P2002") {
            logger.info(MODULE, "Discount-delete job already enqueued for this node — skipping duplicate", { shop, discountNodeId });
            return;
        }
        logger.error(MODULE, "Failed to enqueue discount-delete job", { shop, discountNodeId, source, error: error?.message });
    }
}

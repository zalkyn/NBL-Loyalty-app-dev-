import prisma from "../../db.server.js";
import { logger } from "../../utils/logger.js";

const MODULE = "controller/jobs/emptyCustomerConfig.js";

/**
 * TESTING ONLY. Starts a background job that clears (deletes from
 * Shopify) the split metafields of every customer who currently has a
 * synced config — see emptyCustomerConfigJob.js for the full rationale.
 * Only ever called after the caller has already re-verified
 * AppSettings.settings.testing.showEmptyConfigButton is true.
 *
 * @param {Object} params
 * @param {string} params.shop
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function enqueueEmptyCustomerConfig({ shop }) {
    try {
        const existing = await prisma.job.findFirst({
            where: { shop, type: "EMPTY_CUSTOMER_CONFIG", status: { in: ["PENDING", "PROCESSING"] } },
            select: { id: true },
        });

        if (existing) {
            return { ok: false, message: "An empty-config job is already running." };
        }

        await prisma.job.create({
            data: {
                type: "EMPTY_CUSTOMER_CONFIG",
                shop,
                status: "PENDING",
                payload: { cursor: 0 },
            },
        });

        logger.warn(MODULE, "TESTING: empty-customer-config job started", { shop });
        return { ok: true, message: "Started — this runs in the background and clears real Shopify metafields for already-synced customers." };
    } catch (error) {
        logger.error(MODULE, "Failed to start empty-customer-config job", { shop, error: error?.message });
        return { ok: false, message: "Failed to start." };
    }
}

/**
 * Reports whether an EMPTY_CUSTOMER_CONFIG job is currently active for a
 * shop, for the admin page's button-disable state.
 *
 * @param {string} shop
 * @returns {Promise<{ active: boolean, cursor: number }>}
 */
export async function getEmptyCustomerConfigStatus(shop) {
    const job = await prisma.job.findFirst({
        where: { shop, type: "EMPTY_CUSTOMER_CONFIG", status: { in: ["PENDING", "PROCESSING"] } },
        select: { payload: true },
    });

    return { active: !!job, cursor: job?.payload?.cursor || 0 };
}

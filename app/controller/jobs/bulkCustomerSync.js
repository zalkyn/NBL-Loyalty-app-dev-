import prisma from "../../db.server.js";
import { logger } from "../../utils/logger.js";

const MODULE = "controller/jobs/bulkCustomerSync.js";

/** Valid scope values — see bulkCustomerSyncJob.js for what each means. */
const VALID_SCOPES = ["all", "unsynced"];

/**
 * Starts a shop-wide bulk customer-config sync, if one isn't already
 * running for this exact scope. Actual work happens in the background —
 * see bulkCustomerSyncJob.js — this just creates the (single) Job row that
 * job advances one chunk at a time.
 *
 * @param {Object} params
 * @param {string} params.shop
 * @param {"all"|"unsynced"} params.scope
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function enqueueBulkCustomerSync({ shop, scope }) {
    if (!VALID_SCOPES.includes(scope)) {
        return { ok: false, message: "Invalid sync scope." };
    }

    try {
        // Guard against duplicate concurrent runs for the SAME scope —
        // deliberately a query, not a DB unique constraint: a constraint
        // tied to a fixed key would block starting a NEW sync after a
        // previous one already COMPLETED, which should always be allowed
        // (e.g. running "sync unsynced" again after a while to catch new
        // stragglers).
        const existing = await prisma.job.findFirst({
            where: {
                shop,
                type: "BULK_CUSTOMER_SYNC",
                status: { in: ["PENDING", "PROCESSING"] },
            },
            select: { id: true, payload: true },
        });

        if (existing && existing.payload?.scope === scope) {
            return { ok: false, message: `A "${scope}" sync is already running.` };
        }
        if (existing) {
            return { ok: false, message: "Another bulk sync is already running — wait for it to finish first." };
        }

        await prisma.job.create({
            data: {
                type: "BULK_CUSTOMER_SYNC",
                shop,
                status: "PENDING",
                payload: { scope, cursor: 0 },
            },
        });

        logger.info(MODULE, "Bulk customer sync started", { shop, scope });
        return { ok: true, message: "Sync started — this runs in the background and may take a while for large customer bases." };
    } catch (error) {
        logger.error(MODULE, "Failed to start bulk customer sync", { shop, scope, error: error?.message });
        return { ok: false, message: "Failed to start sync." };
    }
}

/**
 * Reports whether a bulk sync is currently active for a shop (any scope),
 * plus overall sync coverage counts for the admin page's progress display.
 *
 * @param {Object} params
 * @param {string} params.shop
 * @param {string} params.sessionId
 * @returns {Promise<{
 *   activeJob: { scope: string, cursor: number } | null,
 *   totalCustomers: number,
 *   syncedCustomers: number,
 * }>}
 */
export async function getBulkCustomerSyncStatus({ shop, sessionId }) {
    const [activeJob, totalCustomers, syncedCustomers] = await Promise.all([
        prisma.job.findFirst({
            where: { shop, type: "BULK_CUSTOMER_SYNC", status: { in: ["PENDING", "PROCESSING"] } },
            select: { payload: true },
        }),
        prisma.customer.count({ where: { sessionId } }),
        prisma.customer.count({ where: { sessionId, lastSyncedVersionKey: { not: null } } }),
    ]);

    return {
        activeJob: activeJob ? { scope: activeJob.payload?.scope, cursor: activeJob.payload?.cursor || 0 } : null,
        totalCustomers,
        syncedCustomers,
    };
}

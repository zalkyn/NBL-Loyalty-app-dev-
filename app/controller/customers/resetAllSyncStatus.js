import prisma from "../../db.server.js";
import { logger } from "../../utils/logger.js";

const MODULE = "controller/customers/resetAllSyncStatus.js";

/**
 * TESTING ONLY. Resets every customer's lastSyncedVersionKey back to null
 * — i.e. "as if nobody has ever been through a full sync" — so a developer
 * can repeatedly re-test the whole update-banner / bulk-sync flow without
 * needing a real database or metafield reset each time.
 *
 * Deliberately does NOT touch Shopify at all — no metafield writes, no
 * Admin API calls. This only resets the app's own internal tracking
 * column, a single bulk SQL UPDATE, so it's fast and safe to run
 * repeatedly regardless of customer count. Customers' actual Shopify
 * metafields are untouched and will simply look "stale" again from the
 * app's point of view — exactly the state this is meant to simulate.
 *
 * Only ever reachable from the Version Tracking page's "reset all
 * customers' sync status" button, which itself only renders when
 * AppSettings.settings.testing.showResetSyncButton is true — see
 * testingFlags.js for why that can only be set by a developer directly in
 * the database, never through any part of the app's own UI.
 *
 * @param {Object} params
 * @param {string} params.shop
 * @param {string} params.sessionId
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function resetAllCustomersSyncStatus({ shop, sessionId }) {
    try {
        const { count } = await prisma.customer.updateMany({
            where: { sessionId },
            data: { lastSyncedVersionKey: null },
        });

        logger.warn(MODULE, "TESTING: reset lastSyncedVersionKey for all customers", { shop, count });
        return { ok: true, message: `Reset sync status for ${count.toLocaleString()} customer(s).` };
    } catch (error) {
        logger.error(MODULE, "Failed to reset customers' sync status", { shop, error: error?.message });
        return { ok: false, message: "Failed to reset sync status." };
    }
}

import prisma from "../../db.server.js";
import { logger } from "../../utils/logger.js";

const MODULE = "controller/appSettings/maintenanceToolFlags.js";

/**
 * @constant {object} Default flags when a shop has never configured this.
 *
 * All OFF by default on purpose: these gate the three destructive
 * maintenance tools on the Customer Sync page (reset sync status, empty
 * config, delete customer record) — the last two permanently delete real
 * Shopify metafields and/or the app's own customer records, with no undo.
 * A developer turns the specific one they need ON from the dev-config
 * page, uses it, and turns it back OFF — so a stray click can't wipe data
 * on a shop where nobody deliberately enabled the tool.
 */
export const DEFAULT_MAINTENANCE_TOOL_FLAGS = {
    // Shows "Reset all customers' sync status" — clears the app's own
    // lastSyncedVersionKey tracking only (no Shopify writes).
    showResetSyncButton: false,
    // Shows "Empty already-synced customers' config" (bulk) and per-customer
    // "Empty config" — DELETES real Shopify app metafields.
    showEmptyConfigButton: false,
    // Shows per-customer "Delete record entirely" — deletes Shopify
    // metafields AND the app-database Customer row (cascades to their
    // transactions/rewards/prize claims/referral history).
    showDeleteCustomerButton: false,
};

/**
 * Reads a shop's maintenance-tool flags (AppSettings.settings.maintenanceTools),
 * merged over the defaults so a shop that's never saved this still gets a
 * complete object back (all off by default).
 *
 * @param {string} shop
 * @returns {Promise<typeof DEFAULT_MAINTENANCE_TOOL_FLAGS>}
 */
export async function getMaintenanceToolFlags(shop) {
    if (!shop) return { ...DEFAULT_MAINTENANCE_TOOL_FLAGS };

    const row = await prisma.appSettings.findUnique({
        where: { shop },
        select: { settings: true },
    });

    return { ...DEFAULT_MAINTENANCE_TOOL_FLAGS, ...(row?.settings?.maintenanceTools || {}) };
}

/**
 * Updates a shop's maintenance-tool flags, merging into whatever's already
 * in AppSettings.settings (a shared JSON blob — other unrelated settings,
 * e.g. discountDelete, must not be clobbered by this write).
 *
 * @param {Object} params
 * @param {string} params.shop
 * @param {string} params.sessionId - Needed for the create branch of the upsert (AppSettings.sessionId is required).
 * @param {boolean} params.showResetSyncButton
 * @param {boolean} params.showEmptyConfigButton
 * @param {boolean} params.showDeleteCustomerButton
 * @returns {Promise<typeof DEFAULT_MAINTENANCE_TOOL_FLAGS>}
 */
export async function updateMaintenanceToolFlags({ shop, sessionId, showResetSyncButton, showEmptyConfigButton, showDeleteCustomerButton }) {
    const existing = await prisma.appSettings.findUnique({
        where: { shop },
        select: { settings: true },
    });

    const maintenanceTools = {
        showResetSyncButton: !!showResetSyncButton,
        showEmptyConfigButton: !!showEmptyConfigButton,
        showDeleteCustomerButton: !!showDeleteCustomerButton,
    };

    const nextSettings = {
        ...(existing?.settings || {}),
        maintenanceTools,
    };

    await prisma.appSettings.upsert({
        where: { shop },
        update: { settings: nextSettings },
        create: { shop, sessionId, settings: nextSettings },
    });

    logger.success(MODULE, "Maintenance-tool flags updated", { shop, ...maintenanceTools });

    return maintenanceTools;
}

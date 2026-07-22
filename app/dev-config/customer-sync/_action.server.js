/**
 * @file dev-config/customer-sync/_action.server.js
 * @description Action for the Customer Sync page — every mutation this
 * page can trigger, dispatched by `intent`. Split out of version-tracking
 * (see that page's own history) — none of this is specific to version
 * rollout.
 */

import { authenticate } from "shopify-server";
import prisma from "db-server";

import { enqueueBulkCustomerSync } from "@controller/jobs/bulkCustomerSync";
import { enqueueEmptyCustomerConfig } from "@controller/jobs/emptyCustomerConfig";
import { resetAllCustomersSyncStatus } from "@controller/customers/resetAllSyncStatus";
import { getMaintenanceToolFlags } from "@controller/appSettings/maintenanceToolFlags";
import { syncCustomerConfig } from "app/controller/metafieldsSync/syncCustomerConfig";
import clearCustomerMetafields from "app/graphql/mutation/metafieldsSync/clearCustomerMetafields.js";
import deleteCustomerRecord from "@controller/customers/deleteCustomerRecord.js";
import { logger } from "app/utils/logger.js";

const MODULE = "dev-config/customer-sync/_action.server.js";

export const action = async ({ request }) => {
    const { session, admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent")?.toString() || "";

    if (intent === "bulkSync") {
        const scope = formData.get("scope")?.toString();
        return enqueueBulkCustomerSync({ shop: session.shop, scope });
    }

    if (intent === "resetSyncStatus") {
        // Re-check server-side too, not just at render time, in case this
        // tool is ever gated per-shop in the future.
        const toolFlags = await getMaintenanceToolFlags(session.shop);
        if (!toolFlags.showResetSyncButton) {
            logger.warn(MODULE, "Blocked resetSyncStatus — tool disabled", { shop: session.shop });
            return { ok: false, message: "This action is disabled." };
        }
        return resetAllCustomersSyncStatus({ shop: session.shop, sessionId: session.id });
    }

    if (intent === "emptyConfig") {
        // Same server-side re-check as resetSyncStatus above.
        const toolFlags = await getMaintenanceToolFlags(session.shop);
        if (!toolFlags.showEmptyConfigButton) {
            logger.warn(MODULE, "Blocked emptyConfig — tool disabled", { shop: session.shop });
            return { ok: false, message: "This action is disabled." };
        }
        return enqueueEmptyCustomerConfig({ shop: session.shop });
    }

    // ── Single-customer sync/resync — same underlying syncCustomerConfig
    //    call used everywhere else in the app (order/reward/referral
    //    events) — "sync" vs "resync" is a UI-only distinction (which
    //    button shows, based on whether the found customer is already
    //    synced).
    if (intent === "syncCustomer") {
        const shopifyId = formData.get("shopifyId")?.toString();
        if (!shopifyId) return { ok: false, message: "Missing customer." };

        const customer = await syncCustomerConfig(admin, shopifyId);
        if (!customer) {
            logger.error(MODULE, "Failed to sync single customer", { shop: session.shop, shopifyId });
            return { ok: false, message: "Sync failed. Please try again." };
        }
        return { ok: true, message: "Customer synced." };
    }

    // ── Single-customer empty config — same destructive operation as the
    //    bulk "empty already-synced customers' config" tool above, for just
    //    one customer. Fast enough (one API call) to run synchronously, no
    //    background job needed.
    if (intent === "emptyOneCustomerConfig") {
        const toolFlags = await getMaintenanceToolFlags(session.shop);
        if (!toolFlags.showEmptyConfigButton) {
            logger.warn(MODULE, "Blocked emptyOneCustomerConfig — tool disabled", { shop: session.shop });
            return { ok: false, message: "This action is disabled." };
        }

        const shopifyId = formData.get("shopifyId")?.toString();
        const customerId = Number(formData.get("customerId"));
        if (!shopifyId || !customerId) return { ok: false, message: "Missing customer." };

        try {
            await clearCustomerMetafields(admin, shopifyId);
            await prisma.customer.update({ where: { id: customerId }, data: { lastSyncedVersionKey: null } });
            return { ok: true, message: "Customer's config emptied." };
        } catch (error) {
            logger.error(MODULE, "Failed to empty single customer config", { shop: session.shop, shopifyId, error: error?.message });
            return { ok: false, message: "Failed to empty config. Please try again." };
        }
    }

    // ── Single-customer full record delete — deletes the Shopify
    //    metafields AND the app DB row, so the next visit has no record to
    //    self-heal from and the widget's actual "Join our Program" step
    //    can be reproduced. See deleteCustomerRecord.js for why this is a
    //    separate tool from "emptyOneCustomerConfig" above rather than the
    //    same one.
    if (intent === "deleteCustomerRecord") {
        const toolFlags = await getMaintenanceToolFlags(session.shop);
        if (!toolFlags.showDeleteCustomerButton) {
            logger.warn(MODULE, "Blocked deleteCustomerRecord — tool disabled", { shop: session.shop });
            return { ok: false, message: "This action is disabled." };
        }

        const shopifyId = formData.get("shopifyId")?.toString();
        const customerId = Number(formData.get("customerId"));
        if (!shopifyId || !customerId) return { ok: false, message: "Missing customer." };

        try {
            await deleteCustomerRecord(admin, { shop: session.shop, customerId, shopifyId });
            return { ok: true, message: "Customer's app record deleted. They'll be treated as brand new on their next visit." };
        } catch (error) {
            logger.error(MODULE, "Failed to delete customer record", { shop: session.shop, shopifyId, error: error?.message });
            return { ok: false, message: "Failed to delete customer record. Please try again." };
        }
    }

    return { ok: false, message: "Unknown action." };
};

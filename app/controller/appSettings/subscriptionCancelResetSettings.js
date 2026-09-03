import prisma from "../../db.server.js";
import { logger } from "../../utils/logger.js";

const MODULE = "controller/appSettings/subscriptionCancelResetSettings.js";

/** @constant {object} Default settings when a shop has never configured this. */
export const DEFAULT_SUBSCRIPTION_CANCEL_RESET_SETTINGS = {
    // Reset a customer's current points balance to 0 when their Appstle
    // subscription is cancelled (lifetimePoints is always left untouched,
    // regardless of this toggle — see createTransaction.js's
    // SUBSCRIPTION_CANCEL_RESET case). Every cancellation event is recorded
    // in SubscriptionCancelEvent either way (see subscriptionCancelledJob.js)
    // — this toggle only controls whether the reset is actually applied.
    enabled: true,
};

/**
 * Reads a shop's subscription-cancel-reset settings
 * (AppSettings.settings.subscriptionCancelReset), merged over the defaults
 * so a shop that's never saved this still gets a complete object back.
 *
 * @param {string} shop
 * @returns {Promise<typeof DEFAULT_SUBSCRIPTION_CANCEL_RESET_SETTINGS>}
 */
export async function getSubscriptionCancelResetSettings(shop) {
    if (!shop) return { ...DEFAULT_SUBSCRIPTION_CANCEL_RESET_SETTINGS };

    const row = await prisma.appSettings.findUnique({
        where: { shop },
        select: { settings: true },
    });

    return { ...DEFAULT_SUBSCRIPTION_CANCEL_RESET_SETTINGS, ...(row?.settings?.subscriptionCancelReset || {}) };
}

/**
 * Updates a shop's subscription-cancel-reset settings, merging into
 * whatever's already in AppSettings.settings (a shared JSON blob — other
 * unrelated settings must not be clobbered by this write).
 *
 * @param {Object} params
 * @param {string} params.shop
 * @param {string} params.sessionId - Needed for the create branch of the upsert (AppSettings.sessionId is required).
 * @param {boolean} params.enabled
 * @returns {Promise<typeof DEFAULT_SUBSCRIPTION_CANCEL_RESET_SETTINGS>}
 */
export async function updateSubscriptionCancelResetSettings({ shop, sessionId, enabled }) {
    const existing = await prisma.appSettings.findUnique({
        where: { shop },
        select: { settings: true },
    });

    const nextSettings = {
        ...(existing?.settings || {}),
        subscriptionCancelReset: { enabled: !!enabled },
    };

    await prisma.appSettings.upsert({
        where: { shop },
        update: { settings: nextSettings },
        create: { shop, sessionId, settings: nextSettings },
    });

    logger.success(MODULE, "Subscription-cancel-reset settings updated", { shop, ...nextSettings.subscriptionCancelReset });

    return nextSettings.subscriptionCancelReset;
}

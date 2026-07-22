import prisma from "../../db.server.js";
import { logger } from "../../utils/logger.js";

const MODULE = "controller/appSettings/discountDeleteSettings.js";

/** @constant {object} Default settings when a shop has never configured this. */
export const DEFAULT_DISCOUNT_DELETE_SETTINGS = {
    // Delete the discount code when a redeemed-but-unused reward is
    // cancelled (see handleCancelReward in customers/$id/_action.server.js)
    // — the code will never be used, no reason to leave it cluttering the
    // shop's discount list in Shopify admin.
    onRewardCancel: true,
    // Delete the discount code once it's actually been used at checkout
    // (discountUsed flips to true — see orderPaidJob.js's "Voucher rewards
    // marked as used" step).
    onRewardUsed: true,
};

/**
 * Reads a shop's discount-delete settings (AppSettings.settings.discountDelete),
 * merged over the defaults so a shop that's never saved this still gets a
 * complete object back (both on by default).
 *
 * @param {string} shop
 * @returns {Promise<typeof DEFAULT_DISCOUNT_DELETE_SETTINGS>}
 */
export async function getDiscountDeleteSettings(shop) {
    if (!shop) return { ...DEFAULT_DISCOUNT_DELETE_SETTINGS };

    const row = await prisma.appSettings.findUnique({
        where: { shop },
        select: { settings: true },
    });

    return { ...DEFAULT_DISCOUNT_DELETE_SETTINGS, ...(row?.settings?.discountDelete || {}) };
}

/**
 * Updates a shop's discount-delete settings, merging into whatever's
 * already in AppSettings.settings (a shared JSON blob — other unrelated
 * settings, if any get added later, must not be clobbered by this write).
 *
 * @param {Object} params
 * @param {string} params.shop
 * @param {string} params.sessionId - Needed for the create branch of the upsert (AppSettings.sessionId is required).
 * @param {boolean} params.onRewardCancel
 * @param {boolean} params.onRewardUsed
 * @returns {Promise<typeof DEFAULT_DISCOUNT_DELETE_SETTINGS>}
 */
export async function updateDiscountDeleteSettings({ shop, sessionId, onRewardCancel, onRewardUsed }) {
    const existing = await prisma.appSettings.findUnique({
        where: { shop },
        select: { settings: true },
    });

    const nextSettings = {
        ...(existing?.settings || {}),
        discountDelete: { onRewardCancel: !!onRewardCancel, onRewardUsed: !!onRewardUsed },
    };

    await prisma.appSettings.upsert({
        where: { shop },
        update: { settings: nextSettings },
        create: { shop, sessionId, settings: nextSettings },
    });

    logger.success(MODULE, "Discount-delete settings updated", { shop, ...nextSettings.discountDelete });

    return nextSettings.discountDelete;
}

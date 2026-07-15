import prisma from "../../db.server.js";
import getActiveConfigUpdateVersion from "../configUpdateVersion/getActiveConfigUpdateVersion.js";

// Fallbacks mirror LABEL_DEFAULTS.updateBannerTitle/Desc in
// cssVarsConfig.js — kept in sync manually since this file can't import
// from app/layout/ (admin-side code) without creating a layering
// violation. Only used if a shop has literally never saved any widget
// labels at all (brand new shop, Style row not yet created).
const DEFAULT_TITLE = "Update available";
const DEFAULT_DESC = "We've made a few improvements to your account. Tap Update to see the latest.";

/**
 * Checks whether a customer should be blocked from performing a
 * state-changing action (reward redeem, prize claim, referral claim)
 * because the shop has an announced update they haven't synced yet.
 *
 * Mirrors the exact same three-condition check the widget itself does
 * client-side (see main.preact.jsx's computeUpdateStatus()) — update mode
 * isn't "off" + an active version exists + this customer's own
 * lastSyncedVersionKey doesn't match it — so a customer only ever gets
 * blocked in the same situation the widget is already handling client-side
 * (showing the banner in "banner" mode, or silently resyncing in "auto"
 * mode), never as a surprise. Applies to BOTH modes, not just "banner" —
 * in "auto" mode the customer's data is still stale for the instant
 * between page load and the silent resync completing, so the same
 * protection is needed either way.
 *
 * The returned message is the SAME fixed, generic, customer-facing text
 * the banner itself shows (labels.updateBannerTitle/Desc) — deliberately
 * NOT the admin's own per-version title/description (Version Tracking
 * page's internal notes), which must never reach the customer in any
 * form, including this block message. See syncAppConfig.js's matching
 * comment for the storefront-metafield side of this same rule.
 *
 * Never throws — a DB hiccup here should not be the reason a legitimate
 * claim fails, so any error is treated as "not blocked" (fail-open). This
 * is a UX nudge to keep customers in sync, not a security boundary.
 *
 * @param {Object} params
 * @param {string} params.shop
 * @param {number} params.customerDbId - Internal Customer.id (not the Shopify GID).
 * @returns {Promise<{ blocked: boolean, message?: string }>}
 */
export default async function checkUpdateRequired({ shop, customerDbId }) {
    try {
        const style = await prisma.style.findUnique({
            where: { shop },
            select: { widgetConfig: true },
        });
        const updateMode = style?.widgetConfig?.resync?.updateMode || "off";
        if (updateMode === "off") return { blocked: false };

        const activeVersion = await getActiveConfigUpdateVersion(shop);
        if (!activeVersion) return { blocked: false };

        const customer = await prisma.customer.findUnique({
            where: { id: customerDbId },
            select: { lastSyncedVersionKey: true },
        });
        if (!customer) return { blocked: false };

        if (customer.lastSyncedVersionKey === activeVersion.versionKey) return { blocked: false };

        const labels = style?.widgetConfig?.labels || {};
        const title = labels.updateBannerTitle || DEFAULT_TITLE;
        const description = labels.updateBannerDesc || DEFAULT_DESC;

        return { blocked: true, message: `${title} — ${description}` };
    } catch {
        return { blocked: false };
    }
}

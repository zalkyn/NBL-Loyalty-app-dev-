// ─────────────────────────────────────────────────────────────────────────────
// Server-only, read-only. Gathers where each setting lives and what it is set
// to right now, for the Settings overview page. Nothing here changes a value;
// every setting is still edited on its own page.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "db-server";
import { logger } from "app/utils/logger.js";
import { getPointRuleByEvent } from "@controller/pointsRule/getPointRuleByEvent.js";
import shopDetails from "app/graphql/query/shop/shopDetails.js";
import { getSubscriptionCancelResetSettings } from "@controller/appSettings/subscriptionCancelResetSettings.js";

const MODULE = "layout/settings/_settings.server.js";

const safe = async (promise, fallback) => {
    try { return await promise; } catch (err) {
        logger.error(MODULE, "Settings overview lookup failed", { error: err?.message });
        return fallback;
    }
};

/** @param {{ id: string, shop: string }} session
 *  @param {object} admin - Shopify Admin GraphQL client (store details) */
export async function loadSettingsOverview(session, admin) {
    const [orderRule, referralRule, reviewRule, cancel, rewardCount, prizeCount, backfillCount, style, appSettings, store] = await Promise.all([
        safe(getPointRuleByEvent("ORDER", session.id), null),
        safe(getPointRuleByEvent("REFERRAL", session.id), null),
        safe(getPointRuleByEvent("REVIEW", session.id), null),
        safe(getSubscriptionCancelResetSettings(session.shop), null),
        safe(prisma.rewardRule.count({ where: { sessionId: session.id, isActive: true } }), null),
        safe(prisma.physicalPrize.count({ where: { sessionId: session.id, isActive: true } }), null),
        safe(prisma.shadowRule.count({ where: { sessionId: session.id } }), null),
        safe(prisma.style.findUnique({ where: { shop: session.shop }, select: { widgetConfig: true } }), null),
        safe(prisma.appSettings.findUnique({ where: { shop: session.shop }, select: { looxFlowToken: true } }), null),
        safe(shopDetails(admin), null),
    ]);

    return {
        orderActive: orderRule ? true : orderRule === null ? false : null,
        referralActive: !!referralRule,
        referralTrigger: referralRule?.conditions?.referral?.trigger ?? null,
        reviewActive: !!reviewRule,
        store,
        cancel,
        rewardCount,
        prizeCount,
        backfillCount,
        // Toasts are on unless the merchant switched them off (customize default is true).
        toastsOn: style?.widgetConfig?.enableToastNotifications !== false,
        looxConnected: !!appSettings?.looxFlowToken,
    };
}

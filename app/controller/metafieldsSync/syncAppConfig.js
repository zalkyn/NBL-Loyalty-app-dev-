import prisma from "../../db.server.js";
import shopId from "../../graphql/query/shop/shopId.js";
import configMetafieldSyncMutation from "../../graphql/mutation/metafieldsSync/config.js";
import { logger } from "../../utils/logger.js";
import { withRetry } from "../../utils/retry/withRetry.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "controller/metafieldsSync/syncAppConfig.js";

/**
 * Syncs shop-level app config (point/reward rules, styles, physical prizes)
 * to the `nbl_config_v1` shop metafield. Read by the storefront widget on load.
 *
 * Retries internally on transient network failure and never throws — this
 * is a best-effort background sync, not a critical path.
 *
 * @param {Object} admin   - Shopify Admin GraphQL client
 * @param {Object} session - Shopify session (used to look up shop config from DB)
 * @returns {Promise<void>}
 */
export default async function syncAppConfig(admin, session) {
    try {
        const shopGid = await shopId(admin);
        if (!shopGid) throw new Error("Failed to resolve shop ID");
        // NOTE: this metafield used to also carry `appUrl` (process.env.SHOPIFY_APP_URL),
        // which the storefront widget read as appConfig.appUrl and called directly —
        // exposing the app's real backend domain to every visitor and letting anyone
        // hit it with a spoofed customerId. All widget calls now go through the App
        // Proxy (proxyPath, e.g. "/apps/widget") instead, so appUrl must never be
        // included here again.

        const shop = await prisma.session.findFirst({
            where: { id: session?.id },
            select: {
                shop: true,
                email: true,
                pointRules: {
                    // Only what EarnTab.jsx actually reads: the rule's own id/
                    // conditions/isActive, plus the linked event's id/name/type.
                    // (Widget filters isActive client-side, so it must stay
                    // selected here — but everything else on PointsRule, e.g.
                    // sessionId/metadata/timestamps/pointsValue/pointsType/
                    // maxPoints/minOrderAmount/startDate/endDate/priority, is
                    // never read by the widget and shouldn't be synced.)
                    select: {
                        id: true,
                        conditions: true,
                        isActive: true,
                        event: {
                            select: {
                                name: true,
                                id: true,
                                type: true,
                            },
                        },
                    },
                },
                // Only active reward rules — mirrors the physicalPrizes filter
                // below. Without this, a merchant disabling a reward rule
                // (isActive: false) still had it synced and shown to customers
                // as redeemable, since the widget's RewardsTab never checks
                // isActive itself. And only the 4 fields RewardRuleItem
                // actually renders — not sessionId/metadata/timestamps/
                // conditions/usageLimit/usagePerUser/usageCount/couponPrefix/
                // minOrderAmount/startDate/endDate/priority/isAutoApply/title
                // (title is computed client-side from discountType+rewardValue,
                // never read from the rule itself).
                rewardRules: {
                    where: { isActive: true },
                    select: {
                        id: true,
                        discountType: true,
                        rewardValue: true,
                        pointsCost: true,
                    },
                },
                // Only the 3 fields main.preact.jsx actually reads. The Style
                // model still carries several legacy JSON columns (actionButton,
                // header, tabHome, tabRewards, tabActivity, tabProfile,
                // tabReferral, tabEarnPoints, accountActivity) from an older
                // widget version — dead weight now, never read by the current
                // widget, so they shouldn't be synced either.
                styles: {
                    select: {
                        cssVars: true,
                        presetKey: true,
                        widgetConfig: true,
                    },
                },
                physicalPrizes: {
                    where: { isActive: true },
                    orderBy: { createdAt: "desc" },
                    select: {
                        id: true,
                        title: true,
                        description: true,
                        imageUrl: true,
                        pointsCost: true,
                        productValue: true,
                        isActive: true,
                    },
                },
            },
        });

        const metafield = {
            namespace: "app",
            key: "nbl_config_v1",
            value: JSON.stringify({ ...shop }),
            type: "json",
            ownerId: shopGid,
        };

        await withRetry(
            () => configMetafieldSyncMutation(admin, metafield),
            {
                maxAttempts: 3,
                baseDelayMs: 800,
                retryableErrors: ["fetch failed", "ECONNRESET", "ETIMEDOUT"],
                context: { module: MODULE, shop: session?.shop },
            }
        );
    } catch (error) {
        logger.error(MODULE, "syncAppConfig failed", { shop: session?.shop, error: error?.message });
    }
}

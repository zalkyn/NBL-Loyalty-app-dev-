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

        const appUrl = process.env.SHOPIFY_APP_URL || "http://localhost:3000";
        const shop = await prisma.session.findFirst({
            where: { id: session?.id },
            select: {
                shop: true,
                email: true,
                pointRules: {
                    include: {
                        event: {
                            select: {
                                name: true,
                                id: true,
                                type: true,
                            },
                        },
                    },
                },
                rewardRules: true,
                styles: true,
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
            value: JSON.stringify({ appUrl, ...shop }),
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

import shopId from "../graphql/query/shop/shopId.js";
import { logger } from "../utils/logger.js";
import configMetafieldSyncMutation from "../graphql/mutation/metafieldsSync/config.js";

export default async function afterAuthSetup({ session, admin }) {
    try {
        const shop_id = await shopId({ admin });
        const appUrl = process.env.SHOPIFY_APP_URL || "http://localhost:3000";


        const metafield = {
            namespace: "app",
            key: "nbl_config_v1",
            value: JSON.stringify({
                appUrl,
                appName: "Northborders Loyalty App",
            }),
            type: "json",
            ownerId: shop_id,
        };

        await configMetafieldSyncMutation(admin, metafield);

    } catch (error) {
        logger.error("## Error in afterAuthSetup:", error);
    }
}
import { logger } from "../../../utils/logger.js";

export default async function shopId({ admin }) {
    try {
        const shopDataResponse = await admin.graphql(
            `#graphql
                query {
                    shop {
                        id
                    }
                }
            `
        );

        const shopDataJson = await shopDataResponse.json();
        const shopData = shopDataJson.data.shop;

        logger.info("## Shop ID response:", JSON.stringify(shopData, null, 2));

        return shopData?.id || null;
    } catch (error) {
        logger.error("## Error fetching shop data:", error);
        return null;
    }
};
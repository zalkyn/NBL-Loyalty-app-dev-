import { logger } from "../../../utils/logger";

/**
 * Get Appstle Subscription Metafield from an Order
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} orderId - Order ID (can be numeric ID or full GID)
 * @returns {Promise<Object|null>} Appstle subscription metafield data
 */
export const getAppstleMetafield = async (admin, orderId) => {
    try {
        if (!orderId) {
            logger.warn("Order ID is required for getAppstleMetafield");
            return null;
        }

        // Normalized orderGid (handles both cases)
        const orderGid = normalizeOrderGid(orderId);

        const response = await admin.graphql(
            `#graphql
            query GetOrderAppstleMetafield($id: ID!) {
                order(id: $id) {
                    id
                    appstle_subscription: metafield(
                        key: "details", 
                        namespace: "appstle_subscription"
                    ) {
                        value: jsonValue
                    }
                }
            }
            `,
            {
                variables: { id: orderGid }
            }
        );

        const jsonData = await response.json();
        const data = jsonData?.data?.order?.appstle_subscription?.value || null;

        return data;

    } catch (error) {
        logger.error("Failed to get Appstle metafield from order", {
            error: error?.message,
            stack: error?.stack,
            orderId: orderId,
            module: "graphql/order/getAppstleMetafield.js"
        });
        return null;   // Always return null on error instead of undefined
    }
};

/**
 * Normalizes Shopify Order ID to full GID format
 * Accepts: 7970071281762 or gid://shopify/Order/7970071281762
 */
const normalizeOrderGid = (orderId) => {
    if (!orderId) return null;

    const idStr = String(orderId).trim();

    // Already a full GID
    if (idStr.startsWith("gid://shopify/Order/")) {
        return idStr;
    }

    // Numeric ID → convert to GID
    return `gid://shopify/Order/${idStr}`;
};
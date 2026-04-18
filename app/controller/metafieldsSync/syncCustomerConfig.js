import configMetafieldSyncMutation from "app/graphql/mutation/metafieldsSync/config.js";
import prisma from "../../db.server.js"
import { normalizeCustomerGid } from "../customers/normalizeCustomerGid.js"

export const syncCustomersConfig = async (admin) => {
    try {
        const customers = await prisma.customer.findMany({
            include: {
                transactions: true,
                referralsSent: true,
                referralsUsed: true,
                activities: true,
                rewards: true
            }
        });

        for (const customer of customers) {
            const metafield = {
                namespace: "app",
                key: "nbl_customer_v1",
                value: JSON.stringify({
                    appName: "North Borders Loyalty App",
                    ...customer
                }),
                type: "json",
                ownerId: customer.shopifyId,
            };

            await configMetafieldSyncMutation(admin, metafield);
        }
    } catch (error) {
        console.error("## Error in syncCustomerMetafieldConfig:", error);
    }
}

export const syncCustomerConfig = async (admin, customerId) => {
    try {
        const normalizedId = normalizeCustomerGid(customerId);

        if (!normalizedId) {
            throw new Error("Customer ID is required");
        }

        const customer = await prisma.customer.findFirst({
            where: { shopifyId: normalizedId },
            include: {
                transactions: true,
                referralsSent: true,
                referralsUsed: true,
                activities: true,
                rewards: true
            }
        });

        if (!customer) {
            throw new Error("Customer not found while syncing customer config metafield")
        }

        const metafield = {
            namespace: "app",
            key: "nbl_customer_v1",
            value: JSON.stringify({
                appName: "North Borders Loyalty App",
                ...customer
            }),
            type: "json",
            ownerId: customer.shopifyId,
        };

        await configMetafieldSyncMutation(admin, metafield);

    } catch (error) {
        console.error("## Error in syncCustomerMetafieldConfig:", error);
    }
}
import configMetafieldSyncMutation from "app/graphql/mutation/metafieldsSync/config.js";
import prisma from "../../db.server.js";
import { normalizeCustomerGid } from "../customers/normalizeCustomerGid.js";
import { logger } from "app/utils/logger.js";

const CUSTOMER_INCLUDE = {
    transactions: {
        orderBy: { createdAt: "desc" },
        include: {
            reward: {
                select: {
                    id: true,
                    status: true,
                    usedAt: true,
                    createdAt: true,
                },
            },
        },
    },
    rewards: {
        orderBy: { createdAt: "desc" },
    },
    referralsSent: true,
    referralsUsed: true,
};

const BATCH_SIZE = 10;

const buildMetafield = (customer) => ({
    namespace: "app",
    key: "nbl_customer_v1",
    value: JSON.stringify({
        appName: "North Borders Loyalty App",
        ...customer,
    }),
    type: "json",
    ownerId: customer.shopifyId,
});

export const syncCustomersConfig = async (admin, session) => {
    try {
        const customers = await prisma.customer.findMany({
            where: { sessionId: session.id }, // scoped to current shop
            include: CUSTOMER_INCLUDE,
        });

        for (let i = 0; i < customers.length; i += BATCH_SIZE) {
            const batch = customers.slice(i, i + BATCH_SIZE);
            await Promise.allSettled(
                batch.map((customer) =>
                    configMetafieldSyncMutation(admin, buildMetafield(customer))
                )
            );
        }
    } catch (error) {
        logger.error("## Error in syncCustomersConfig:", error);
    }
};

export const syncCustomerConfig = async (admin, customerId) => {
    try {
        let customer = null;
        if (customerId?.toString()?.length <= 6) {
            customer = await prisma.customer.findFirst({
                where: { id: Number(customerId) },
                include: CUSTOMER_INCLUDE,
            });
        } else {
            const normalizedId = normalizeCustomerGid(customerId);

            if (!normalizedId) {
                throw new Error("Customer ID is required");
            }

            customer = await prisma.customer.findFirst({
                where: { shopifyId: normalizedId },
                include: CUSTOMER_INCLUDE,
            });
        }

        if (!customer) {
            throw new Error(`Customer not found: ${normalizedId}`);
        }

        await configMetafieldSyncMutation(admin, buildMetafield(customer));

        return customer;
    } catch (error) {
        logger.error("## Error in syncCustomerConfig:", error);
        return null;
    }
};
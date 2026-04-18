import prisma from "../../db.server.js";
import { logger } from "../../utils/logger.js";
import generateReferralCode from "app/utils/generateReferralCode.js";

export const storeCustomer = async (session, customer) => {
    try {
        const shopifyId = customer?.admin_graphql_api_id || String(customer.id);
        const data = await prisma.customer.upsert({
            where: {
                shopifyId: shopifyId,
            },
            update: {
                email: customer?.defaultEmailAddress?.emailAddress || customer?.email,
            },
            create: {
                shopifyId: shopifyId,
                name: `${customer.firstName || customer.first_name || ""} ${customer.lastName || customer.last_name || ""}`.trim(),
                email: customer?.defaultEmailAddress?.emailAddress || customer?.email,
                referralCode: generateReferralCode(),
                sessionId: session.id,
                metadata: customer,
            },
        });
    } catch (error) {
        logger.error("Customer store error", error)
    }
}

import prisma from "../../db.server";
import generateReferralCode from "../../utils/generateReferralCode";
import customers from "../../graphql/query/customers";

export default async function syncAllCustomerFromStore(admin, session) {
    try {
        const response = await customers(admin);

        if (!response || !response.customers || !response.customers.nodes) {
            throw new Error("Invalid response from Shopify API");
        }

        const allCustomers = response?.customers?.nodes || [];

        for (const customer of allCustomers) {
            await prisma.customer.upsert({
                where: {
                    shopifyId: String(customer.id),
                },
                update: {
                    name: `${customer.firstName || ""} ${customer.lastName || ""}`.trim(),
                    email: customer?.defaultEmailAddress?.emailAddress || "N/A",
                    shopifyId: String(customer.id),
                    metadata: customer,
                },
                create: {
                    shopifyId: String(customer.id),
                    name: `${customer.firstName || ""} ${customer.lastName || ""}`.trim(),
                    email: customer?.defaultEmailAddress?.emailAddress || "N/A",
                    referralCode: generateReferralCode(),
                    sessionId: session.id,
                    metadata: customer,
                },
            });
        }

        return { message: "Customers synced successfully", customers: customers };

    } catch (error) {
        console.log("Error syncing customers from store:", error);
        return { message: "Error syncing customers from store", customers: [] };
    }
}
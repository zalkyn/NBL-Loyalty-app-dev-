
// import prisma from "../../db.server";
// import generateReferralCode from "../../utils/generateReferralCode";
import customers from "../../graphql/query/customers";
import { storeCustomer } from "./store";

export default async function syncAllCustomerFromStore(admin, session) {
    try {
        const response = await customers(admin);

        if (!response || !response.customers || !response.customers.nodes) {
            throw new Error("Invalid response from Shopify API");
        }

        const allCustomers = response?.customers?.nodes || [];

        for (const customer of allCustomers) {
            await storeCustomer(session, customer)
        }

        return { message: "Customers synced successfully", customers: customers };

    } catch (error) {
        console.log("Error syncing customers from store:", error);
        return { message: "Error syncing customers from store", customers: [] };
    }
}
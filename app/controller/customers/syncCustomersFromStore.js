import customers from "../../graphql/query/customers.js";
import { storeCustomer } from "./store.js";

/** @constant {number} Number of customers upserted concurrently per batch */
const BATCH_SIZE = 10;

/**
 * Fetches every customer from the connected Shopify store and upserts them
 * into the local Customer table, in batches.
 *
 * Per-customer failures (from `storeCustomer`) are isolated via
 * `Promise.allSettled` and reported in `results.errors` — one bad record
 * never aborts the rest of the sync.
 *
 * @param {Object} admin   - Shopify Admin GraphQL client
 * @param {Object} session - Shopify session (used to scope new customers to this shop)
 * @returns {Promise<{ total: number, success: number, failed: number, errors: Array<{ customerId: string, reason: string }> }>}
 * @throws {Error} If the initial Shopify customer fetch fails (see graphql/query/customers.js)
 */
export default async function syncCustomersFromStore(admin, session) {
    const response = await customers(admin);

    if (!response?.customers?.nodes) {
        throw new Error("Invalid response from Shopify API");
    }

    const allCustomers = response.customers.nodes;
    const results = { total: allCustomers.length, success: 0, failed: 0, errors: [] };

    for (let i = 0; i < allCustomers.length; i += BATCH_SIZE) {
        const batch = allCustomers.slice(i, i + BATCH_SIZE);
        const settled = await Promise.allSettled(batch.map((c) => storeCustomer(session, c)));

        settled.forEach((result, idx) => {
            if (result.status === "fulfilled" && result.value) {
                results.success++;
            } else {
                results.failed++;
                results.errors.push({
                    customerId: batch[idx]?.id,
                    reason: result.status === "rejected" ? result.reason?.message : "storeCustomer returned null",
                });
            }
        });
    }

    return results;
}

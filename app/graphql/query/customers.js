import { normalizeCustomerGid } from "app/controller/customers/normalizeCustomerGid";

const CUSTOMER_FIELDS = `#graphql
    id
    firstName
    lastName
    defaultEmailAddress {
        emailAddress
        marketingState
    }
    defaultPhoneNumber {
        phoneNumber
        marketingState
        marketingCollectedFrom
    }
    createdAt
    updatedAt
    numberOfOrders
    state
    amountSpent {
        amount
        currencyCode
    }
    verifiedEmail
    taxExempt
    tags
`;

// fetches all customers with cursor-based pagination
export default async function customers(admin) {
    const allCustomers = [];
    let cursor = null;
    let hasNextPage = true;

    try {
        while (hasNextPage) {
            const response = await admin.graphql(
                `#graphql
                query CustomerList($cursor: String) {
                    customers(first: 250, after: $cursor) {
                        nodes {
                            ${CUSTOMER_FIELDS}
                        }
                        pageInfo {
                            hasNextPage
                            endCursor
                        }
                    }
                }`,
                { variables: { cursor } },
            );

            const json = await response.json();
            const data = json.data?.customers;

            if (!data) {
                throw new Error("Invalid response from Shopify API");
            }

            allCustomers.push(...data.nodes);

            hasNextPage = data.pageInfo.hasNextPage;
            cursor = data.pageInfo.endCursor;
        }

        return { customers: { nodes: allCustomers } };
    } catch (error) {
        console.error("Error fetching customers from store:", error);
        return null;
    }
}

export const customer = async (admin, id) => {
    try {
        if (!id) throw new Error("Please provide valid Id");
        const gid = normalizeCustomerGid(id);
        const response = await admin.graphql(
            `#graphql
                query CustomerById($id: ID!) {
                    customer(id: $id) {
                        ${CUSTOMER_FIELDS}
                    }
                }`,
            { variables: { id: gid } },
        );
        const json = await response.json();
        return json.data?.customer || null;
    } catch (error) {
        console.error("Error fetching customer from store:", error);
        return null;
    }
};

// export const customerOrderCount = async (admin, id) => {
//     try {
//         if (!id) throw new Error("Please provide valid Id");
//         const gid = normalizeCustomerGid(id);
//         const response = await admin.graphql(
//             `#graphql
//                 query CustomerOrderCount($id: ID!) {
//                     customer(id: $id) {
//                         id
//                         numberOfOrders
//                     }
//                 }`,
//             { variables: { id: gid } },
//         );
//         const json = await response.json();
//         return Number(json.data?.customer?.numberOfOrders ?? 0);
//     } catch (error) {
//         console.error("Error fetching customer order count:", error);
//         return 0;
//     }
// };


/**
 * Retrieves the total order count for a given customer.
 *
 * Shopify's `numberOfOrders` field can occasionally return inaccurate data.
 * This function cross-validates it against fetched order nodes to ensure
 * a non-zero result is not falsely reported as zero.
 *
 * @async
 * @function customerOrderCount
 * @param {object} admin - Shopify Admin API client instance.
 * @param {string|number} id - Customer ID (raw numeric or GID format).
 * @returns {Promise<number>} Resolved order count (0 if none or on error).
 *
 * @example
 * const count = await customerOrderCount(admin, "6543210987");
 * console.log(count); // e.g. 4
 */
export const customerOrderCount = async (admin, id) => {
    if (!id) {
        console.error("[customerOrderCount] Missing required parameter: id");
        return 0;
    }

    try {
        const gid = normalizeCustomerGid(id);

        const response = await admin.graphql(
            `#graphql
            query CustomerOrderCount($id: ID!) {
                customer(id: $id) {
                    numberOfOrders
                    orders(first: 50) {
                        nodes {
                            id
                        }
                    }
                }
            }`,
            { variables: { id: gid } }
        );

        const json = await response.json();
        const customer = json?.data?.customer;

        if (!customer) {
            console.warn(`[customerOrderCount] No customer found for GID: ${gid}`);
            return 0;
        }

        const numberOfOrders = Number(customer.numberOfOrders ?? 0);
        const fetchedNodeCount = customer.orders?.nodes?.length ?? 0;

        /*
         * Shopify's numberOfOrders can misreport as 0.
         * If nodes exist, the customer has orders — fall back to node count (1 or 2).
         * Otherwise, trust numberOfOrders as the accurate count.
         */
        if (numberOfOrders === 0) {
            return fetchedNodeCount > 0 ? fetchedNodeCount : 0;
        }

        return numberOfOrders;
    } catch (error) {
        console.error("[customerOrderCount] Failed to fetch customer order count:", error);
        return 0;
    }
};
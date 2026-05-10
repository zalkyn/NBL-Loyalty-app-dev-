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

export const customerOrderCount = async (admin, id) => {
    try {
        if (!id) throw new Error("Please provide valid Id");
        const gid = normalizeCustomerGid(id);
        const response = await admin.graphql(
            `#graphql
                query CustomerOrderCount($id: ID!) {
                    customer(id: $id) {
                        id
                        numberOfOrders
                    }
                }`,
            { variables: { id: gid } },
        );
        const json = await response.json();
        return Number(json.data?.customer?.numberOfOrders ?? 0);
    } catch (error) {
        console.error("Error fetching customer order count:", error);
        return 0;
    }
};
import { normalizeCustomerGid } from "app/controller/customers/normalizeCustomerGid";

export default async function customers(admin) {
    try {
        const response = await admin.graphql(
            `#graphql
            query CustomerList {
                customers(first: 250) {
                nodes {
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
                }
                }
            }`,
        );
        const json = await response.json();
        return json.data;
    } catch (error) {
        console.error("Error fetching customers from store:", error);
    }
}

export const customer = async (admin, id) => {
    try {
        if (!id) throw new Error("Please provide valid Id");
        const gid = normalizeCustomerGid(id);
        const response = await admin.graphql(
            `#graphql
                query {
                    customer(id: "${gid}") {
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
                    }
                }`,
        );
        const json = await response.json();
        return json.data?.customer || null;
    } catch (error) {
        console.error("Error fetching customer from store:", error);
    }
}


export const customerOrderCount = async (admin, id) => {
    try {
        if (!id) throw new Error("Please provide valid Id");
        const gid = normalizeCustomerGid(id);
        const response = await admin.graphql(
            `#graphql
                query {
                    customer(id: "${gid}") {
                        id
                        numberOfOrders
                    }
                }`,
        );
        const json = await response.json();
        return Number(json.data?.customer?.numberOfOrders ?? 1);
    } catch (error) {
        console.error("Error fetching customer from store:", error);
    }
}
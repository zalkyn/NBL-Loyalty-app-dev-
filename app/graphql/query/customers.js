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
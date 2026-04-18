import { unauthenticated } from "../shopify.server";

export const loader = async ({ request }) => {
    const shop = "nb-loyalty.myshopify.com";
    const { admin, session } = await unauthenticated.admin(shop);

    console.log("##### redeem points session ====> ", JSON.stringify(session, null, 2))

    try {
        const response = await admin.graphql(
            `#graphql
        mutation CreateDiscountCode($basicCodeDiscount: DiscountCodeBasicInput!) {
            discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
            codeDiscountNode {
                id
                codeDiscount {
                    ... on DiscountCodeBasic {
                        title
                        startsAt
                        endsAt
                        codes(first: 10) {
                            nodes {
                                code
                            }
                        }
                        customerSelection {
                            ... on DiscountCustomers {
                                customers {
                                    id
                                }
                            }
                        }
                        customerGets {
                            value {
                                ... on DiscountPercentage {
                                    percentage
                                }
                            }
                            value {
                                ... on DiscountPercentage {
                                    percentage
                                }
                                ... on DiscountAmount {
                                    amount {
                                        amount
                                        currencyCode
                                    }
                                    appliesOnEachItem
                                }
                            }
                        }
                    }
                }
            }
            userErrors {
                field
                message
            }
            }
        }`,
            {
                variables: {
                    "basicCodeDiscount": {
                        "title": "NBL Discount 12",
                        "code": "NBL122",
                        "startsAt": "2026-04-10T00:00:00Z",
                        "endsAt": null,
                        "customerSelection": {
                            "customers": {
                                "add": [
                                    "gid://shopify/Customer/9361893785850"
                                ]
                            }
                        },
                        // "context": {
                        //     "customers": {
                        //         "remove": [
                        //             "gid://shopify/Customer/9361893785850"
                        //         ]
                        //     },
                        //     "customerSegments": {
                        //         "add": [
                        //             "gid://shopify/Segment/561590993146"
                        //         ]
                        //     }
                        // },
                        "customerGets": {
                            "value": {
                                "discountAmount": {
                                    "amount": "12.00",
                                    "appliesOnEachItem": false
                                }
                            },
                            "items": {
                                "all": true
                            }
                        },
                        // "minimumRequirement": {
                        //     "subtotal": {
                        //         "greaterThanOrEqualToSubtotal": "50.0"
                        //     }
                        // },
                        "usageLimit": 1,
                        "appliesOncePerCustomer": true
                    }
                },
            },
        );
        const json = await response.json();
        const data = json.data;

        return Response.json({
            session: session,
            data: data,
        })
    } catch (error) {
        return Response.json({
            session: session,
            error: error?.message,
            stack: error?.stack
        })
    }
}
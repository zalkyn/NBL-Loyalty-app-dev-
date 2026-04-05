import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import generateReferralCode from "../utils/generateReferralCode";

export const action = async ({ request }) => {
    const { shop, session, topic, payload } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);


    try {
        const customer = payload;
        const shopifyId = customer?.admin_graphql_api_id;

        // Instead of deleting the customer, we will mark them as blocked and inactive
        await prisma.customer.update({
            where: {
                shopifyId: shopifyId,
            },
            data: {
                activeStatus: "DELETED",
            }
        });

        console.log("## Customer deleted successfully ✅");
    } catch (error) {
        console.error("## Customer webhook error ❌", error?.message || error);
    }


    return new Response();
};

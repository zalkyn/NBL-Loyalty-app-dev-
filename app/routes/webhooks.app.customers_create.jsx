import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import generateReferralCode from "../utils/generateReferralCode";
import { syncCustomerConfig } from "app/controller/metafieldsSync/syncCustomerConfig";

export const action = async ({ request }) => {
    const { admin, shop, session, topic, payload } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);



    try {
        const customer = payload;
        const shopifyId = customer?.admin_graphql_api_id || String(customer.id);

        // Create Customer (if not exists)
        await prisma.customer.upsert({
            where: {
                shopifyId: shopifyId,
            },
            update: {
                email: customer.email,
            },
            create: {
                shopifyId: shopifyId,
                name: `${customer.first_name || ""} ${customer.last_name || ""}`.trim(),
                email: customer?.email,
                referralCode: generateReferralCode(),
                sessionId: session.id,
                metadata: customer,
            },
        });

        await syncCustomerConfig(admin, shopifyId);

        console.log("## Customer saved successfully ✅", customer.email);
    } catch (error) {
        console.error("## Customer webhook error ❌", error?.message || error);
    }


    return new Response();
};

import prisma from "../../db.server.js";

export default async function syncAppConfig({ session }) {
    try {
        const customer = await prisma.customer.findFirst({
            where: {
                sessionId: session.id,
            },
        });

        if (!customer) {
            console.warn("No customer found for session:", session.id);
            return;
        }

        let config = {};
        config.appUrl = process.env.SHOPIFY_APP_URL;


        

        console.log("## Running syncAppConfig");
        // Add any necessary logic to sync app configuration here
    } catch (error) {
        console.error("## Error in syncAppConfig:", error);
    }
}
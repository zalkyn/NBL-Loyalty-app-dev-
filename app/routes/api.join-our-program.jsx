import { logger } from "app/utils/logger"
import { unauthenticated } from "shopify-server";
import getCorsHeaders from "app/utils/getCorsHeaders"
import { customer } from "app/graphql/query/customers";
import { storeCustomer } from "@controller/customers/store"
import { syncCustomerConfig } from "@controller/metafieldsSync/syncCustomerConfig"


export async function action({ request }) {
    console.log("############################")
    const corsHeaders = getCorsHeaders(request);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
        return new Response(
            JSON.stringify({ error: "Method not allowed" }),
            { status: 405, headers: corsHeaders }
        );
    }

    try {
        const { shop, customerId } = await request.json();
        if (!shop) {
            throw new Error("Valid shop required")
        }

        const { admin, session } = await unauthenticated.admin(shop);

        if (!session) {
            throw new Error("Valid shop session required")
        }

        console.log("customerId", customerId)
        const customerResponse = await customer(admin, customerId)
        await storeCustomer(session, customerResponse)
        await syncCustomerConfig(admin, customerId);

        return new Response(
            JSON.stringify({
                shop,
                session,
                customerResponse
            }),
            { status: 200, headers: corsHeaders }
        );

    } catch (err) {
        logger.error("Request to join our program API error", {
            error: err?.message,
            stack: err?.stack,
            module: "api.join-our-program.jsx"
        })
        return new Response(
            JSON.stringify({
                error: "Failed to fetch to join our program",
                details: err.message,
            }),
            { status: 500, headers: corsHeaders }
        );
    }
}

// ----- GET: Health Check --------------------------------------------------
export async function loader({ request }) {
    const corsHeaders = getCorsHeaders(request);

    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    return new Response(
        JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }),
        { status: 200, headers: corsHeaders }
    );
}

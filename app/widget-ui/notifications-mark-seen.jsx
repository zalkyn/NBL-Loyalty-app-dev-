/**
 * @file widget-ui/notifications-mark-seen.jsx
 * @description App Proxy route: marks the logged-in customer's unseen
 * transactions as seen (notifiedAt = now()).
 *
 * Registered manually in app/routes.js:
 *   route("widget-data/notifications/mark-seen", "widget-ui/notifications-mark-seen.jsx")
 *
 * Storefront calls: POST /apps/widget/notifications/mark-seen
 *   - No body (or empty body): marks ALL unseen rows for the customer —
 *     used by the launcher/toast "open widget" flow and the initial
 *     auto-fetch. Idempotent — calling it again just updates zero rows.
 *   - Body { ids: [1, 2, ...] }: marks ONLY those specific transaction
 *     rows as seen — used when a single toast's own close (×) button is
 *     clicked. `ids` is always intersected with `customerId` server-side,
 *     so a customer can never mark another customer's rows seen even if
 *     they pass an arbitrary id.
 *
 * Only ever trusts `logged_in_customer_id` — same security rule as
 * notifications.jsx and every other app-proxy route in this app.
 */

import { authenticate } from "shopify-server";
import prisma from "db-server";
import { normalizeCustomerGid } from "@controller/customers/normalizeCustomerGid.js";
import { logger } from "app/utils/logger";

const MODULE = "widget-data.notifications-mark-seen";

export const action = async ({ request }) => {
    if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }

    let shop;
    let shopifyId;

    try {
        // Auth lives inside this try/catch (same rationale as reward-claim.jsx,
        // prize-claim.jsx, referral-claim.jsx) so an unexpected throw here is
        // logged and returns a clean response instead of an unhandled error.
        const { session } = await authenticate.public.appProxy(request);

        if (!session) {
            return new Response("Unauthorized", { status: 401 });
        }
        shop = session.shop;

        const url = new URL(request.url);
        const loggedInCustomerId = url.searchParams.get("logged_in_customer_id");

        if (!loggedInCustomerId) {
            return Response.json({ ok: false, marked: 0 });
        }
        shopifyId = normalizeCustomerGid(loggedInCustomerId);

        const customer = await prisma.customer.findUnique({
            where: { shopifyId },
            select: { id: true },
        });

        if (!customer) {
            return Response.json({ ok: false, marked: 0 });
        }

        // Optional { ids: [...] } body — only present when a single toast's
        // close button was clicked. Malformed/missing body just means "mark
        // all", same as before.
        let ids = null;
        try {
            const body = await request.json();
            if (Array.isArray(body?.ids) && body.ids.length > 0) {
                ids = body.ids
                    .map((id) => Number(id))
                    .filter((id) => Number.isInteger(id));
            }
        } catch (err) {
            // No/invalid JSON body — fall through to "mark all".
        }

        const where = ids && ids.length
            ? { id: { in: ids }, customerId: customer.id, notifiedAt: null }
            : { customerId: customer.id, notifiedAt: null };

        const { count } = await prisma.transaction.updateMany({
            where,
            data: { notifiedAt: new Date() },
        });

        return Response.json({ ok: true, marked: count });
    } catch (err) {
        // This endpoint is fire-and-forget from the client (it never awaits
        // or reads the response), so there's nothing customer-facing to
        // protect here — but we still log it so a real failure (bad auth,
        // DB outage, etc.) doesn't disappear silently in production.
        logger.error("Notifications mark-seen failed", {
            module: MODULE,
            shop,
            shopifyId,
            error: err?.message,
        });
        return Response.json({ ok: false, marked: 0 });
    }
};
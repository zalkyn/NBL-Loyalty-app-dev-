import { authenticate } from "shopify-server";
import { logger } from "app/utils/logger.js";
import { isDuplicateEvent } from "app/controller/webhook/handleDuplicateWebhook";
import { enqueueJob } from "app/controller/webhook/enqueueJob";

/** @constant {string} Module identifier for structured logging */
const MODULE = "webhooks.app.orders.paid";

const ENABLE_IDEMPOTENCY = true;

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /webhooks/orders/paid
 *
 * Acknowledges the Shopify orders/paid webhook and enqueues an ORDER_PAID
 * job for asynchronous processing by the background job poller.
 *
 * Responsibilities (webhook only):
 *   1. Authenticate the webhook request
 *   2. Deduplicate via WebhookEvent table (idempotency)
 *   3. Enqueue an ORDER_PAID job — upsert so duplicate deliveries are ignored
 *   4. Return 200 immediately so Shopify does not retry
 *
 * All business logic (points, referral, voucher) lives in orderPaidJob.js.
 *
 * @param {{ request: Request }} args - Remix action arguments
 * @returns {Promise<Response>} Always 200 — Shopify must not retry
 */
export const action = async ({ request }) => {
    try {
        const { payload, topic, shop } = await authenticate.webhook(request);
        const order = payload;

        const webhookId = request.headers.get("X-Shopify-Webhook-Id");
        const eventKey = webhookId
            ? `SHOPIFY:${webhookId}`
            : `${topic}:${order.admin_graphql_api_id}`;

        // ── 1. Duplicate check ────────────────────────────────────────────────
        if (ENABLE_IDEMPOTENCY) {
            const isDuplicate = await isDuplicateEvent({ shop, eventKey });
            if (isDuplicate) {
                logger.warn(MODULE, "Duplicate webhook — skipping", { shop, eventKey });
                return new Response("OK", { status: 200 });
            }
        }

        // ── 2. Enqueue job ────────────────────────────────────────────────────
        // Retried internally on transient DB failure — see enqueueJob.js for
        // why this write can't be allowed to fail silently.
        await enqueueJob({
            shop,
            type: "ORDER_PAID",
            idempotencyKey: eventKey,
            payload: {
                orderId: order.admin_graphql_api_id,
                customerId: order?.customer?.admin_graphql_api_id,
                webhookId,
            },
        });

        logger.info(MODULE, "ORDER_PAID job enqueued", {
            shop,
            orderId: order.admin_graphql_api_id,
        });

        // ── 3. Acknowledge ────────────────────────────────────────────────────
        return new Response("OK", { status: 200 });
    } catch (error) {
        logger.error(MODULE, "Webhook entry error", { error: error?.message });
        return new Response("OK", { status: 200 });
    }
};
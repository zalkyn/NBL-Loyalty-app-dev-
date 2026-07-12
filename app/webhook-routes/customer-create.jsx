import { authenticate } from "shopify-server";
import prisma from "db-server";
import generateReferralCode from "@app/utils/generateReferralCode.js";
import { syncCustomerConfig } from "@app/controller/metafieldsSync/syncCustomerConfig";
import { isDuplicateEvent } from "@app/controller/webhook/handleDuplicateWebhook";
import { logger } from "@app/utils/logger.js";
import { dbRetry } from "@app/utils/retry/dbRetry.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "webhook-routes/customer-create.jsx";

export const action = async ({ request }) => {
    const { admin, shop, session, topic, payload } =
        await authenticate.webhook(request);

    logger.info(shop, `Received ${topic} webhook`);

    // ── 1. Idempotency check ──────────────────────────────────────────────────
    // Uses the shared atomic check (create + unique-constraint on eventKey),
    // not a plain findUnique — a plain read-then-write check here would race
    // if Shopify redelivers the same webhook twice in quick succession.
    const webhookId = request.headers.get("x-shopify-webhook-id");
    const eventKey = webhookId ? `SHOPIFY:${webhookId}` : null;

    if (eventKey) {
        const isDuplicate = await isDuplicateEvent({ shop, eventKey });
        if (isDuplicate) {
            logger.warn(shop, "Duplicate webhook, skipping", { eventKey });
            return new Response();
        }
    }

    // ── 2. Session guard ──────────────────────────────────────────────────────
    if (!session?.id) {
        logger.warn(shop, "No session found, skipping");
        await logWebhookEvent({ eventKey, shop, topic, status: "SKIPPED", error: "No session" });
        return new Response();
    }

    // ── 3. Payload validation ─────────────────────────────────────────────────
    const customer = payload;
    const shopifyId = customer?.admin_graphql_api_id || String(customer?.id);
    const email = customer?.email;

    if (!email) {
        logger.warn(shop, "No email in payload, skipping", { shopifyId });
        await logWebhookEvent({ eventKey, shop, topic, status: "SKIPPED", error: "No email in payload" });
        return new Response();
    }

    if (!shopifyId) {
        logger.warn(shop, "No shopifyId in payload, skipping");
        await logWebhookEvent({ eventKey, shop, topic, status: "SKIPPED", error: "No shopifyId in payload" });
        return new Response();
    }

    // ── 4. Upsert customer ────────────────────────────────────────────────────
    try {
        const name = `${customer.first_name || ""} ${customer.last_name || ""}`.trim();

        const existingCustomer = await dbRetry(
            () => prisma.customer.findUnique({ where: { shopifyId }, select: { id: true } }),
            { module: MODULE, shop, shopifyId }
        );

        if (existingCustomer) {
            await dbRetry(
                () =>
                    prisma.customer.update({
                        where: { shopifyId },
                        data: {
                            email,
                            name: name || null,
                            firstName: customer.first_name || null,
                            lastName: customer.last_name || null,
                            metadata: customer,
                        },
                    }),
                { module: MODULE, shop, shopifyId }
            );

            logger.info(shop, "Customer updated", { email, shopifyId });
        } else {
            const referralCode = await generateReferralCode();

            await dbRetry(
                () =>
                    prisma.customer.create({
                        data: {
                            shopifyId,
                            name: name || null,
                            firstName: customer.first_name || null,
                            lastName: customer.last_name || null,
                            email,
                            referralCode,
                            sessionId: session.id,
                            metadata: customer,
                            // Genuinely 0 at the moment of creation (they just
                            // registered) — see the "orders" field comment in
                            // schema.prisma for why this is explicit, not
                            // left null.
                            orders: 0,
                        },
                    }),
                { module: MODULE, shop, shopifyId }
            );

            logger.success(shop, "Customer created", { email, shopifyId, referralCode });
        }

        // ── 5. Sync metafields (isolated) ─────────────────────────────────────
        // syncCustomerConfig retries transient network failures internally and
        // never throws, so no outer catch is needed here.
        await syncCustomerConfig(admin, shopifyId);

        // ── 6. Log success ────────────────────────────────────────────────────
        await logWebhookEvent({ eventKey, shop, topic, status: "PROCESSED" });

    } catch (error) {
        logger.error(shop, "Customer webhook error", error, { shopifyId, email });
        await logWebhookEvent({
            eventKey,
            shop,
            topic,
            status: "FAILED",
            error: error?.message || String(error),
        });
    }

    return new Response();
};

/**
 * Updates the WebhookEvent audit row created by `isDuplicateEvent` with the
 * final processing status. No-ops if there's no eventKey (e.g. webhook
 * arrived without an X-Shopify-Webhook-Id header).
 *
 * @param {Object} params
 * @param {string|null} params.eventKey
 * @param {string}      params.shop
 * @param {string}      params.topic
 * @param {"PROCESSED"|"SKIPPED"|"FAILED"} params.status
 * @param {string|null} [params.error]
 * @returns {Promise<void>}
 */
async function logWebhookEvent({ eventKey, shop, topic, status, error = null }) {
    if (!eventKey) return;

    try {
        await prisma.webhookEvent.upsert({
            where: { eventKey },
            update: { status, error, topic },
            create: { shop, eventKey, topic, status, error },
        });
    } catch (err) {
        logger.error(shop, "Failed to log WebhookEvent", err);
    }
}

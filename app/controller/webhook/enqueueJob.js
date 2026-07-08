import prisma from "db-server";
import { dbRetry } from "@app/utils/retry/dbRetry.js";

/**
 * Enqueues a durable job for the background job poller, keyed by an
 * idempotency key so redelivered webhooks silently no-op instead of
 * creating a second job.
 *
 * Retried on transient DB failure — this is the single durability point for
 * money-affecting webhooks (orders/paid, orders/cancelled, refunds/create):
 * those routes always ack with 200 regardless of outcome, so if this write
 * fails outright, Shopify will never redeliver and the event is lost with
 * no other retry path.
 *
 * @param {Object} params
 * @param {string} params.shop           - Shop domain
 * @param {"ORDER_PAID"|"ORDER_REVERSED"|"CUSTOMER_SYNC"} params.type - Job type
 * @param {string} params.idempotencyKey - Same eventKey used for the WebhookEvent dedupe check
 * @param {Object} params.payload        - Job-specific payload, consumed by the corresponding job processor
 * @returns {Promise<Object>} The created or already-existing Job row
 */
export const enqueueJob = ({ shop, type, idempotencyKey, payload }) =>
    dbRetry(
        () =>
            prisma.job.upsert({
                where: { idempotencyKey },
                create: { type, shop, idempotencyKey, payload },
                update: {}, // already queued — do nothing
            }),
        { shop, type, idempotencyKey }
    );

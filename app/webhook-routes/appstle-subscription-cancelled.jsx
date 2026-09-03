/* eslint-env node */
import { Webhook } from "svix";
import prisma from "db-server";
import { logger } from "app/utils/logger.js";
import { dbRetry } from "app/utils/retry/dbRetry.js";
import { isDuplicateEvent } from "app/controller/webhook/handleDuplicateWebhook";
import { enqueueJob } from "app/controller/webhook/enqueueJob";

/** @constant {string} Module identifier for structured logging */
const MODULE = "webhooks.appstle.subscription-cancelled";

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /webhooks/appstle/subscription_cancelled
 *
 * Appstle delivers its subscription events through Svix (a third-party
 * webhook-delivery service), NOT through Shopify's own webhook pipeline —
 * so this route can't use `authenticate.webhook()` like the Shopify-native
 * routes in this folder. Instead it verifies the standard Svix signature
 * scheme itself (svix-id / svix-timestamp / svix-signature headers) using
 * the official `svix` package and the per-endpoint signing secret Svix
 * generates (APPSTLE_WEBHOOK_SECRET).
 *
 * Enqueues a SUBSCRIPTION_CANCELLED job — resets the customer's current
 * points balance to 0 (lifetimePoints untouched) via
 * subscriptionCancelledJob.js / createTransaction.js's
 * SUBSCRIPTION_CANCEL_RESET case. Field mapping was confirmed against a
 * real production subscription.cancelled event on 2026-09-02: Appstle sends
 * the raw Shopify SubscriptionContract object as `data`, with
 * `data.customer.id` as the Shopify Customer GID and `data.status` as
 * "CANCELLED".
 *
 * @param {{ request: Request }} args - Remix action arguments
 * @returns {Promise<Response>} 200 once the event is durably recorded
 *   (enqueued, or a confirmed duplicate — nothing left to do). 400 for a
 *   signature that doesn't verify (permanent — retrying won't fix a bad
 *   signature). 500 for anything else — a transient failure while
 *   recording an already-authenticated event — so Svix retries instead of
 *   the event being silently lost.
 */
export const action = async ({ request }) => {
    let payload;
    let svixId;

    try {
        const rawBody = await request.text();

        // Svix now sends the unprefixed "Standard Webhooks" header names
        // (webhook-id/webhook-timestamp/webhook-signature) by default, NOT
        // the legacy "svix-*" names — confirmed against a real delivery,
        // which arrived with svix-id/svix-timestamp/svix-signature all
        // absent. Falling back to the legacy names too costs nothing and
        // covers any endpoint still configured the old way.
        svixId = request.headers.get("webhook-id") ?? request.headers.get("svix-id");
        const svixTimestamp = request.headers.get("webhook-timestamp") ?? request.headers.get("svix-timestamp");
        const svixSignature = request.headers.get("webhook-signature") ?? request.headers.get("svix-signature");

        const secret = process.env.APPSTLE_WEBHOOK_SECRET;
        if (!secret) {
            logger.error(MODULE, "APPSTLE_WEBHOOK_SECRET is not configured — rejecting webhook");
            return new Response("Server not configured", { status: 500 });
        }

        try {
            // wh.verify() only validates the signature — its return type is
            // `undefined`, it does NOT hand back the parsed payload (unlike
            // e.g. Stripe's constructEvent). The actual event body has to be
            // parsed separately, from the same rawBody bytes that were just
            // verified.
            const wh = new Webhook(secret);
            wh.verify(rawBody, {
                "svix-id": svixId,
                "svix-timestamp": svixTimestamp,
                "svix-signature": svixSignature,
            });
            payload = JSON.parse(rawBody);
        } catch (verifyError) {
            logger.error(MODULE, "Signature verification failed — rejecting webhook", {
                error: verifyError?.message,
                svixId,
            });
            return new Response("Invalid signature", { status: 400 });
        }

        // ── 1. Duplicate check ────────────────────────────────────────────────
        const eventKey = svixId ? `APPSTLE:${svixId}` : `APPSTLE:${JSON.stringify(payload)}`;
        // Appstle's subscription.cancelled payload (verified against a real
        // production event) carries no shop domain field at all — it's just
        // the raw Shopify SubscriptionContract object. Resolved instead from
        // our own Session table (the shop(s) this app is actually installed
        // on) — no manual env var to keep in sync. Safe as long as this app
        // is installed on a single shop (logged/warned below if not); if it
        // is ever installed on more than one shop, this needs a real
        // per-shop signal instead (e.g. a shop-specific endpoint URL/query
        // param configured per Svix endpoint), since nothing in Appstle's
        // payload can disambiguate which shop an event belongs to.
        const shop = payload?.shop ?? payload?.shopifyDomain ?? payload?.storeUrl ?? (await resolveInstalledShop());

        if (!shop) {
            // Nothing in Session, and the payload itself had no shop field —
            // can't know whose points to reset. Returning 500 (not 200) so
            // Svix retries: this is a real "can't process yet" state (e.g.
            // app got uninstalled), not a permanent rejection.
            logger.error(MODULE, "Could not resolve an installed shop — rejecting webhook", { svixId });
            return new Response("No installed shop found", { status: 500 });
        }

        const isDuplicate = await isDuplicateEvent({ shop, eventKey });
        if (isDuplicate) {
            logger.warn(MODULE, "Duplicate webhook — skipping", { shop, eventKey });
            return new Response("OK", { status: 200 });
        }

        // ── 2. Enqueue job ────────────────────────────────────────────────────
        await enqueueJob({
            shop,
            type: "SUBSCRIPTION_CANCELLED",
            idempotencyKey: eventKey,
            payload: { raw: payload, svixId },
        });

        logger.info(MODULE, "SUBSCRIPTION_CANCELLED job enqueued", { shop, svixId });

        // ── 3. Acknowledge ────────────────────────────────────────────────────
        return new Response("OK", { status: 200 });
    } catch (error) {
        // 500, not 200 — this catch only runs for a genuinely
        // authenticated webhook (signature verification has its own inner
        // try/catch above, which already returns 400 for a bad signature
        // and never reaches here). An error past that point — a transient
        // DB blip in resolveInstalledShop/isDuplicateEvent/enqueueJob, say
        // — means we've confirmed this event is real but failed to record
        // it. Returning 200 here would tell Svix "accepted", so it would
        // never redeliver and the cancellation (and the points reset it
        // should trigger) would be silently lost forever with no Job row,
        // no audit row, nothing. 500 makes Svix retry; that retry is safe
        // because isDuplicateEvent + enqueueJob's idempotencyKey upsert
        // (and subscriptionCancelledJob.js's own svixId-keyed check) all
        // make redelivery a no-op if part of the work already landed.
        logger.error(MODULE, "Webhook entry error — Svix will retry", { error: error?.message, svixId });
        return new Response("Internal error", { status: 500 });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the shop this Appstle webhook belongs to, from our own Session
 * table — i.e. whichever shop(s) this app is actually installed on. See the
 * comment at the call site above for why this is needed (Appstle's payload
 * carries no shop field) and its single-shop assumption.
 *
 * @returns {Promise<string|null>}
 */
async function resolveInstalledShop() {
    // orderBy is required here, not decoration — Postgres doesn't guarantee
    // row order without one, so without it "the first shop found" would be
    // nondeterministic per call in the (unsupported, warned-about) case of
    // more than one installed shop.
    const sessions = await dbRetry(
        () => prisma.session.findMany({ select: { shop: true }, distinct: ["shop"], orderBy: { shop: "asc" }, take: 2 }),
        { module: MODULE }
    );

    if (sessions.length > 1) {
        logger.warn(
            MODULE,
            "More than one shop has an active session — Appstle's payload can't say which shop this event belongs to, using the first one found",
            { shops: sessions.map((s) => s.shop) }
        );
    }

    return sessions[0]?.shop ?? null;
}

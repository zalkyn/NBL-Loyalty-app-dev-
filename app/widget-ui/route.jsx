/**
 * @file widget-ui/route.jsx
 * @description App Proxy route for the storefront widget — periodic,
 * silent config resync for an already-joined customer.
 *
 * Registered manually in app/routes.js:
 *   route("widget-data", "widget-ui/route.jsx")
 *
 * shopify.app.toml:
 *   [app_proxy]
 *   url = "/widget-data"   -> this file
 *   prefix = "apps"
 *   subpath = "widget"
 *
 * Storefront requests to https://{shop}.myshopify.com/apps/widget get
 * proxied by Shopify to https://<application_url>/widget-data, with a
 * Shopify-signed query string (shop, signature, timestamp, and — when the
 * shopper is logged in — logged_in_customer_id).
 *
 * Endpoints:
 *   GET /apps/widget  — Re-syncs and returns the logged-in customer's app
 *                       config (points, referralCode, rewards, prizeClaims,
 *                       transactions). Called by useConfigResync.js, at
 *                       most once every few hours per browser (throttled
 *                       client-side via localStorage) — see that hook for
 *                       why: it heals metafields left stale by a backend
 *                       schema change or old test data, and lets the
 *                       widget refresh in place without a page reload.
 */

import { authenticate } from "shopify-server";
import { logger } from "app/utils/logger";
import ensureAndSyncCustomer from "@controller/customers/ensureAndSyncCustomer.js";
import { checkRateLimit } from "app/utils/rateLimiter.server.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const MODULE = "widget-ui/route.jsx";

const HTTP = /** @type {const} */ ({
    OK: 200,
    UNAUTHORIZED: 401,
    TOO_MANY_REQUESTS: 429,
});

// ─── GET: Config resync ─────────────────────────────────────────────────────────

/**
 * Handles GET /apps/widget.
 *
 * Flow:
 *  1. Verify the request's Shopify signature (authenticate.public.appProxy)
 *  2. Only ever trust `logged_in_customer_id` for identity — Shopify appends
 *     it itself and it's covered by the signature just verified. Never
 *     accept a self-invented query param (e.g. ?customer_id=123) — that
 *     would let anyone read anyone else's data.
 *  3. Guest (not logged in) -> generic response, nothing to sync
 *  4. Logged in -> ensureAndSyncCustomer() re-syncs this customer fresh
 *     from the DB (current schema, whatever it is today) and rewrites
 *     their nbl_customer_v1 metafield — creating the DB record first if
 *     it's missing (self-healing: a customer's metafield can go on
 *     looking "valid" even after their DB row is gone, e.g. test data
 *     wiped directly from the database — see ensureAndSyncCustomer.js for
 *     why this matters specifically for the resync path). We then return
 *     that same fresh shape so the widget can update in place, no reload
 *     needed.
 *
 * Deliberately does NOT return raw Shopify customer fields (name, email,
 * phone, tags, amountSpent, etc.) — only our own app config, which is all
 * the widget ever reads. See CUSTOMER_SELECT in syncCustomerConfig.js for
 * the exact shape returned.
 *
 * @param {{ request: Request }} context - React Router loader context
 * @returns {Promise<Response>}
 */
export async function loader({ request }) {
    const { session, admin } = await authenticate.public.appProxy(request);

    if (!session) {
        return jsonResponse({ error: "Unauthorized" }, HTTP.UNAUTHORIZED);
    }

    const url = new URL(request.url);
    const loggedInCustomerId = url.searchParams.get("logged_in_customer_id");

    if (!loggedInCustomerId) {
        // Guest visitor — nothing to sync, don't cache aggressively since
        // this is served fresh per-request via the proxy.
        return jsonResponse(
            { config: null },
            HTTP.OK,
            { "Cache-Control": "public, max-age=30" },
        );
    }

    // ── Server-side rate limit ──────────────────────────────────────────────
    // Backstops the client-side 4-hour throttle in useConfigResync.js, which
    // only stops the widget's OWN well-behaved JS — not a direct, replayed
    // request bypassing it. 30/min is generous (this path is meant to be
    // called at most every few hours in normal use) while still blocking
    // an obvious hammering script. See rateLimiter.server.js for the full
    // rationale and its single-instance caveat.
    const rateCheck = checkRateLimit(`resync:${session.shop}:${loggedInCustomerId}`, { max: 30, windowMs: 60_000 });
    if (!rateCheck.allowed) {
        return jsonResponse({ config: null }, HTTP.TOO_MANY_REQUESTS, { "Retry-After": String(rateCheck.retryAfterSeconds) });
    }

    // ensureAndSyncCustomer never throws for the "customer not found on
    // Shopify" case — it resolves { config: null } instead. Always resolve
    // 200 here regardless: this is a best-effort background refresh the
    // widget silently retries later, not something worth surfacing as an
    // error to the customer.
    let result;
    try {
        result = await ensureAndSyncCustomer(admin, session, loggedInCustomerId);
    } catch (error) {
        logger.error(MODULE, "Failed to resync widget config", {
            shop: session.shop,
            loggedInCustomerId,
            error: error?.message,
        });
        return jsonResponse({ config: null }, HTTP.OK, {
            "Cache-Control": "private, no-store",
        });
    }

    const { config, created } = result;

    if (!config) {
        logger.warn(MODULE, "Config resync returned nothing", {
            shop: session.shop,
            loggedInCustomerId,
        });
        return jsonResponse({ config: null }, HTTP.OK, {
            "Cache-Control": "private, no-store",
        });
    }

    logger.info(MODULE, created ? "Customer self-healed and synced" : "Config resynced for logged-in customer", {
        shop: session.shop,
        loggedInCustomerId,
    });

    return jsonResponse(
        { config },
        HTTP.OK,
        // Personalized response — never let this be cached by CDNs/browsers.
        { "Cache-Control": "private, no-store" },
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds a JSON `Response` with the correct `Content-Type` header and
 * any additional headers.
 *
 * @param {Record<string, unknown>} data    - Payload to serialise as JSON
 * @param {number}                  status  - HTTP status code
 * @param {Record<string, string>}  [headers] - Extra response headers
 * @returns {Response}
 */
function jsonResponse(data, status, headers = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
    });
}
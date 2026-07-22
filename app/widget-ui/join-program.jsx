/**
 * @file widget-ui/join-program.jsx
 * @description App Proxy route: explicitly enrolls the logged-in storefront
 * customer into the loyalty/referral program.
 *
 * Registered manually in app/routes.js:
 *   route("widget-data/join-program", "widget-ui/join-program.jsx")
 *
 * Storefront calls: POST /apps/widget/join-program  (no body needed —
 * Shopify signs and appends `logged_in_customer_id` itself; that's the only
 * identity source this route trusts.)
 *
 * Use case: a customer who existed before the app was installed (or whose
 * customers/create webhook was missed/delayed) is logged in on the
 * storefront but has no app-side Customer record yet. The widget shows a
 * "Join our program" step; this route runs only when that button is
 * explicitly clicked — unlike provision-customer.jsx, which does the same
 * underlying enrollment silently/automatically. Which one the widget uses
 * is controlled by the `autoProvisionCustomer` app-config flag on the
 * frontend (see useCustomerProvision.js / useJoinProgram.js).
 *
 * Idempotent — safe to call repeatedly; an already-enrolled customer just
 * gets `alreadyJoined: true` back instead of a duplicate record. The
 * actual create-if-missing logic lives in ensureAndSyncCustomer.js, shared
 * with provision-customer.jsx and the periodic resync in route.jsx.
 *
 * Response (200):
 *   { success: true, alreadyJoined: boolean, config: Object }
 *   config is the same shape syncCustomerConfig.js writes to the customer's
 *   metafields (id, shopifyId, points, referralCode, transactions, rewards,
 *   prizeClaims, lastSyncedVersionKey) — included so the frontend can patch
 *   its own state in place instead of reloading the page. See
 *   useJoinProgram.js.
 *
 * Error responses (400 / 401 / 404 / 500):
 *   { success: false, code, message }
 */

import { logger } from "app/utils/logger";
import { authenticate } from "shopify-server";
import { normalizeCustomerGid } from "@controller/customers/normalizeCustomerGid.js";
import ensureAndSyncCustomer from "@controller/customers/ensureAndSyncCustomer.js";
import { checkRateLimit } from "app/utils/rateLimiter.server.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "widget-data.join-program";

const ERROR_CODES = {
    UNAUTHORIZED: { code: "UNAUTHORIZED", status: 401 },
    NOT_LOGGED_IN: { code: "NOT_LOGGED_IN", status: 400 },
    SHOPIFY_CUSTOMER_NOT_FOUND: { code: "SHOPIFY_CUSTOMER_NOT_FOUND", status: 404 },
    RATE_LIMITED: { code: "RATE_LIMITED", status: 429 },
    INTERNAL_ERROR: { code: "INTERNAL_ERROR", status: 500 },
};

export async function action({ request }) {
    if (request.method !== "POST") {
        return jsonResponse({ success: false, message: "Method not allowed.", code: "INVALID_INPUT" }, 405);
    }

    let shop;
    let shopifyId;

    try {
        // ── 1. Verify the request came from Shopify's App Proxy ────────────────
        const { session, admin } = await authenticate.public.appProxy(request);
        if (!session) throw createError("Valid shop session required.", ERROR_CODES.UNAUTHORIZED);
        shop = session.shop;

        // ── 2. Identity — ONLY from Shopify's signed query param ───────────────
        // Never accept a customerId from the request body — logged_in_customer_id
        // is appended by Shopify itself and is covered by the signature that
        // authenticate.public.appProxy just verified.
        const url = new URL(request.url);
        const loggedInCustomerId = url.searchParams.get("logged_in_customer_id");
        if (!loggedInCustomerId) {
            throw createError("Not logged in.", ERROR_CODES.NOT_LOGGED_IN);
        }
        shopifyId = normalizeCustomerGid(loggedInCustomerId);

        // ── Server-side rate limit ───────────────────────────────────────────
        // Backstops useJoinProgram.js's in-flight `joining` guard, which
        // only stops a double-click from the widget's own JS — not a
        // direct, replayed request. A real customer clicks this once; 5/min
        // is already generous, it just needs to block obvious hammering.
        // See rateLimiter.server.js.
        const rateCheck = checkRateLimit(`join:${shop}:${shopifyId}`, { max: 5, windowMs: 60_000 });
        if (!rateCheck.allowed) {
            throw createError("Too many requests.", ERROR_CODES.RATE_LIMITED);
        }

        // ── 3. Ensure record exists + sync — see ensureAndSyncCustomer.js ──────
        const { config, created } = await ensureAndSyncCustomer(admin, session, loggedInCustomerId);

        if (!config) {
            throw createError("Shopify customer not found.", ERROR_CODES.SHOPIFY_CUSTOMER_NOT_FOUND);
        }

        if (created) {
            logger.success("Customer joined program from storefront", {
                module: MODULE,
                shop,
                shopifyId,
                referralCode: config.referralCode,
            });
        }

        return jsonResponse({ success: true, alreadyJoined: !created, config }, 200);
    } catch (err) {
        const errorDef = err?.errorDef || ERROR_CODES.INTERNAL_ERROR;
        const isClientError = errorDef.status < 500;

        if (isClientError) {
            logger.warn("Join program rejected", {
                module: MODULE,
                shop,
                shopifyId,
                code: errorDef.code,
                error: err?.message,
            });
        } else {
            logger.error("Join program error", {
                module: MODULE,
                shop,
                shopifyId,
                code: errorDef.code,
                error: err?.message,
            });
        }

        // Client errors (4xx) carry a customer-safe message already. For
        // anything unexpected (5xx) never forward err.message — it may
        // contain internal details (DB/Prisma errors, stack info) — return
        // a generic message instead; the real error is already logged above.
        const message = isClientError ? err.message : "Something went wrong. Please try again.";

        return jsonResponse({ success: false, message, code: errorDef.code }, errorDef.status);
    }
}

export async function loader() {
    return jsonResponse({ status: "ok", timestamp: new Date().toISOString() }, 200);
}

function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

function createError(message, errorDef) {
    const err = new Error(message);
    err.errorDef = errorDef;
    return err;
}

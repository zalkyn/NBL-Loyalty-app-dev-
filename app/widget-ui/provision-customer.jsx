/**
 * @file widget-ui/provision-customer.jsx
 * @description App Proxy route: silently creates the app's Customer record
 * (+ referral code) for a Shopify customer who is logged in on the
 * storefront but doesn't yet have an app-side record (e.g. customer existed
 * before app install, or the create webhook was missed/delayed).
 *
 * Registered manually in app/routes.js:
 *   route("widget-data/provision-customer", "widget-ui/provision-customer.jsx")
 *
 * Storefront calls: POST /apps/widget/provision-customer  (no body needed —
 * Shopify signs and appends `logged_in_customer_id` itself; that's the only
 * identity source this route trusts.)
 *
 * Idempotent — safe to call repeatedly. The actual create-if-missing logic
 * lives in ensureAndSyncCustomer.js, shared with join-program.jsx and the
 * periodic resync in route.jsx.
 *
 * Response (200):
 *   { success: true, shouldReload: boolean }
 *   shouldReload is true only when a NEW record was just created.
 *
 * Error responses (401 / 404 / 500):
 *   { success: false, code, message }
 */

import { logger } from "app/utils/logger";
import { authenticate } from "shopify-server";
import { normalizeCustomerGid } from "@controller/customers/normalizeCustomerGid.js";
import ensureAndSyncCustomer from "@controller/customers/ensureAndSyncCustomer.js";

const MODULE = "widget-data.provision-customer";

const ERROR_CODES = {
    UNAUTHORIZED: { code: "UNAUTHORIZED", status: 401 },
    NOT_LOGGED_IN: { code: "NOT_LOGGED_IN", status: 400 },
    SHOPIFY_CUSTOMER_NOT_FOUND: { code: "SHOPIFY_CUSTOMER_NOT_FOUND", status: 404 },
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

        // ── 3. Ensure record exists + sync — see ensureAndSyncCustomer.js ──────
        const { config, created } = await ensureAndSyncCustomer(admin, session, loggedInCustomerId);

        if (!config) {
            throw createError("Shopify customer not found.", ERROR_CODES.SHOPIFY_CUSTOMER_NOT_FOUND);
        }

        if (created) {
            logger.success("Customer auto-provisioned from storefront", {
                shop,
                shopifyId,
                referralCode: config.referralCode,
                module: MODULE,
            });
        }

        return jsonResponse({ success: true, shouldReload: created }, 200);

    } catch (err) {
        const errorDef = err?.errorDef || ERROR_CODES.INTERNAL_ERROR;
        const isClientError = errorDef.status < 500;

        if (isClientError) {
            logger.warn("Customer provision rejected", {
                error: err?.message,
                code: errorDef.code,
                shop,
                shopifyId,
                module: MODULE,
            });
        } else {
            logger.error("Customer provision error", {
                error: err?.message,
                code: errorDef.code,
                shop,
                shopifyId,
                module: MODULE,
            });
        }

        return jsonResponse(
            { success: false, message: err.message || "Something went wrong.", code: errorDef.code },
            errorDef.status
        );
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

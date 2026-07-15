/**
 * @file utils/rateLimiter.server.js
 * @description Lightweight, in-memory, per-key rate limiter for the
 * storefront-facing App Proxy routes (widget-ui/route.jsx,
 * provision-customer.jsx, join-program.jsx).
 *
 * WHY THIS IS NEEDED even though these routes already verify Shopify's App
 * Proxy signature (authenticate.public.appProxy): that signature proves the
 * request genuinely came through Shopify's proxy for a real shop+customer —
 * it does NOT limit how MANY times a legitimate, validly-signed request can
 * be repeated. A random anonymous script on the open internet can't forge a
 * valid signature (so it can't hit these routes at all), but a customer's
 * own browser — or anyone who captures one of their own signed proxy URLs
 * and replays it directly with curl/fetch, bypassing the widget's JS
 * entirely — absolutely can call these repeatedly. Each of these routes
 * calls ensureAndSyncCustomer() underneath, which writes to a REAL Shopify
 * metafield (burns real Admin API rate-limit cost) and the app's own DB on
 * every single call — so unthrottled repeats are a genuine cost/abuse
 * vector, not just a theoretical one.
 *
 * The existing client-side throttles (useConfigResync's 4-hour localStorage
 * check, useCustomerProvision's sessionStorage circuit breaker,
 * useJoinProgram's in-flight guard) are ALL trivially bypassable this way —
 * they only stop the widget's own well-behaved JS from calling too often,
 * not a deliberate direct request. This is the server-side backstop.
 *
 * CAVEAT — read before assuming this is bulletproof: this is a per-process,
 * in-memory counter. It resets on every deploy/restart, and does NOT share
 * state across multiple running instances if this app is ever horizontally
 * scaled (each instance would enforce its own separate limit, so the
 * effective limit across N instances is N times higher than the number
 * below). That's an acceptable tradeoff for a single-instance or
 * low-instance-count deployment, but if this app scales out to several
 * instances behind a load balancer, replace the Map below with a shared
 * store (Redis, or a dedicated DB table) so all instances enforce the same
 * counter. Flagging this now rather than presenting it as a complete
 * solution.
 */

/** @type {Map<string, { count: number, windowStart: number }>} */
const buckets = new Map();

// Prevents unbounded memory growth from one-off keys (e.g. customers who
// visit once and never come back) — sweeps anything untouched for a while.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const CLEANUP_MAX_AGE_MS = 10 * 60 * 1000;

const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets) {
        if (now - entry.windowStart > CLEANUP_MAX_AGE_MS) buckets.delete(key);
    }
}, CLEANUP_INTERVAL_MS);
// Never keep the Node process alive just for this — it's cleanup, not
// meaningful work. Not all runtimes expose unref (e.g. some edge/worker
// environments), so guard the call.
if (typeof cleanupTimer.unref === "function") cleanupTimer.unref();

/**
 * Fixed-window rate check. Not a token bucket / sliding window — deliberately
 * simple, since the goal here is "stop obvious hammering," not precise
 * traffic shaping. A key can burst up to `max` requests right at a window
 * boundary (e.g. one at 0:59.9 and another at 1:00.1) — acceptable for this
 * use case.
 *
 * @param {string} key - Caller-provided identity, e.g. `${routeName}:${shop}:${shopifyId}`.
 *   Always scope by shop AND customer (never just customer id alone,
 *   which isn't unique across shops) — see call sites.
 * @param {Object} options
 * @param {number} options.max - Max allowed requests within the window.
 * @param {number} options.windowMs - Window length in milliseconds.
 * @returns {{ allowed: boolean, retryAfterSeconds?: number }}
 */
export function checkRateLimit(key, { max, windowMs }) {
    const now = Date.now();
    const entry = buckets.get(key);

    if (!entry || now - entry.windowStart >= windowMs) {
        buckets.set(key, { count: 1, windowStart: now });
        return { allowed: true };
    }

    if (entry.count >= max) {
        const retryAfterSeconds = Math.ceil((windowMs - (now - entry.windowStart)) / 1000);
        return { allowed: false, retryAfterSeconds };
    }

    entry.count += 1;
    return { allowed: true };
}
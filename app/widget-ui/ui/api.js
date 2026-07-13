// =============================================================================
// modules/module-preact/api.js
// Promise-based fetch wrappers — SINGLE source of truth for every network
// call the widget makes. No hook/component should call fetch() directly —
// add a function here instead, so all request-building, error-shaping, and
// (soon) auth conventions live in exactly one place.
//
// ── App Proxy, not appConfig.appUrl ───────────────────────────────────────
// Every call below goes to `proxyPath` (e.g. "/apps/widget/...", same
// storefront domain the widget is embedded on) — never the app's own
// backend domain. Shopify signs and forwards these requests itself, adding
// a verified `logged_in_customer_id` on the way through, which is what the
// backend actually trusts for identity. This also means the app's real
// domain never appears anywhere in the browser (console, Network tab, or
// otherwise) — only Shopify's own `/apps/...` path is ever visible.
//
// ── Error-message policy ──────────────────────────────────────────────────
// The customer must NEVER see a raw/technical error (HTTP status codes,
// stack traces, DB/network error strings). The backend's `details` field on
// a 4xx business-rule error (insufficient points, reward inactive, usage
// limit reached, etc.) IS already written to be customer-safe — those pass
// through as-is. Anything else (5xx, malformed response, network failure,
// timeout) falls back to GENERIC_ERROR_MESSAGE below.
//
// ── Why there's no auto-retry on reward/prize claims ──────────────────────
// Those two endpoints deduct points and are not idempotent — the server has
// no way to recognize "this is the same claim being retried" vs. "a new
// claim". If a request times out on the client after the server already
// completed it (response just got lost in transit), a silent client-side
// retry would deduct points / issue a voucher a second time. Until the
// backend supports an idempotency key for these two flows, retrying is left
// to the customer via the existing "Try again" button in NotificationPanel
// (claimState === 'error' already relabels the action button to that), so
// nothing is ever resent without the customer choosing to.
// =============================================================================

const GENERIC_ERROR_MESSAGE = "Something went wrong on our end. Please try again in a moment.";

// Business-rule errors the backend returns with a 4xx and an already
// customer-safe `details`/`message` field. Anything outside this set (5xx,
// network error, timeout, malformed body) is not trusted verbatim.
const SAFE_STATUS_RANGE = [400, 499];

function isSafeStatus(status) {
    return status >= SAFE_STATUS_RANGE[0] && status <= SAFE_STATUS_RANGE[1];
}

function buildUrl(proxyPath, path) {
    return (proxyPath || '/apps/widget') + path;
}

/**
 * POSTs JSON to a widget-data (app proxy) endpoint and resolves with the
 * parsed body on success. On any failure — non-2xx response, malformed
 * JSON, network error, or timeout — rejects with an Error whose `.message`
 * is always safe to show the customer directly (never a raw status code or
 * internal error string).
 *
 * @param {string} url
 * @param {object} [body]
 * @param {number} [timeoutMs]
 * @returns {Promise<object>}
 */
async function postJson(url, body, timeoutMs = 40000) {
    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {}),
            signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
        });
    } catch (err) {
        // Network failure, DNS error, or client-side timeout (AbortError) —
        // never surface the raw err.message (e.g. "Failed to fetch").
        // eslint-disable-next-line no-console
        console.error('[NBL] request failed:', err);
        throw new Error(GENERIC_ERROR_MESSAGE);
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        const detail = (data && (data.details || data.message)) || null;
        const friendly = isSafeStatus(res.status) && detail ? detail : GENERIC_ERROR_MESSAGE;
        if (!isSafeStatus(res.status)) {
            // eslint-disable-next-line no-console
            console.error('[NBL] server error', res.status, data);
        }
        throw new Error(friendly);
    }

    return data;
}

// =============================================================================
// Customer provisioning (useCustomerProvision.js)
// =============================================================================

/**
 * Silently provisions the app's Customer record for the currently logged-in
 * storefront customer if one doesn't already exist. Identity is entirely
 * server-derived (signed `logged_in_customer_id`) — no body needed.
 *
 * @param {Object} params
 * @param {string} params.proxyPath
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{ success: boolean, shouldReload: boolean }>}
 */
export async function requestProvisionCustomer({ proxyPath, signal }) {
    const res = await fetch(buildUrl(proxyPath, '/provision-customer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        signal,
    });
    return res.json().catch(() => ({}));
}

// =============================================================================
// Config resync (useConfigResync.js)
// =============================================================================

/**
 * Re-syncs an already-joined customer's app config (points, referralCode,
 * rewards, prizeClaims, transactions) — heals a metafield left stale by a
 * backend schema change or old test data. GET, not POST: this hits the App
 * Proxy root (widget-ui/route.jsx), same endpoint that would serve live
 * widget data. Best-effort and silent by design (see useConfigResync.js) —
 * never throws, just resolves `{}` on any failure so the caller doesn't
 * need a try/catch.
 *
 * @param {Object} params
 * @param {string} params.proxyPath
 * @returns {Promise<{ config: Object|null }>}
 */
export async function requestConfigResync({ proxyPath }) {
    const res = await fetch(buildUrl(proxyPath, ''), { method: 'GET' });
    return res.json().catch(() => ({}));
}

// =============================================================================
// Join program (useJoinProgram.js)
// =============================================================================

/**
 * Explicitly enrolls the currently logged-in storefront customer into the
 * loyalty/referral program. Unlike requestProvisionCustomer above, this is
 * user-initiated (button click, not a silent boot-time attempt) so it goes
 * through postJson — a failure surfaces a customer-safe error message
 * instead of being swallowed. Identity is entirely server-derived (signed
 * `logged_in_customer_id`) — no body needed.
 *
 * @param {Object} params
 * @param {string} params.proxyPath
 * @returns {Promise<{ success: boolean, alreadyJoined: boolean }>}
 */
export async function requestJoinProgram({ proxyPath }) {
    return postJson(buildUrl(proxyPath, '/join-program'), {});
}

// =============================================================================
// Referral (useReferralModal.js)
// =============================================================================

/**
 * @param {Object} params
 * @param {string} params.proxyPath
 * @param {string} params.referralCode
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<object>} Raw backend body — useReferralModal maps
 *   `data.code` to customer-facing copy itself, so this intentionally does
 *   NOT throw on a 4xx the way postJson() does.
 */
export async function requestReferralDiscount({ proxyPath, referralCode, signal }) {
    const res = await fetch(buildUrl(proxyPath, '/get-referral-discount'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralCode }),
        signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.code) data.code = 'INTERNAL_ERROR';
    return data;
}

// =============================================================================
// Rewards & prizes (App.jsx handleClaim)
// =============================================================================

export async function requestRewardVoucher({ rewardRuleId, title, proxyPath }) {
    if (!rewardRuleId) {
        throw new Error('Missing required data. Please refresh and try again.');
    }

    const data = await postJson(buildUrl(proxyPath, '/get-reward-voucher'), { rewardRuleId, title });

    if (!data || !data.voucherCode) throw new Error(GENERIC_ERROR_MESSAGE);
    return data;
}

export async function requestClaimPrize({ prizeId, proxyPath }) {
    if (!prizeId) {
        throw new Error('Missing required data. Please refresh and try again.');
    }

    return postJson(buildUrl(proxyPath, '/claim-prize'), { prizeId });
}

// =============================================================================
// Toast notifications (useToastNotifications.js)
// =============================================================================

/**
 * Fire-and-forget, idempotent. `ids` omitted -> server marks ALL unseen rows
 * for the customer. `ids: [id]` -> only that one (toast's own close button).
 *
 * @param {Object} params
 * @param {string} params.proxyPath
 * @param {Array} [params.ids]
 */
export function markNotificationsSeen({ proxyPath, ids }) {
    const hasIds = Array.isArray(ids) && ids.length > 0;
    fetch(buildUrl(proxyPath, '/notifications/mark-seen'), {
        method: 'POST',
        headers: hasIds ? { 'Content-Type': 'application/json' } : undefined,
        body: hasIds ? JSON.stringify({ ids }) : undefined,
    }).catch(() => { });
}

// =============================================================================
// modules/module-preact/api.js
// Promise-based fetch wrappers — purono api.js-er replacement.
// eventBus.emit() na, ekhon shudhu async function jeটা resolve/reject kore —
// caller (App.jsx) .then()/.catch() ba try/catch diye handle kore.
//
// ── Error-message policy ──────────────────────────────────────────────────
// The customer must NEVER see a raw/technical error (HTTP status codes,
// stack traces, DB/network error strings). The backend's `details` field on
// a 4xx business-rule error (insufficient points, reward inactive, usage
// limit reached, etc.) IS already written to be customer-safe — those pass
// through as-is. Anything else (5xx, malformed response, network failure,
// timeout) falls back to GENERIC_ERROR_MESSAGE below.
//
// ── Why there's no auto-retry here (unlike the referral flow) ────────────
// These two endpoints deduct points and are not idempotent — the server has
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
// customer-safe `details` message. Anything outside this set (5xx, network
// error, timeout, malformed body) is not trusted verbatim.
const SAFE_STATUS_RANGE = [400, 499];

function isSafeStatus(status) {
    return status >= SAFE_STATUS_RANGE[0] && status <= SAFE_STATUS_RANGE[1];
}

/**
 * POSTs JSON and resolves with the parsed body on success. On any failure —
 * non-2xx response, malformed JSON, network error, or timeout — rejects
 * with an Error whose `.message` is always safe to show the customer
 * directly (never a raw status code or internal error string).
 *
 * @param {string} url
 * @param {object} body
 * @param {number} [timeoutMs]
 * @returns {Promise<object>}
 */
async function postJson(url, body, timeoutMs = 40000) {
    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
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
        const friendly = isSafeStatus(res.status) && data && data.details
            ? data.details
            : GENERIC_ERROR_MESSAGE;
        if (!isSafeStatus(res.status)) {
            // eslint-disable-next-line no-console
            console.error('[NBL] server error', res.status, data);
        }
        throw new Error(friendly);
    }

    return data;
}

export async function requestRewardVoucher({ rewardRuleId, title, customer, appConfig }) {
    if (!rewardRuleId || !customer || !customer.id || !customer.config || !customer.config.id) {
        throw new Error('Missing required data. Please refresh and try again.');
    }

    const data = await postJson(appConfig.appUrl + '/api/get-reward-voucher', {
        shop: window.Shopify && window.Shopify.shop,
        customerId: customer.id,
        rewardRuleId,
        title,
        customerIndex: customer.config.id,
    });

    if (!data || !data.voucherCode) throw new Error(GENERIC_ERROR_MESSAGE);
    return data;
}

export async function requestClaimPrize({ prizeId, customer, appConfig }) {
    if (!prizeId || !customer || !customer.id || !customer.config || !customer.config.id) {
        throw new Error('Missing required data. Please refresh and try again.');
    }

    return postJson(appConfig.appUrl + '/api/claim-prize', {
        shop: window.Shopify && window.Shopify.shop,
        customerId: customer.id,
        customerIndex: customer.config.id,
        prizeId,
    });
}
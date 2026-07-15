// =============================================================================
// app/widget-ui/ui/hooks/referralCache.js
// localStorage cache + URL code detection — pure functions, purono
// referral-modal.js-er cache/URL logic-er extraction, framework-agnostic.
//
// getClaim/setClaim/getCache/setCache/hasUsedCode are ALL scoped by
// customerId — localStorage is shared per-browser, not per-account, so on
// a shared/family device (or someone logging out and a different customer
// logging in) an unscoped cache would leak the first customer's referral
// claim to the second. Callers must always pass the current customer's id
// (Shopify customer id/GID — same value used elsewhere, e.g.
// useCustomerProvision's shopifyCustomerId).
//
// PENDING_KEY (savePendingCode/restorePendingCode) is deliberately NOT
// scoped by customerId — it exists specifically for the pre-login moment,
// before any customer identity is known yet. To still stay safe on a
// shared/family device, it carries its own short expiry (see
// PENDING_EXPIRY_MS below) so an abandoned login can't leak its referral
// code to whichever different customer happens to log in next on the same
// browser.
// =============================================================================

const CACHE_PREFIX = 'NBL_ReferralCache_';
const CLAIM_PREFIX = 'NBL_ReferralClaim_';
const PENDING_KEY = 'NBL_PendingReferral';

function cacheKey(customerId) {
    return `${CACHE_PREFIX}${customerId}`;
}
function claimKey(customerId) {
    return `${CLAIM_PREFIX}${customerId}`;
}

export function getCacheStore(customerId) {
    try { return JSON.parse(localStorage.getItem(cacheKey(customerId))) || {}; } catch (e) { return {}; }
}
export function setCacheStore(customerId, store) {
    try { localStorage.setItem(cacheKey(customerId), JSON.stringify(store)); } catch (e) { /* ignore */ }
}
export function getCache(customerId, code) {
    const store = getCacheStore(customerId);
    const item = store[code];
    if (!item) return null;
    if (Date.now() > item.expiresAt) { delete store[code]; setCacheStore(customerId, store); return null; }
    return item.data;
}
export function setCache(customerId, code, data) {
    const duration = data.success ? 60000 : 30000;
    const store = getCacheStore(customerId);
    store[code] = { data, expiresAt: Date.now() + duration };
    setCacheStore(customerId, store);
}
export function hasUsedCode(customerId) {
    return Object.values(getCacheStore(customerId)).some(
        (entry) => entry.data && entry.data.success && entry.data.referralDiscountCode
    );
}
export function sweepExpiredCache(customerId) {
    const store = getCacheStore(customerId);
    const now = Date.now();
    Object.keys(store).forEach((key) => { if (now > store[key].expiresAt) delete store[key]; });
    setCacheStore(customerId, store);
}

// ── Persistent claim record ───────────────────────────────────────────────
// Unlike getCache/setCache above (short TTL, used to dedupe in-flight
// requests), this is a permanent record of "this customer already claimed
// a referral with this code". It never expires, so revisiting the same
// referral link later — even after the short-lived cache has expired —
// still shows the right state without hitting the API again.

export function getClaim(customerId) {
    try { return JSON.parse(localStorage.getItem(claimKey(customerId))); } catch (e) { return null; }
}
export function setClaim(customerId, { code, discountCode, used, lockedToOtherCode, message }) {
    try {
        localStorage.setItem(claimKey(customerId), JSON.stringify({
            code,
            discountCode: discountCode || null,
            used: !!used,
            lockedToOtherCode: !!lockedToOtherCode,
            message: message || null,
            savedAt: Date.now(),
        }));
    } catch (e) { /* ignore */ }
}
export function markClaimUsed(customerId) {
    const claim = getClaim(customerId);
    if (!claim) return;
    setClaim(customerId, { ...claim, used: true });
}
export function clearClaim(customerId) {
    try { localStorage.removeItem(claimKey(customerId)); } catch (e) { /* ignore */ }
}

export function getURLCode() {
    return new URLSearchParams(window.location.search).get('nbl-referral');
}
export function removeURLCode() {
    const url = new URL(window.location.href);
    url.searchParams.delete('nbl-referral');
    history.replaceState({}, '', url);
}

// How long a pending code survives the login redirect round-trip before
// being treated as abandoned. This only needs to comfortably cover a normal
// login (including e.g. a password reset detour) — it deliberately does NOT
// need to survive hours/days. A short window closes off the shared/family-
// device case where customer A clicks "Login" (saving their pending code)
// but never completes it, and customer B logs into a *different* account on
// the same browser later — without this, B's session would silently
// auto-apply A's referral code on next load. PENDING_KEY itself is
// intentionally unscoped (no customer identity exists yet at save-time), so
// this expiry is the only thing standing between "normal login flow" and
// "stale code leaking to whoever logs in next on this browser".
const PENDING_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

export function savePendingCode(code) {
    if (!code) return;
    try {
        localStorage.setItem(PENDING_KEY, JSON.stringify({ code, savedAt: Date.now() }));
    } catch (e) { /* ignore — storage unavailable/blocked */ }
}
export function restorePendingCode() {
    const urlCode = getURLCode();
    if (urlCode) return urlCode;

    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem(PENDING_KEY));
    } catch (e) {
        // Also catches the pre-fix plain-string format from before this
        // change shipped — JSON.parse throws on a bare unquoted string, so
        // an in-flight login from just before deploy safely falls through
        // to "no pending code" instead of crashing.
        saved = null;
    }

    // One-time-use either way — never let a second read (this customer
    // revisiting, or a different customer's session) find it again.
    localStorage.removeItem(PENDING_KEY);

    if (!saved || !saved.code || typeof saved.savedAt !== 'number') return null;
    if (Date.now() - saved.savedAt > PENDING_EXPIRY_MS) return null; // stale — treat as abandoned

    const url = new URL(window.location.href);
    url.searchParams.set('nbl-referral', saved.code);
    history.replaceState({}, '', url);
    return saved.code;
}

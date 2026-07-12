// =============================================================================
// modules/module-preact/hooks/referralCache.js
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
// scoped — it exists specifically for the pre-login moment, before any
// customer identity is known yet.
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
export function savePendingCode(code) {
    if (code) localStorage.setItem(PENDING_KEY, code);
}
export function restorePendingCode() {
    const urlCode = getURLCode();
    if (urlCode) return urlCode;
    const saved = localStorage.getItem(PENDING_KEY);
    if (!saved) return null;
    const url = new URL(window.location.href);
    url.searchParams.set('nbl-referral', saved);
    history.replaceState({}, '', url);
    localStorage.removeItem(PENDING_KEY);
    return saved;
}

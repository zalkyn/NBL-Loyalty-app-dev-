// =============================================================================
// modules/module-preact/hooks/referralCache.js
// localStorage cache + URL code detection — pure functions, purono
// referral-modal.js-er cache/URL logic-er extraction, framework-agnostic.
// =============================================================================

const CACHE_KEY = 'NBL_ReferralCache';
const PENDING_KEY = 'NBL_PendingReferral';

export function getCacheStore() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { return {}; }
}
export function setCacheStore(store) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
}
export function getCache(code) {
    const store = getCacheStore();
    const item = store[code];
    if (!item) return null;
    if (Date.now() > item.expiresAt) { delete store[code]; setCacheStore(store); return null; }
    return item.data;
}
export function setCache(code, data) {
    const duration = data.success ? 60000 : 30000;
    const store = getCacheStore();
    store[code] = { data, expiresAt: Date.now() + duration };
    setCacheStore(store);
}
export function hasUsedCode() {
    return Object.values(getCacheStore()).some(
        (entry) => entry.data && entry.data.success && entry.data.referralDiscountCode
    );
}
export function sweepExpiredCache() {
    const store = getCacheStore();
    const now = Date.now();
    Object.keys(store).forEach((key) => { if (now > store[key].expiresAt) delete store[key]; });
    setCacheStore(store);
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

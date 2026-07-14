// =============================================================================
// modules/utils.js
// Pure utility functions — no side effects, no DOM, no bus.
// =============================================================================

export function escapeAttribute(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function escapeText(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function formatNumber(n) {
    return Intl.NumberFormat().format(Number(n) || 0);
}

// Builds the shareable referral link: shopUrl + admin-configured linkPath
// (Customize > Referral > "Referral link page", cssVarsConfig.js's
// referral.linkPath) + the referral code query param. linkPath must be a
// relative path starting with "/" — anything else (empty, missing, or a
// stray full URL someone pasted in by mistake) falls back to the storefront
// homepage ("/") so the link never silently breaks.
export function buildReferralLink(shopUrl, linkPath, code) {
    const path = typeof linkPath === 'string' && linkPath.startsWith('/') ? linkPath : '/';
    const separator = path.indexOf('?') === -1 ? '?' : '&';
    return (shopUrl || '') + path + separator + 'nbl-referral=' + (code || '');
}

export function formatPoints(n) {
    n = Number(n) || 0;
    return formatNumber(n) + ' ' + (n === 1 ? 'point' : 'points');
}

export function formatDiscount(value, type, currencySymbol) {
    return type === 'percentage'
        ? formatNumber(value) + '% off'
        : (currencySymbol || '$') + formatNumber(value) + ' off';
}

export function formatDate(d) {
    return new Date(d).toLocaleDateString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

export function formatPointsDisplay(pts) {
    pts = Number(pts) || 0;
    if (pts > 0) return `<span class="nbl-points-positive">+${formatNumber(pts)}</span>`;
    if (pts < 0) return `<span class="nbl-points-negative">${formatNumber(pts)}</span>`;
    return `<span class="nbl-points-neutral">—</span>`;
}
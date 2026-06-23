// =============================================================================
// modules/builder.js
// Central, reusable DOM-builder for the whole widget.
//
// Pattern: custom tag names carry the styling (e.g. <nbl-list-item>,
// <nbl-badge status="pending">), state lives in attributes — no class-soup,
// no per-tab bespoke markup. Every tabs/*.js file constructs its panel
// content using the component builders below instead of writing its own
// markup shape.
//
// This file is markup-only: no event wiring, no bus access, no fetches.
// modules/click-router.js and tabs/*.js own all behavior and call into
// these builders to construct elements.
// =============================================================================

import { icon } from './icons.js';

// ── Generic element helpers ─────────────────────────────────────────────────

/**
 * Create an element with attributes and children.
 * `true` attrs are written as empty ("present") attributes — e.g.
 * el('nbl-load-more', { exhausted: true }) → <nbl-load-more exhausted></nbl-load-more>
 * `false` / null / undefined attrs are skipped entirely.
 */
export function el(tag, attrs, children) {
    attrs = attrs || {};
    children = children || [];
    var node = document.createElement(tag);
    Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === undefined || value === null || value === false) return;
        node.setAttribute(key, value === true ? '' : value);
    });
    children.forEach(function (child) {
        if (child === null || child === undefined) return;
        node.append(child);
    });
    return node;
}

/** Same as el(), but sets textContent (safe — never interpreted as markup). */
export function text(tag, content, attrs) {
    var node = el(tag, attrs);
    node.textContent = content == null ? '' : content;
    return node;
}

/** <nbl-icon type="svg" name="..."> with the registered SVG markup injected immediately — every icon is SVG, no emoji/png modes, no separate hydration pass needed. */
export function iconEl(name, attrs) {
    var node = el('nbl-icon', Object.assign({ type: 'svg', name: name }, attrs || {}));
    node.innerHTML = icon(name);
    return node;
}

/**
 * Re-injects SVG markup into any <nbl-icon> elements in a container that
 * are still empty — a safety net for icons built by raw el('nbl-icon', ...)
 * calls that bypassed iconEl(). Not required for anything built through
 * iconEl() itself, which is already self-sufficient.
 */
export function hydrateIcons(container) {
    (container || document).querySelectorAll('nbl-icon[type="svg"]').forEach(function (node) {
        var name = node.getAttribute('name');
        if (!node.innerHTML) node.innerHTML = icon(name);
    });
}

// ── Formatting helpers ───────────────────────────────────────────────────────

export function fmtPoints(value) {
    return (Number(value) || 0).toLocaleString();
}

export function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── List + list item ─────────────────────────────────────────────────────────

/**
 * Shared list-item builder, reused across Home / Earn / Rewards / Prizes /
 * My Rewards / My Prizes — every reward, prize, activity-rule, and claim
 * row in the app is built from this one function.
 *
 * @param {object} opts
 * @param {string} [opts.iconName] - registered icon name for the media slot (ignored if `image` given)
 * @param {string} [opts.image] - image URL for the media slot
 * @param {string} opts.title
 * @param {string} [opts.subtitle]
 * @param {Node} [opts.trailing] - badge / claim button / custom trailing node; overrides the default chevron
 * @param {boolean} [opts.arrow=true] - show the default chevron when there's no `trailing`
 * @param {object} [opts.data] - arbitrary data-* attributes merged onto the root element (e.g. { voucher: code })
 */
export function listItem(opts) {
    opts = opts || {};
    var media = opts.image
        ? el('nbl-list-item-media', { image: true, style: '--media-image:url("' + String(opts.image).replace(/"/g, '%22') + '")' })
        : el('nbl-list-item-media', {}, [iconEl(opts.iconName || 'reward-discount')]);

    var bodyChildren = [text('nbl-list-item-title', opts.title || '')];
    if (opts.subtitle) bodyChildren.push(text('nbl-list-item-subtitle', opts.subtitle));
    var body = el('nbl-list-item-body', {}, bodyChildren);

    var children = [media, body];
    if (opts.trailing) {
        children.push(opts.trailing);
    } else if (opts.arrow !== false) {
        children.push(el('nbl-chevron'));
    }

    var attrs = { arrow: opts.arrow === false ? 'false' : undefined, new: opts.isNew ? true : undefined };
    if (opts.data) {
        Object.keys(opts.data).forEach(function (key) {
            attrs['data-' + key] = opts.data[key];
        });
    }

    return el('nbl-list-item', attrs, children);
}

export function list(items) {
    return el('nbl-list', {}, items);
}

/** Placeholder shown in a list/table when there's nothing to display yet. */
export function emptyState(message) {
    return text('nbl-list-empty', message);
}

// ── Claim button (Rewards & Prizes tab action) ──────────────────────────────

export function claimButton(attrs, label) {
    return el('nbl-claim-button', attrs, [
        text('nbl-claim-button-label', label || 'Claim'),
        el('nbl-claim-button-spinner'),
    ]);
}

// ── Badge (status pill) ──────────────────────────────────────────────────────

export function badge(label, status, attrs) {
    return text('nbl-badge', label, Object.assign({ status: status }, attrs || {}));
}

/** Small muted trailing label shown instead of a claim button when an item isn't currently actionable. */
export function statusText(label) {
    return text('nbl-status-text', label);
}

// ── Section + section header + section box ──────────────────────────────────

/**
 * @param {object} opts
 * @param {string} [opts.icon] - registered icon name shown next to the title
 * @param {string} opts.title
 * @param {string} [opts.subtitle]
 * @param {boolean} [opts.plain] - non-uppercase variant used outside a section-box (e.g. Referral headings)
 */
export function sectionHeader(opts) {
    opts = opts || {};
    var row = el('nbl-section-header-row', {}, [
        opts.icon ? el('nbl-section-header-icon', {}, [iconEl(opts.icon)]) : null,
        opts.title ? text('nbl-section-header-title', opts.title) : null,
    ]);
    var children = [row];
    if (opts.subtitle) children.push(text('nbl-section-header-subtitle', opts.subtitle));
    return el('nbl-section-header', { plain: opts.plain ? true : undefined }, children);
}

export function section(children) {
    return el('nbl-section', {}, children);
}

/** Bordered callout box — Active Rewards / Prize Requests / Recent Activity on Home. */
export function sectionBox(children) {
    return el('nbl-section-box', {}, children);
}

// ── Action button (Home quick-action row) ───────────────────────────────────

export function actionButton(opts) {
    opts = opts || {};
    return el('nbl-action-button', { 'data-navigate': opts.navigate }, [
        iconEl(opts.iconName),
        document.createTextNode(opts.label || ''),
    ]);
}

// ── Load more (pagination UI shell — wiring + loaded/total state lives in pagination.js) ──

/**
 * Builds the static pagination/load-more shell. `key` matches the
 * data-pagination attribute pagination.js uses to find this element —
 * loaded/total/page state lives in pagination.js's JS state, not as
 * static attributes here (the label/status text gets filled in at
 * render time by pagination.js, same as the old engine).
 */
export function loadMore(key) {
    return el('nbl-load-more', { 'data-pagination': key }, [
        text('nbl-load-more-status', ''),
        el('nbl-load-more-button', {}, [
            text('nbl-load-more-button-label', 'Load More'),
            el('nbl-load-more-button-dots', {}, [el('span'), el('span'), el('span')]),
            el('nbl-load-more-button-spinner'),
        ]),
    ]);
}

// ── Table (Activity log) ─────────────────────────────────────────────────────

export function tableHead() {
    return el('nbl-table-head', {}, [
        text('nbl-table-cell', 'Date', { column: 'date' }),
        text('nbl-table-cell', 'Activity', { column: 'activity' }),
        text('nbl-table-cell', 'Points', { column: 'points' }),
    ]);
}

export function pointsDelta(points) {
    var n = Number(points) || 0;
    var isNegative = n < 0;
    return text('nbl-points-delta', (isNegative ? '' : '+') + n.toLocaleString(), {
        direction: isNegative ? 'negative' : 'positive',
        value: n,
    });
}

export function tableRow(transaction, isNew) {
    var points = Number(transaction.points) || 0;
    var activityLabel = transaction.activity || transaction.reason
        || (points < 0 ? (points + ' points redeemed') : ('+' + points + ' points earned'));

    return el('nbl-table-row', { new: isNew ? true : undefined }, [
        text('nbl-table-cell', fmtDate(transaction.createdAt), { column: 'date' }),
        text('nbl-table-cell', activityLabel, { column: 'activity' }),
        el('nbl-table-cell', { column: 'points' }, [pointsDelta(points)]),
    ]);
}

export function table(rows) {
    return el('nbl-table', {}, [tableHead()].concat(rows));
}

// ── Info card (Referral: YOU / FRIEND rows) ──────────────────────────────────

export function infoCard(opts) {
    opts = opts || {};
    return el('nbl-info-card', { role: opts.role }, [
        text('nbl-info-card-label', opts.label || ''),
        text('nbl-info-card-title', opts.title || ''),
        opts.description ? text('nbl-info-card-description', opts.description) : null,
    ]);
}

// ── Step list (Referral: How It Works) ───────────────────────────────────────

export function stepItem(number, title, description) {
    return el('nbl-step-item', {}, [
        text('nbl-step-item-number', number),
        el('nbl-step-item-body', {}, [
            text('nbl-step-item-title', title),
            text('nbl-step-item-description', description),
        ]),
    ]);
}

export function stepList(items) {
    return el('nbl-step-list', {}, items);
}

// ── Copy field (Referral link + copy button) ─────────────────────────────────

export function copyField(value, copyLabel) {
    return el('nbl-copy-field', {}, [
        text('nbl-copy-field-input', value || ''),
        text('nbl-copy-field-button', copyLabel || 'Copy', { 'data-value': value }),
    ]);
}

// ── Share row + share button ─────────────────────────────────────────────────

export function shareButton(platform, label) {
    return el('nbl-share-button', { platform: platform }, [
        iconEl(platform),
        document.createTextNode(label),
    ]);
}

export function shareRow(buttons) {
    return el('nbl-share-row', {}, buttons);
}

// ── Notification (modal) shell ───────────────────────────────────────────────

/**
 * Builds the single reusable notification shell, appended once at boot.
 * Hidden by default; the behavior layer (notifications.js) toggles
 * [hidden]/[variant] and fills in title/media/body contents per-open.
 */
export function buildNotificationShell() {
    return el('nbl-notification', { hidden: true }, [
        el('nbl-notification-overlay'),
        el('nbl-notification-content', {}, [
            el('nbl-notification-close', { 'aria-label': 'Close' }, [iconEl('close')]),
            el('nbl-notification-media', { hidden: true }, [
                el('nbl-notification-media-title'),
                text('nbl-badge', '', { hidden: true }),
            ]),
            el('nbl-notification-title'),
            el('nbl-notification-sub', { hidden: true }),
            el('nbl-notification-rows', { hidden: true }),
            el('nbl-notification-body'),
            el('nbl-notification-message', { hidden: true }),
            el('nbl-notification-note', { hidden: true }),
            el('nbl-notification-tracking', { hidden: true }),
            el('nbl-notification-error', { hidden: true }),
            el('nbl-notification-actions', {}, [
                claimButton({ hidden: true }),
                el('nbl-notification-contact', { hidden: true, target: '_blank', rel: 'noopener' }),
            ]),
        ]),
    ]);
}

/** Builds a single key/value detail row for the notification rows table. */
export function notificationRow(key, val) {
    return el('nbl-notification-row', {}, [
        text('nbl-notification-row-key', key),
        text('nbl-notification-row-val', val),
    ]);
}

// ── Toast (non-blocking, stackable) ─────────────────────────────────────────

export var TOAST_POSITIONS = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];

/** Builds all six toast docking regions — appended once at boot, stay empty until toasts are pushed. */
export function buildToastRegions() {
    return TOAST_POSITIONS.map(function (position) {
        return el('nbl-toast-region', { position: position });
    });
}

/** Builds a single toast element (not yet attached to a region — caller appends it). */
export function buildToast(opts) {
    opts = opts || {};
    var variant = opts.variant || 'info';

    var media = el('nbl-toast-media', { hidden: !opts.image });
    if (opts.image) media.style.setProperty('--media-image', 'url("' + String(opts.image).replace(/"/g, '%22') + '")');

    var iconNode = el('nbl-toast-icon', { hidden: !!opts.image }, opts.image ? [] : [iconEl(variant === 'success' ? 'reward-discount' : 'lightning')]);

    var titleEl = text('nbl-toast-title', opts.title || '');
    var messageEl = text('nbl-toast-message', opts.message || '');
    var closeBtn = el('nbl-toast-close', { 'aria-label': 'Dismiss' }, [iconEl('close')]);

    return el('nbl-toast', { variant: variant }, [media, iconNode, el('nbl-toast-body', {}, [titleEl, messageEl]), closeBtn]);
}

/** Builds the progress bar appended to a toast when it has a finite auto-dismiss duration. */
export function buildToastProgress(durationMs) {
    var node = el('nbl-toast-progress');
    node.style.setProperty('--toast-duration', durationMs + 'ms');
    return node;
}

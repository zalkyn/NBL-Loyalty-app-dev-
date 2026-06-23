// =============================================================================
// modules/pagination.js
// Reusable pagination engine — supports 'pagination' (prev/next + dots) and
// 'loadmore' modes, both built on the shared <nbl-load-more> shell.
// initPagination() attaches the engine onto loyaltyApp.pagination so all
// tab modules can call loyaltyApp.pagination.init() / .update() etc.
// =============================================================================

import { getStore } from './store.js';
import { getConfig, lbl } from './config.js';
import { el, text, iconEl } from './builder.js';

var instances = {};

// ── Private helpers ───────────────────────────────────────────────────────────

function getEl(key) {
    return document.querySelector('nbl-load-more[data-pagination="' + key + '"]');
}

function getMode() {
    var WIDGET_CONFIG = getConfig();
    return WIDGET_CONFIG.paginationMode === 'loadmore' ? 'loadmore' : 'pagination';
}

function setLoadingState(rootEl, loading) {
    var button = rootEl && rootEl.querySelector('nbl-load-more-button');
    if (!button) return;
    if (loading) button.setAttribute('loading', 'dots');
    else button.removeAttribute('loading');
}

function renderLoadMore(key) {
    var instance = instances[key]; if (!instance) return;
    var allItems = instance.items.slice(0, instance.loaded);
    var prevLoaded = instance.loaded - instance.perPage;
    instance.renderFn(allItems, prevLoaded);
}

function updateLoadMoreUI(key) {
    var instance = instances[key]; if (!instance) return;
    var rootEl = getEl(key); if (!rootEl) return;
    if (!rootEl.querySelector('nbl-load-more-button')) return;

    var total = instance.items.length;
    var loaded = Math.min(instance.loaded, total);
    var remaining = total - loaded;
    var allLoaded = loaded >= total;

    rootEl.toggleAttribute('exhausted', allLoaded);
    rootEl.toggleAttribute('single-page', total <= instance.perPage);

    var statusEl = rootEl.querySelector('nbl-load-more-status');
    if (statusEl) {
        statusEl.textContent = allLoaded
            ? (loaded + ' of ' + total + ' loaded')
            : (loaded + ' of ' + total + ' loaded \u2022 ' + remaining + ' remaining');
    }
}

function updatePaginationUI(key) {
    var instance = instances[key]; if (!instance) return;
    var rootEl = getEl(key); if (!rootEl) return;

    var prevBtn = rootEl.querySelector('nbl-pagination-arrow[direction="prev"]');
    var nextBtn = rootEl.querySelector('nbl-pagination-arrow[direction="next"]');
    var dotsRow = rootEl.querySelector('nbl-pagination-dots');
    var infoEl = rootEl.querySelector('nbl-pagination-info');

    if (prevBtn) prevBtn.toggleAttribute('disabled', instance.page <= 1);
    if (nextBtn) nextBtn.toggleAttribute('disabled', instance.page >= instance.totalPages);

    var total = instance.items.length;
    if (infoEl) {
        var rangeStart = (instance.page - 1) * instance.perPage + 1;
        var rangeEnd = Math.min(instance.page * instance.perPage, total);
        infoEl.textContent = total ? ('Showing ' + rangeStart + '\u2013' + rangeEnd + ' of ' + total) : '';
    }

    if (dotsRow) {
        dotsRow.innerHTML = '';
        if (instance.totalPages > 1) {
            var maxDots = 5;
            var start = Math.max(1, Math.min(instance.page - 2, instance.totalPages - maxDots + 1));
            var end = Math.min(instance.totalPages, start + maxDots - 1);
            for (var i = start; i <= end; i++) {
                var dot = el('nbl-pagination-dot', { active: i === instance.page ? true : undefined, 'data-page': i });
                dot.addEventListener('click', function () {
                    instance.page = parseInt(this.getAttribute('data-page'), 10);
                    render(key);
                });
                dotsRow.append(dot);
            }
        }
    }

    rootEl.toggleAttribute('single-page', instance.totalPages <= 1);
}

function render(key) {
    var instance = instances[key]; if (!instance) return;
    var mode = instance.forceMode || getMode();
    if (mode === 'loadmore') {
        renderLoadMore(key);
        updateLoadMoreUI(key);
    } else {
        var start = (instance.page - 1) * instance.perPage;
        instance.renderFn(instance.items.slice(start, start + instance.perPage));
        updatePaginationUI(key);
    }
}

// ── Shell builders ───────────────────────────────────────────────────────────

function buildLoadMoreInner(rootEl) {
    rootEl.innerHTML = '';
    rootEl.removeAttribute('mode');
    rootEl.append(
        text('nbl-load-more-status', ''),
        el('nbl-load-more-button', {}, [
            text('nbl-load-more-button-label', lbl('loadMoreBtn') || 'Load More'),
            el('nbl-load-more-button-dots', {}, [el('span'), el('span'), el('span')]),
            el('nbl-load-more-button-spinner'),
        ])
    );
}

function buildPaginationInner(rootEl) {
    rootEl.innerHTML = '';
    rootEl.setAttribute('mode', 'pagination');
    rootEl.append(
        el('nbl-pagination-arrow', { direction: 'prev', disabled: true, 'aria-label': 'Previous page' }, [iconEl('chevron-left')]),
        el('nbl-pagination-info'),
        el('nbl-pagination-dots'),
        el('nbl-pagination-arrow', { direction: 'next', disabled: true, 'aria-label': 'Next page' }, [iconEl('chevron-right')])
    );
}

function buildUI(key) {
    var rootEl = getEl(key); if (!rootEl) return;

    // Always read mode from live config — a boot-time snapshot would go
    // stale if the merchant changes paginationMode in the dashboard.
    // forceMode (set by initLoadMore) is the only legitimate override.
    var mode = (instances[key] && instances[key].forceMode) || getMode();

    // If already bound with same mode — nothing to do.
    if (rootEl.dataset.pgBound && rootEl.dataset.pgBoundMode === mode) return;

    // Mode changed (or first bind) — rebuild children to match the new
    // mode, then re-bind event listeners. innerHTML replacement means
    // stale listeners on old nodes are garbage-collected automatically.
    if (mode === 'loadmore') buildLoadMoreInner(rootEl);
    else buildPaginationInner(rootEl);

    rootEl.dataset.pgBound = '1';
    rootEl.dataset.pgBoundMode = mode;

    if (mode === 'loadmore') {
        rootEl.querySelector('nbl-load-more-button').addEventListener('click', function () {
            var instance = instances[key]; if (!instance) return;
            if (instance.loaded >= instance.items.length) return;
            setLoadingState(rootEl, true);
            setTimeout(function () {
                instance.loaded = Math.min(instance.loaded + instance.perPage, instance.items.length);
                renderLoadMore(key);
                setLoadingState(rootEl, false);
                updateLoadMoreUI(key);
            }, 520);
        });
    } else {
        rootEl.querySelector('nbl-pagination-arrow[direction="prev"]').addEventListener('click', function () {
            var instance = instances[key]; if (!instance || instance.page <= 1) return;
            instance.page--; render(key);
        });
        rootEl.querySelector('nbl-pagination-arrow[direction="next"]').addEventListener('click', function () {
            var instance = instances[key]; if (!instance || instance.page >= instance.totalPages) return;
            instance.page++; render(key);
        });
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function init(key, items, perPage, renderFn) {
    perPage = perPage || 5;
    var totalPages = Math.max(1, Math.ceil(items.length / perPage));
    instances[key] = {
        items: items,
        perPage: perPage,
        page: 1,
        totalPages: totalPages,
        renderFn: renderFn,
        loaded: perPage,
    };
    buildUI(key);
    render(key);
}

export function update(key, items) {
    var instance = instances[key]; if (!instance) return;
    instance.items = items;
    instance.totalPages = Math.max(1, Math.ceil(items.length / instance.perPage));
    instance.page = Math.min(instance.page, instance.totalPages);
    instance.loaded = instance.perPage;
    render(key);
}

export function initLoadMore(key, items, perPage, renderFn) {
    perPage = perPage || 5;
    instances[key] = {
        items: items,
        perPage: perPage,
        page: 1,
        totalPages: Math.max(1, Math.ceil(items.length / perPage)),
        renderFn: renderFn,
        loaded: perPage,
        forceMode: 'loadmore',
    };
    buildUI(key);
    renderLoadMore(key);
    updateLoadMoreUI(key);
}

export function updateLoadMore(key, items) {
    var instance = instances[key]; if (!instance) return;
    instance.items = items;
    instance.totalPages = Math.max(1, Math.ceil(items.length / instance.perPage));
    instance.loaded = instance.perPage;
    renderLoadMore(key);
    updateLoadMoreUI(key);
}

/**
 * Attaches the pagination engine onto loyaltyApp.pagination.
 * Call once at boot after initStore().
 */
export function initPagination() {
    var { loyaltyApp } = getStore();
    loyaltyApp.pagination = {
        init: init,
        update: update,
        initLoadMore: initLoadMore,
        updateLoadMore: updateLoadMore,
    };
}

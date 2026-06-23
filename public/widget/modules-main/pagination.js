// =============================================================================
// modules/pagination.js
// Reusable pagination engine — supports 'pagination' and 'loadmore' modes.
// initPagination() attaches the engine onto loyaltyApp.pagination so all
// tab modules can call loyaltyApp.pagination.init() / .update() etc.
// =============================================================================

import { getStore } from './store.js';
import { getConfig, lbl } from './config.js';

var instances = {};

// ── Private helpers ───────────────────────────────────────────────────────────

function getEl(key) {
    return document.querySelector('.nbl-pagination-v1[data-pagination="' + key + '"]');
}

function getMode() {
    var WIDGET_CONFIG = getConfig();
    return WIDGET_CONFIG.paginationMode === 'loadmore' ? 'loadmore' : 'pagination';
}

function setLoadingState(el, loading) {
    var loadMoreButton = el && el.querySelector('.nbl-loadmore-btn-v1');
    if (!loadMoreButton) return;
    loadMoreButton.classList.toggle('nbl-loadmore-loading-v1', loading);
    loadMoreButton.disabled = loading;
}

function renderLoadMore(key) {
    var paginationInstance = instances[key]; if (!paginationInstance) return;
    var allItems = paginationInstance.items.slice(0, paginationInstance.loaded);
    var prevLoaded = paginationInstance.loaded - paginationInstance.perPage;
    paginationInstance.renderFn(allItems, prevLoaded);
}

function updateLoadMoreUI(key) {
    var paginationInstance = instances[key]; if (!paginationInstance) return;
    var el = getEl(key); if (!el) return;
    var loadMoreButton = el.querySelector('.nbl-loadmore-btn-v1');
    if (!loadMoreButton) return;
    var total = paginationInstance.items.length;
    var loaded = Math.min(paginationInstance.loaded, total);
    var remaining = total - loaded;
    var allLoaded = loaded >= total;
    loadMoreButton.classList.toggle('nbl-loadmore-done-state-v1', allLoaded);
    el.style.display = total <= paginationInstance.perPage ? 'none' : 'flex';

    // Info text: "10 of 20 loaded • 10 remaining" / "20 of 20 loaded"
    var infoEl = el.querySelector('.nbl-pagination-info-v1');
    if (infoEl) {
        infoEl.textContent = allLoaded
            ? loaded + ' of ' + total + ' loaded'
            : loaded + ' of ' + total + ' loaded • ' + remaining + ' remaining';
    }
}

function updatePaginationUI(key) {
    var paginationInstance = instances[key]; if (!paginationInstance) return;
    var el = getEl(key); if (!el) return;
    var prev = el.querySelector('.nbl-pagination-prev-v1');
    var next = el.querySelector('.nbl-pagination-next-v1');
    var dotsRow = el.querySelector('.nbl-pagination-dots-row-v1');

    if (prev) prev.disabled = paginationInstance.page <= 1;
    if (next) next.disabled = paginationInstance.page >= paginationInstance.totalPages;

    // Info text: "Showing 1–5 of 20"
    var infoEl = el.querySelector('.nbl-pagination-info-v1');
    if (infoEl) {
        var total = paginationInstance.items.length;
        var rangeStart = (paginationInstance.page - 1) * paginationInstance.perPage + 1;
        var rangeEnd = Math.min(paginationInstance.page * paginationInstance.perPage, total);
        infoEl.textContent = 'Showing ' + rangeStart + '–' + rangeEnd + ' of ' + total;
    }

    if (dotsRow) {
        if (paginationInstance.totalPages <= 1) {
            dotsRow.innerHTML = '';
        } else {
            var dotMarkup = '';
            var maxDots = 5;
            var start = Math.max(1, Math.min(paginationInstance.page - 2, paginationInstance.totalPages - maxDots + 1));
            var end = Math.min(paginationInstance.totalPages, start + maxDots - 1);
            for (var i = start; i <= end; i++) {
                dotMarkup += '<span class="nbl-pg-dot-v1' + (i === paginationInstance.page ? ' active' : '') + '" data-page="' + i + '"></span>';
            }
            dotsRow.innerHTML = dotMarkup;
            dotsRow.querySelectorAll('.nbl-pg-dot-v1').forEach(function (dot) {
                dot.addEventListener('click', function () {
                    paginationInstance.page = parseInt(dot.dataset.page);
                    render(key);
                });
            });
        }
    }

    el.style.display = paginationInstance.totalPages <= 1 ? 'none' : 'flex';
}

function render(key) {
    var paginationInstance = instances[key]; if (!paginationInstance) return;
    var mode = paginationInstance.forceMode || getMode();
    if (mode === 'loadmore') {
        renderLoadMore(key);
        updateLoadMoreUI(key);
    } else {
        var start = (paginationInstance.page - 1) * paginationInstance.perPage;
        paginationInstance.renderFn(paginationInstance.items.slice(start, start + paginationInstance.perPage));
        updatePaginationUI(key);
    }
}

function buildUI(key) {
    var el = getEl(key); if (!el) return;

    // Always read mode from live config — el.dataset.pgMode is the boot-time
    // snapshot and becomes stale if the merchant changes paginationMode in the
    // dashboard. forceMode (set by initLoadMore) is the only legitimate override.
    var mode = (instances[key] && instances[key].forceMode) || getMode();

    // If already bound with same mode — nothing to do
    if (el.dataset.pgBound && el.dataset.pgBoundMode === mode) return;

    // Mode changed (or first bind) — rebuild inner HTML to match new mode,
    // then re-bind event listeners. We replace innerHTML so stale listeners
    // attached to old nodes are garbage-collected automatically.
    var loadmoreInner = `
        <div class="nbl-pagination-info-v1"></div>
        <button class="nbl-loadmore-btn-v1">
            <span class="nbl-loadmore-text-v1">${lbl('loadMoreBtn')}</span>
            <span class="nbl-loadmore-dots-v1"><span></span><span></span><span></span></span>
            <span class="nbl-loadmore-done-v1">\u2713 ${lbl('loadMoreDone')}</span>
        </button>`;

    var paginationInner = `
        <button class="nbl-pagination-btn-v1 nbl-pagination-prev-v1" disabled>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="nbl-pagination-info-v1"></div>
        <div class="nbl-pagination-dots-row-v1"></div>
        <button class="nbl-pagination-btn-v1 nbl-pagination-next-v1" disabled>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>`;

    el.innerHTML = mode === 'loadmore' ? loadmoreInner : paginationInner;
    el.dataset.pgMode = mode;
    el.dataset.pgBound = '1';
    el.dataset.pgBoundMode = mode;

    if (mode === 'loadmore') {
        el.querySelector('.nbl-loadmore-btn-v1').addEventListener('click', function () {
            var paginationInstance = instances[key]; if (!paginationInstance) return;
            if (paginationInstance.loaded >= paginationInstance.items.length) return;
            setLoadingState(el, true);
            setTimeout(function () {
                paginationInstance.loaded = Math.min(paginationInstance.loaded + paginationInstance.perPage, paginationInstance.items.length);
                renderLoadMore(key);
                setLoadingState(el, false);
                updateLoadMoreUI(key);
            }, 520);
        });
    } else {
        el.querySelector('.nbl-pagination-prev-v1').addEventListener('click', function () {
            var paginationInstance = instances[key]; if (!paginationInstance || paginationInstance.page <= 1) return;
            paginationInstance.page--; render(key);
        });
        el.querySelector('.nbl-pagination-next-v1').addEventListener('click', function () {
            var paginationInstance = instances[key]; if (!paginationInstance || paginationInstance.page >= paginationInstance.totalPages) return;
            paginationInstance.page++; render(key);
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
    var paginationInstance = instances[key]; if (!paginationInstance) return;
    paginationInstance.items = items;
    paginationInstance.totalPages = Math.max(1, Math.ceil(items.length / paginationInstance.perPage));
    paginationInstance.page = Math.min(paginationInstance.page, paginationInstance.totalPages);
    paginationInstance.loaded = paginationInstance.perPage;
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
    var paginationInstance = instances[key]; if (!paginationInstance) return;
    paginationInstance.items = items;
    paginationInstance.totalPages = Math.max(1, Math.ceil(items.length / paginationInstance.perPage));
    paginationInstance.loaded = paginationInstance.perPage;
    renderLoadMore(key);
    updateLoadMoreUI(key);
}

/**
 * Attaches the pagination engine onto loyaltyApp.pagination.
 * Call once at boot after initStore().
 *
 * ui.v3.js reference:
 *   loyaltyApp.pagination = (function() { ... })();  (Section 12b)
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
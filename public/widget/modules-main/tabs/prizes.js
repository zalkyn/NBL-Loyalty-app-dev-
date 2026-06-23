// =============================================================================
// modules/tabs/prizes.js
// Prizes tab, My Prizes tab, Home prize requests, shared prize claim builder.
// Covers ui.v3.js Section 10b.
// Call initPrizesTab() once at boot after initWidget().
// =============================================================================

import { getStore } from '../store.js';
import { getConfig, lbl, getPoints } from '../config.js';
import { icon } from '../icons.js';
import { escapeText, escapeAttribute, formatNumber } from '../utils.js';

export function initPrizesTab() {
    var { loyaltyApp, appConfig } = getStore();
    var eventBus = loyaltyApp.bus;

    loyaltyApp.tab = loyaltyApp.tab || {};

    // ── Shared prize claim item builder ───────────────────────────────────────

    function buildPrizeClaimItemHTML(claim, extraClass) {
        var WIDGET_CONFIG = getConfig();
        var prize = (appConfig.physicalPrizes || []).find(function (p) { return Number(p.id) === Number(claim.physicalPrizeId); });
        var title = prize ? prize.title : `Prize request #${claim.id}`;
        var imageHTML = prize && prize.imageUrl
            ? `<img class="nbl-prize-req-img-v1" src="${escapeAttribute(prize.imageUrl)}" alt="${escapeAttribute(title)}" />`
            : `<div class="nbl-prize-req-img-placeholder-v1">${icon('reward-discount')}</div>`;
        var pointsHTML = claim.pointsCost
            ? `<span class="nbl-prize-req-points-v1">${formatNumber(claim.pointsCost)} pts</span>`
            : '';
        var statusLabels = {
            PENDING: lbl('prizeStatusPending'),
            FULFILLED: lbl('prizeStatusFulfilled'),
            COMPLETED: lbl('prizeStatusCompleted'),
            CANCELLED: lbl('prizeStatusCancelled'),
        };
        var status = statusLabels[claim.status] || claim.status;
        var statusKey = (claim.status || 'pending').toLowerCase();

        return `<div class="${extraClass} nbl-my-prize-item-v1 nbl-clickable-v1"
                data-prize-claim-id="${claim.id}"
                data-prize-title="${escapeAttribute(title)}"
                data-prize-status="${claim.status || 'PENDING'}"
                data-prize-cost="${claim.pointsCost || 0}"
                data-prize-value="${prize && prize.productValue ? prize.productValue : ''}"
                data-prize-created="${escapeAttribute(claim.createdAt || '')}"
                data-prize-fulfilled="${escapeAttribute(claim.fulfilledAt || '')}"
                data-prize-completed="${escapeAttribute(claim.completedAt || '')}"
                data-prize-admin-note="${escapeAttribute(claim.adminNote || '')}"
                data-prize-tracking="${escapeAttribute(claim.trackingInfo || '')}">
                <div class="nbl-prize-req-img-wrap-v1">${imageHTML}</div>
                <div class="nbl-prize-req-info-v1">
                    <span class="nbl-prize-request-title-v1">${escapeText(title)}</span>
                    ${pointsHTML}
                </div>
                <span class="nbl-prize-request-status-v1 nbl-prize-status-${statusKey}-v1">${status}</span>
            </div>`;
    }

    // ── Prizes tab ────────────────────────────────────────────────────────────

    loyaltyApp.tab.renderPrizeList = function () {
        var wrapper = document.querySelector('.nbl-prize-list-v1');
        if (!wrapper) return;

        var customerPoints = getPoints();
        var prizes = (appConfig.physicalPrizes || []).filter(function (p) { return p.isActive; });

        if (!prizes.length) {
            wrapper.innerHTML = '<div class="nbl-hta-rewards-empty-v1">' + lbl('emptyPrizes') + '</div>';
            return;
        }

        wrapper.innerHTML = prizes.map(function (prize) {
            var cost = Number(prize.pointsCost) || 0;
            var canClaim = cost > 0 && customerPoints >= cost;
            var imageHTML = prize.imageUrl
                ? '<img class="nbl-prize-img-v1" src="' + escapeAttribute(prize.imageUrl) + '" alt="' + escapeAttribute(prize.title) + '" />'
                : '<div class="nbl-prize-img-placeholder-v1">' + icon('reward-discount') + '</div>';

            return '<div class="nbl-prize-item-v1 ' + (canClaim ? 'active' : 'inactive') + '"'
                + ' data-prize-id="' + prize.id + '"'
                + ' data-title="' + escapeAttribute(prize.title) + '"'
                + ' data-cost="' + cost + '">'
                + '<div class="nbl-prize-img-wrap-v1">' + imageHTML + '</div>'
                + '<div class="nbl-reward-content-v1">'
                + '<div class="nbl-reward-title-v1">' + escapeText(prize.title) + '</div>'
                + '<div class="nbl-reward-points-v1">' + formatNumber(cost) + ' pts</div>'
                + '</div>'
                + '<div class="nbl-prize-action-v1">'
                + (canClaim
                    ? '<div class="nbl-reward-chevron-icon">' + icon('chevron-right') + '</div>'
                    : '<span class="nbl-reward-status-text nbl-prize-status-insufficient-v1">Not enough pts</span>')
                + '</div>'
                + '</div>';
        }).join('');
    };

    eventBus.once('tab:activated:prizes', function () {
        loyaltyApp.tab.renderPrizeList();
        eventBus.emitSticky('tab:visited:prizes', true);
    });

    eventBus.on('tab:visited:prizes', function () {
        eventBus.on('points:update', function () {
            loyaltyApp.tab.renderPrizeList();
        });
    });

    // ── Prizes tab active prizes (mirrors Home prize requests, own pagination key) ──

    loyaltyApp.tab.renderPrizesTabActivePrizeList = function () {
        var WIDGET_CONFIG = getConfig();
        var listEl = document.querySelector('.nbl-prizes-tab-active-prizes-list-v1');
        if (!listEl) return;
        var claims = loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.prizeClaims;
        if (!claims || !claims.length) {
            listEl.innerHTML = `<div class="nbl-hta-rewards-empty-v1">${lbl('emptyMyPrizes')}</div>`;
            return;
        }
        function renderPage(items) {
            listEl.innerHTML = items.map(function (claim) {
                return buildPrizeClaimItemHTML(claim, 'nbl-prize-request-item-v1');
            }).join('');
        }
        loyaltyApp.pagination.init('prizes-tab-active-prizes', claims, WIDGET_CONFIG.homePrizeRequestsPerPage || 5, renderPage);
    };

    /**
     * @listens tab:visited:prizes (sticky)
     * Initial render of the Active Prizes list inside the Prizes tab.
     */
    eventBus.on('tab:visited:prizes', function () {
        loyaltyApp.tab.renderPrizesTabActivePrizeList();
    });

    // ── Home prize requests ───────────────────────────────────────────────────

    loyaltyApp.tab.renderHomePrizeRequests = function () {
        var WIDGET_CONFIG = getConfig();
        var listEl = document.querySelector('.nbl-prize-requests-list-v1');
        if (!listEl) return;
        var claims = loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.prizeClaims;
        if (!claims || !claims.length) {
            listEl.innerHTML = `<div class="nbl-hta-rewards-empty-v1">${lbl('emptyMyPrizes')}</div>`;
            return;
        }
        function renderPage(items) {
            listEl.innerHTML = items.map(function (claim) {
                return buildPrizeClaimItemHTML(claim, 'nbl-prize-request-item-v1');
            }).join('');
        }
        loyaltyApp.pagination.init('home-prize-requests', claims, WIDGET_CONFIG.homePrizeRequestsPerPage || 5, renderPage);
    };

    // ── My Prizes tab ─────────────────────────────────────────────────────────

    loyaltyApp.tab.renderMyPrizesTab = function () {
        var WIDGET_CONFIG = getConfig();
        var wrapper = document.querySelector('.nbl-my-prizes-wrapper-v1');
        if (!wrapper) return;
        var claims = loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.prizeClaims;
        if (!claims || !claims.length) {
            wrapper.innerHTML = `<div class="nbl-hta-rewards-empty-v1">${lbl('emptyMyPrizes')}</div>`;
            return;
        }
        function renderPage(items) {
            wrapper.innerHTML = items.map(function (claim) {
                return buildPrizeClaimItemHTML(claim, '');
            }).join('');
        }
        loyaltyApp.pagination.init('my-prizes', claims, WIDGET_CONFIG.myPrizesPerPage || 8, renderPage);
    };

    eventBus.once('tab:activated:my-prizes', function () {
        loyaltyApp.tab.renderMyPrizesTab();
        eventBus.emitSticky('tab:visited:my-prizes', true);
    });
}
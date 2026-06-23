// =============================================================================
// modules/tabs/prizes.js
// Prizes tab, My Prizes tab, Home prize-requests preview, Prizes-tab active
// prizes section, shared prize-claim list-item builder.
// Call initPrizesTab() once at boot after initWidget().
// =============================================================================

import { getStore } from '../store.js';
import { getConfig, lbl, getPoints } from '../config.js';
import { listItem, claimButton, statusText, badge, emptyState } from '../builder.js';
import { formatNumber } from '../utils.js';

var STATUS_LABEL_KEYS = {
    PENDING: 'prizeStatusPending',
    FULFILLED: 'prizeStatusFulfilled',
    COMPLETED: 'prizeStatusCompleted',
    CANCELLED: 'prizeStatusCancelled',
};

export function initPrizesTab() {
    var { loyaltyApp, appConfig } = getStore();
    var eventBus = loyaltyApp.bus;

    loyaltyApp.tab = loyaltyApp.tab || {};

    // ── Shared prize-claim list-item builder ────────────────────────────────
    // Used by: Home "Prize Requests" preview, Prizes-tab "Active Prizes"
    // section, and the My Prizes tab — same row shape everywhere.

    function buildPrizeClaimItem(claim) {
        var prize = (appConfig.physicalPrizes || []).find(function (p) { return Number(p.id) === Number(claim.physicalPrizeId); });
        var title = prize ? prize.title : ('Prize request #' + claim.id);
        var status = claim.status || 'PENDING';
        var statusLabel = lbl(STATUS_LABEL_KEYS[status]) || status;

        return listItem({
            image: prize && prize.imageUrl,
            iconName: 'reward-discount',
            title: title,
            subtitle: claim.pointsCost ? (formatNumber(claim.pointsCost) + ' pts') : '',
            trailing: badge(statusLabel, status.toLowerCase()),
            data: {
                'prize-claim-id': claim.id,
                'prize-title': title,
                'prize-status': status,
                'prize-cost': claim.pointsCost || 0,
                'prize-value': (prize && prize.productValue) || '',
                'prize-img-url': (prize && prize.imageUrl) || '',
                'prize-created': claim.createdAt || '',
                'prize-fulfilled': claim.fulfilledAt || '',
                'prize-completed': claim.completedAt || '',
                'prize-admin-note': claim.adminNote || '',
                'prize-tracking': claim.trackingInfo || '',
            },
        });
    }

    // ── Prizes tab: claimable physical prizes ───────────────────────────────

    loyaltyApp.tab.renderPrizeList = function () {
        var listEl = document.querySelector('nbl-list[data-list="prizes"]');
        if (!listEl) return;

        var customerPoints = getPoints();
        var prizes = (appConfig.physicalPrizes || []).filter(function (p) { return p.isActive; });

        listEl.innerHTML = '';
        if (!prizes.length) { listEl.append(emptyState(lbl('emptyPrizes') || 'No prizes available')); return; }

        prizes.forEach(function (prize) {
            var cost = Number(prize.pointsCost) || 0;
            var canClaim = cost > 0 && customerPoints >= cost;

            listEl.append(listItem({
                image: prize.imageUrl,
                iconName: 'reward-discount',
                title: prize.title,
                subtitle: formatNumber(cost) + ' pts',
                trailing: canClaim ? claimButton({}, 'View Details') : statusText('Not enough pts'),
                data: { 'prize-id': prize.id, title: prize.title, cost: cost },
            }));
        });
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

    // ── Prizes tab: Active Prizes section (mirrors Home, own pagination key) ──

    loyaltyApp.tab.renderPrizesTabActivePrizeList = function () {
        var WIDGET_CONFIG = getConfig();
        var listEl = document.querySelector('nbl-list[data-list="prizes-tab-active-prizes"]');
        if (!listEl) return;
        var claims = loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.prizeClaims;
        if (!claims || !claims.length) {
            listEl.innerHTML = '';
            listEl.append(emptyState(lbl('emptyMyPrizes') || 'You have no prize requests yet'));
            return;
        }
        function renderPage(items) {
            listEl.innerHTML = '';
            items.forEach(function (claim) { listEl.append(buildPrizeClaimItem(claim)); });
        }
        loyaltyApp.pagination.init('prizes-tab-active-prizes', claims, WIDGET_CONFIG.homePrizeRequestsPerPage || 5, renderPage);
    };

    /**
     * @listens tab:visited:prizes (sticky)
     * Initial render of the Active Prizes section inside the Prizes tab.
     */
    eventBus.on('tab:visited:prizes', function () {
        loyaltyApp.tab.renderPrizesTabActivePrizeList();
    });

    // ── Home: Prize Requests preview ─────────────────────────────────────────

    loyaltyApp.tab.renderHomePrizeRequests = function () {
        var WIDGET_CONFIG = getConfig();
        var listEl = document.querySelector('nbl-list[data-list="home-prize-requests"]');
        if (!listEl) return;
        var claims = loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.prizeClaims;
        if (!claims || !claims.length) {
            listEl.innerHTML = '';
            listEl.append(emptyState(lbl('emptyMyPrizes') || 'You have no prize requests yet'));
            return;
        }
        function renderPage(items) {
            listEl.innerHTML = '';
            items.forEach(function (claim) { listEl.append(buildPrizeClaimItem(claim)); });
        }
        loyaltyApp.pagination.init('home-prize-requests', claims, WIDGET_CONFIG.homePrizeRequestsPerPage || 5, renderPage);
    };

    // ── My Prizes tab ─────────────────────────────────────────────────────────

    loyaltyApp.tab.renderMyPrizesTab = function () {
        var WIDGET_CONFIG = getConfig();
        var listEl = document.querySelector('nbl-list[data-list="my-prizes"]');
        if (!listEl) return;
        var claims = loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.prizeClaims;
        if (!claims || !claims.length) {
            listEl.innerHTML = '';
            listEl.append(emptyState(lbl('emptyMyPrizes') || 'You have no prize requests yet'));
            return;
        }
        function renderPage(items) {
            listEl.innerHTML = '';
            items.forEach(function (claim) { listEl.append(buildPrizeClaimItem(claim)); });
        }
        loyaltyApp.pagination.init('my-prizes', claims, WIDGET_CONFIG.myPrizesPerPage || 8, renderPage);
    };

    eventBus.once('tab:activated:my-prizes', function () {
        loyaltyApp.tab.renderMyPrizesTab();
        eventBus.emitSticky('tab:visited:my-prizes', true);
    });
}

// =============================================================================
// modules/tabs/home.js
// Home tab renders — active rewards, activities, prize requests.
// Also wires the tab:activated dispatcher and reward:add / activity:add events.
// Covers ui.v3.js Sections 11, 12, 12c (home parts).
// Call initHomeTab() once at boot after initWidget().
// =============================================================================

import { getStore } from '../store.js';
import { getConfig, lbl, getPoints } from '../config.js';
import { icon } from '../icons.js';
import { escapeText, escapeAttribute, formatDate, formatPointsDisplay } from '../utils.js';

export function initHomeTab() {
    var { loyaltyApp, appConfig } = getStore();
    var eventBus = loyaltyApp.bus;

    loyaltyApp.tab = loyaltyApp.tab || {};

    // ── tab:activated dispatcher ──────────────────────────────────────────────

    eventBus.on('tab:activated', function (data) {
        if (!data || !data.tab) return;
        eventBus.emit('tab:activated:' + data.tab, data);
    });

    // ── SECTION 11: HOME ACTIVE REWARDS ──────────────────────────────────────

    loyaltyApp.tab.renderHomeActiveRewardList = function (latestVoucher) {
        var WIDGET_CONFIG = getConfig();
        if (!WIDGET_CONFIG.showHomeRewardsSection) return;
        var listEl = document.querySelector('.nbl-hta-reward-list-v1');
        if (!listEl) return;

        if (loyaltyApp.customer && !loyaltyApp.customer.config) loyaltyApp.customer.config = {};
        if (loyaltyApp.customer && !loyaltyApp.customer.config.rewards) loyaltyApp.customer.config.rewards = [];

        var customerRewards = (loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.rewards) || [];
        var active = customerRewards.filter(function (r) { return r.discountUsed === false && r.status === 'ACTIVE'; });

        if (latestVoucher && latestVoucher.code) {
            var codes = {};
            active.forEach(function (r) { codes[r.code] = true; });
            if (!codes[latestVoucher.code]) {
                var newReward = { code: latestVoucher.code, title: latestVoucher.title || 'Voucher', status: 'ACTIVE', discountUsed: false, createdAt: new Date().toISOString() };
                if (loyaltyApp.customer && loyaltyApp.customer.config) loyaltyApp.customer.config.rewards.push(newReward);
                active.push(newReward);
            }
        }

        function renderPage(items) {
            if (!items.length) { listEl.innerHTML = '<div class="nbl-hta-rewards-empty-v1">' + lbl('emptyRewards') + '</div>'; return; }
            listEl.innerHTML = items.map(function (r) {
                return '<div class="nbl-hta-reward-item-v1" data-voucher="' + escapeAttribute(r.code) + '">' +
                    '<div class="nbl-hta-reward-icon-v1">' + icon('reward-discount') + '</div>' +
                    '<div class="nbl-hta-reward-content-v1"><div class="nbl-hta-reward-title-v1">' + escapeText(r.title || 'Voucher') + '</div></div>' +
                    '<div class="nbl-hta-reward-action-v1"><div class="nbl-hta-reward-chevron-icon">' + icon('chevron-right') + '</div></div>' +
                    '</div>';
            }).join('');
        }

        if (!active.length) { renderPage([]); return; }
        if (latestVoucher) {
            loyaltyApp.pagination.update('home-rewards', active);
        } else {
            loyaltyApp.pagination.init('home-rewards', active, WIDGET_CONFIG.homeRewardsPerPage, renderPage);
        }
    };

    /**
     * @listens widget:first-open
     * Initial render of Active Rewards on the Home tab.
     */
    eventBus.on('widget:first-open', function () { loyaltyApp.tab.renderHomeActiveRewardList(); });
    eventBus.on('widget:first-open', function () { loyaltyApp.tab.renderHomePrizeRequests(); });

    // ── SECTION 12: HOME ACCOUNT ACTIVITIES ──────────────────────────────────

    loyaltyApp.tab.renderHomeAccountTransactionActivities = function () {
        var WIDGET_CONFIG = getConfig();
        if (!WIDGET_CONFIG.showHomeActivitiesSection) return;
        var listWrapper = document.querySelector('.nbl-haTa-list-wrapper-v1');
        if (!listWrapper) return;
        var transactions = (loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.transactions) || [];
        function renderPage(items, prevLoaded) {
            if (!items.length) { listWrapper.innerHTML = '<div class="nbl-haTa-list-empty-v1">' + lbl('emptyActivity') + '</div>'; return; }
            prevLoaded = prevLoaded || 0;
            listWrapper.innerHTML = items.map(function (t, i) {
                var isNew = i >= prevLoaded;
                return '<div class="nbl-haTa-list-v1' + (isNew ? ' nbl-item-new-v1' : '') + '">' +
                    '<div class="nbl-haTa-list-item-v1">' + formatDate(t.createdAt) + '</div>' +
                    '<div class="nbl-haTa-list-item-v1">' + escapeText(t.activity || t.reason || '—') + '</div>' +
                    '<div class="nbl-haTa-list-item-v1">' + formatPointsDisplay(t.points) + '</div>' +
                    '</div>';
            }).join('');
        }
        if (!transactions.length) { renderPage([]); return; }
        loyaltyApp.pagination.init('home-activities', transactions, WIDGET_CONFIG.homeActivitiesPerPage, renderPage);
    };

    /**
     * @listens widget:first-open
     * Initial render of Recent Activity on the Home tab.
     */
    eventBus.on('widget:first-open', function () { loyaltyApp.tab.renderHomeAccountTransactionActivities(); });

    /**
     * @listens reward:add { code, title?, createdAt?, position? }
     * Adds a new voucher to Home + My Rewards tab at runtime.
     */
    eventBus.on('reward:add', function (voucher) {
        if (!voucher || !voucher.code) return;

        if (loyaltyApp.customer && !loyaltyApp.customer.config) loyaltyApp.customer.config = {};
        if (loyaltyApp.customer && !loyaltyApp.customer.config.rewards) loyaltyApp.customer.config.rewards = [];

        var rewards = loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.rewards;
        if (rewards) {
            var alreadyExists = rewards.some(function (r) { return r.code === voucher.code; });
            if (!alreadyExists) {
                var newReward = {
                    code: voucher.code,
                    title: voucher.title || 'Voucher',
                    status: 'ACTIVE',
                    discountUsed: false,
                    createdAt: voucher.createdAt || new Date().toISOString()
                };
                if (voucher.position === 'append') {
                    rewards.push(newReward);
                } else {
                    rewards.unshift(newReward);
                }
            }
        }

        loyaltyApp.tab.renderHomeActiveRewardList({ code: voucher.code, title: voucher.title || 'Voucher' });
        if (eventBus.hasListeners('tab:visited:active-rewards')) {
            loyaltyApp.tab.renderFullActiveRewards && loyaltyApp.tab.renderFullActiveRewards();
        }
        if (eventBus.hasListeners('tab:visited:rewards')) {
            loyaltyApp.tab.renderRewardsTabActiveRewardList();
        }
    });

    /**
     * @listens activity:add { activity, points, createdAt, position? }
     * Inserts a new transaction into Home + Activity tab at runtime.
     */
    eventBus.on('activity:add', function (entry) {
        if (!entry) return;
        if (loyaltyApp.customer && !loyaltyApp.customer.config) loyaltyApp.customer.config = {};
        if (loyaltyApp.customer && !loyaltyApp.customer.config.transactions) loyaltyApp.customer.config.transactions = [];

        var newEntry = {
            activity: entry.activity || entry.reason || 'Activity',
            points: Number(entry.points) || 0,
            createdAt: entry.createdAt || new Date().toISOString()
        };

        var prepend = entry.position !== 'append';
        if (loyaltyApp.customer && loyaltyApp.customer.config) {
            if (prepend) {
                loyaltyApp.customer.config.transactions.unshift(newEntry);
            } else {
                loyaltyApp.customer.config.transactions.push(newEntry);
            }
        }

        loyaltyApp.tab.renderHomeAccountTransactionActivities();
        if (eventBus.hasListeners('tab:visited:activities')) {
            loyaltyApp.tab.renderFullActivities && loyaltyApp.tab.renderFullActivities();
        }
    });
}
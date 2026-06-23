// =============================================================================
// modules/tabs/home.js
// Home tab renders — active rewards preview, recent activity table.
// Also wires the tab:activated dispatcher and reward:add / activity:add events.
// Call initHomeTab() once at boot after initWidget().
// =============================================================================

import { getStore } from '../store.js';
import { getConfig, lbl } from '../config.js';
import { listItem, tableHead, tableRow, emptyState } from '../builder.js';

export function initHomeTab() {
    var { loyaltyApp } = getStore();
    var eventBus = loyaltyApp.bus;

    loyaltyApp.tab = loyaltyApp.tab || {};

    // ── tab:activated dispatcher ──────────────────────────────────────────────

    eventBus.on('tab:activated', function (data) {
        if (!data || !data.tab) return;
        eventBus.emit('tab:activated:' + data.tab, data);
    });

    // ── HOME: ACTIVE REWARDS PREVIEW ──────────────────────────────────────────

    loyaltyApp.tab.renderHomeActiveRewardList = function (latestVoucher) {
        var WIDGET_CONFIG = getConfig();
        if (!WIDGET_CONFIG.showHomeRewardsSection) return;
        var listEl = document.querySelector('nbl-list[data-list="home-rewards"]');
        if (!listEl) return;

        if (loyaltyApp.customer && !loyaltyApp.customer.config) loyaltyApp.customer.config = {};
        if (loyaltyApp.customer && !loyaltyApp.customer.config.rewards) loyaltyApp.customer.config.rewards = [];

        var customerRewards = (loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.rewards) || [];
        var active = customerRewards.filter(function (r) { return r.discountUsed === false && r.status === 'ACTIVE'; });

        var justAddedCode = null;
        if (latestVoucher && latestVoucher.code) {
            var codes = {};
            active.forEach(function (r) { codes[r.code] = true; });
            if (!codes[latestVoucher.code]) {
                var newReward = { code: latestVoucher.code, title: latestVoucher.title || 'Voucher', status: 'ACTIVE', discountUsed: false, createdAt: new Date().toISOString() };
                if (loyaltyApp.customer && loyaltyApp.customer.config) loyaltyApp.customer.config.rewards.push(newReward);
                active.push(newReward);
                justAddedCode = latestVoucher.code;
            }
        }

        function renderPage(items) {
            listEl.innerHTML = '';
            if (!items.length) { listEl.append(emptyState(lbl('emptyRewards') || 'No active rewards available')); return; }
            items.forEach(function (r) {
                listEl.append(listItem({
                    iconName: 'reward-discount',
                    title: r.title || 'Voucher',
                    data: { code: r.code },
                    isNew: justAddedCode && r.code === justAddedCode,
                }));
            });
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
     * Initial render of Active Rewards + Prize Requests on the Home tab.
     * renderHomePrizeRequests is defined in tabs/prizes.js.
     */
    eventBus.on('widget:first-open', function () { loyaltyApp.tab.renderHomeActiveRewardList(); });
    eventBus.on('widget:first-open', function () {
        if (loyaltyApp.tab.renderHomePrizeRequests) loyaltyApp.tab.renderHomePrizeRequests();
    });

    // ── HOME: RECENT ACTIVITY TABLE ───────────────────────────────────────────

    loyaltyApp.tab.renderHomeAccountTransactionActivities = function () {
        var WIDGET_CONFIG = getConfig();
        if (!WIDGET_CONFIG.showHomeActivitiesSection) return;
        var tableEl = document.querySelector('nbl-table[data-table="home-activities"]');
        if (!tableEl) return;
        var transactions = (loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.transactions) || [];

        function renderPage(items, prevLoaded) {
            prevLoaded = prevLoaded || 0;
            tableEl.innerHTML = '';
            if (!items.length) { tableEl.append(emptyState(lbl('emptyActivity') || 'No account activities yet')); return; }
            tableEl.append(tableHead());
            items.forEach(function (t, i) { tableEl.append(tableRow(t, i >= prevLoaded)); });
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
                    createdAt: voucher.createdAt || new Date().toISOString(),
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
            loyaltyApp.tab.renderRewardsTabActiveRewardList && loyaltyApp.tab.renderRewardsTabActiveRewardList();
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
            createdAt: entry.createdAt || new Date().toISOString(),
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

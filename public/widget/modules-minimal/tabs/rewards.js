// =============================================================================
// modules/tabs/rewards.js
// Rewards tab — claimable reward rules list, plus the "Active Rewards"
// section box that mirrors Home's active-rewards preview inside this tab.
// Call initRewardsTab() once at boot after initWidget().
// =============================================================================

import { getStore } from '../store.js';
import { getConfig, lbl, getPoints } from '../config.js';
import { listItem, claimButton, statusText, emptyState } from '../builder.js';
import { formatNumber } from '../utils.js';

export function initRewardsTab() {
    var { loyaltyApp, appConfig } = getStore();
    var eventBus = loyaltyApp.bus;

    loyaltyApp.tab = loyaltyApp.tab || {};

    // ── Rewards tab: claimable reward rules ─────────────────────────────────

    loyaltyApp.tab.renderRewardList = function () {
        var listEl = document.querySelector('nbl-list[data-list="rewards"]');
        if (!listEl) return;

        var customerPoints = getPoints();
        var rules = appConfig.rewardRules || [];

        listEl.innerHTML = '';
        if (!rules.length) { listEl.append(emptyState(lbl('emptyRewardsCatalog') || 'No rewards available')); return; }

        rules.forEach(function (rule) {
            var isFixed = rule.discountType === 'fixed';
            var title = 'Voucher ' + (isFixed ? '$' : '') + rule.rewardValue + (isFixed ? '' : '%');
            var cost = Number(rule.pointsCost) || 0;
            var canRedeem = cost > 0 && customerPoints >= cost;

            listEl.append(listItem({
                iconName: 'reward-discount',
                title: title,
                subtitle: formatNumber(cost) + ' points',
                trailing: canRedeem ? claimButton() : statusText('Not enough points'),
                data: { 'reward-rule-id': rule.id, title: title },
            }));
        });
    };

    /**
     * @listens tab:activated:rewards (once)
     */
    eventBus.once('tab:activated:rewards', function () {
        loyaltyApp.tab.renderRewardList();
        /** @fires tab:visited:rewards */
        eventBus.emitSticky('tab:visited:rewards', true);
    });

    /**
     * @listens tab:visited:rewards (sticky)
     */
    eventBus.on('tab:visited:rewards', function () {
        eventBus.on('points:update', function () {
            loyaltyApp.tab.renderRewardList();
        });
    });

    /**
     * @listens reward:rule:add { id, rewardValue, discountType, pointsCost }
     */
    eventBus.on('reward:rule:add', function (rule) {
        if (!rule || !rule.id) return;
        appConfig.rewardRules = appConfig.rewardRules || [];
        var exists = appConfig.rewardRules.some(function (existingRule) { return existingRule.id === rule.id; });
        if (!exists) appConfig.rewardRules.push(rule);
        if (eventBus.hasListeners('tab:visited:rewards')) loyaltyApp.tab.renderRewardList();
    });

    // ── Rewards tab: Active Rewards section (mirrors Home, own pagination key) ──

    loyaltyApp.tab.renderRewardsTabActiveRewardList = function () {
        var WIDGET_CONFIG = getConfig();
        var listEl = document.querySelector('nbl-list[data-list="rewards-tab-active-rewards"]');
        if (!listEl) return;

        var customerRewards = (loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.rewards) || [];
        var active = customerRewards.filter(function (r) { return r.discountUsed === false && r.status === 'ACTIVE'; });

        function renderPage(items) {
            listEl.innerHTML = '';
            if (!items.length) { listEl.append(emptyState(lbl('emptyRewards') || 'No active rewards available')); return; }
            items.forEach(function (r) {
                listEl.append(listItem({
                    iconName: 'reward-discount',
                    title: r.title || 'Voucher',
                    data: { code: r.code },
                }));
            });
        }

        loyaltyApp.pagination.init('rewards-tab-active-rewards', active, WIDGET_CONFIG.homeRewardsPerPage, renderPage);
    };

    /**
     * @listens tab:visited:rewards (sticky)
     * Initial render of the Active Rewards section inside the Rewards tab.
     */
    eventBus.on('tab:visited:rewards', function () {
        loyaltyApp.tab.renderRewardsTabActiveRewardList();
    });
}

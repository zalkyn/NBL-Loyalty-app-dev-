// =============================================================================
// modules/tabs/rewards.js
// Rewards tab — renders reward rules list.
// Covers ui.v3.js Section 10.
// Call initRewardsTab() once at boot after initWidget().
// =============================================================================

import { getStore } from '../store.js';
import { getConfig, lbl, getPoints } from '../config.js';
import { icon } from '../icons.js';
import { escapeText, escapeAttribute, formatNumber } from '../utils.js';

export function initRewardsTab() {
    var { loyaltyApp, appConfig } = getStore();
    var eventBus = loyaltyApp.bus;

    loyaltyApp.tab = loyaltyApp.tab || {};

    loyaltyApp.tab.renderRewardList = function () {
        var wrapper = document.querySelector('.nbl-reward-list-v1');
        if (!wrapper) return;

        var customerPoints = getPoints();
        var rules = appConfig.rewardRules || [];

        if (!rules.length) {
            wrapper.innerHTML = '<div class="nbl-hta-rewards-empty-v1">No rewards available</div>';
            return;
        }

        wrapper.innerHTML = rules.map(function (reward) {
            var isFixed = reward.discountType === 'fixed';
            var title = 'Voucher ' + (isFixed ? '$' : '') + reward.rewardValue + (isFixed ? '' : '%');
            var cost = Number(reward.pointsCost) || 0;
            var canRedeem = cost > 0 && customerPoints >= cost;

            return `
                    <div class="nbl-reward-item-v1 ${canRedeem ? 'active' : 'inactive'}"
                         data-reward-rule-id="${reward.id}" data-title="${escapeAttribute(title)}">
                        <div class="nbl-reward-icon-v1">${icon('reward-discount')}</div>
                        <div class="nbl-reward-content-v1">
                            <div class="nbl-reward-title-v1">${escapeText(title)}</div>
                            <div class="nbl-reward-points-v1">${formatNumber(cost)} points</div>
                        </div>
                        <div class="nbl-reward-action-v1">
                            <button class="nbl-reward-btn-v1" ${canRedeem ? '' : 'disabled'}>
                                ${canRedeem
                    ? `<div class="nbl-reward-chevron-icon">${icon('chevron-right')}</div>`
                    : '<span class="nbl-reward-status-text">Not enough points</span>'
                }
                            </button>
                        </div>
                    </div>`;
        }).join('');
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

    // ── Rewards tab active rewards (mirrors Home active rewards, own pagination key) ──

    loyaltyApp.tab.renderRewardsTabActiveRewardList = function () {
        var WIDGET_CONFIG = getConfig();
        var listEl = document.querySelector('.nbl-rewards-tab-active-rewards-list-v1');
        if (!listEl) return;

        var customerRewards = (loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.rewards) || [];
        var active = customerRewards.filter(function (r) { return r.discountUsed === false && r.status === 'ACTIVE'; });

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

        loyaltyApp.pagination.init('rewards-tab-active-rewards', active, WIDGET_CONFIG.homeRewardsPerPage, renderPage);
    };

    /**
     * @listens tab:visited:rewards (sticky)
     * Initial render of the Active Rewards list inside the Rewards tab.
     */
    eventBus.on('tab:visited:rewards', function () {
        loyaltyApp.tab.renderRewardsTabActiveRewardList();
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
}
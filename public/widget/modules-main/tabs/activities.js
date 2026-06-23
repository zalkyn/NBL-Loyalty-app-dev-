// =============================================================================
// modules/tabs/activities.js
// Full Activities tab + Full Active Rewards (My Rewards) tab.
// Covers ui.v3.js Section 12c.
// Call initActivitiesTab() once at boot after initWidget().
// =============================================================================

import { getStore } from '../store.js';
import { lbl } from '../config.js';
import { icon } from '../icons.js';
import { escapeText, escapeAttribute, formatDate, formatPointsDisplay } from '../utils.js';

export function initActivitiesTab() {
    var { loyaltyApp } = getStore();
    var eventBus = loyaltyApp.bus;

    loyaltyApp.tab = loyaltyApp.tab || {};

    // ── Full Activities tab ───────────────────────────────────────────────────

    loyaltyApp.tab.renderFullActivities = function () {
        var listWrapper = document.querySelector('.nbl-haTa-list-wrapper-full-v1');
        if (!listWrapper) return;
        var transactions = (loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.transactions) || [];
        function renderPage(items, prevLoaded) {
            if (!items.length) {
                listWrapper.innerHTML = `<div class="nbl-haTa-list-empty-v1">${lbl('emptyActivity')}</div>`;
                return;
            }
            prevLoaded = prevLoaded || 0;
            listWrapper.innerHTML = items.map(function (t, i) {
                var isNew = i >= prevLoaded;
                return `
                    <div class="nbl-haTa-list-v1${isNew ? ' nbl-item-new-v1' : ''}">
                        <div class="nbl-haTa-list-item-v1">${formatDate(t.createdAt)}</div>
                        <div class="nbl-haTa-list-item-v1">${escapeText(t.activity || t.reason || '—')}</div>
                        <div class="nbl-haTa-list-item-v1">${formatPointsDisplay(t.points)}</div>
                    </div>
                `;
            }).join('');
        }
        if (!transactions.length) { renderPage([]); return; }
        loyaltyApp.pagination.init('full-activities', transactions, 10, renderPage);
    };

    /**
     * @listens tab:activated:activities (once)
     */
    eventBus.once('tab:activated:activities', function () {
        loyaltyApp.tab.renderFullActivities();
        /** @fires tab:visited:activities */
        eventBus.emitSticky('tab:visited:activities', true);
    });

    // ── Full Active Rewards (My Rewards) tab ──────────────────────────────────

    loyaltyApp.tab.renderFullActiveRewards = function () {
        var listEl = document.querySelector('.nbl-hta-reward-list-full-v1');
        if (!listEl) return;
        var customerRewards = (loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.rewards) || [];
        var active = customerRewards.filter(function (r) { return r.discountUsed === false && r.status === 'ACTIVE'; });
        function renderPage(items, prevLoaded) {
            if (!items.length) {
                listEl.innerHTML = `<div class="nbl-hta-rewards-empty-v1">${lbl('emptyRewards')}</div>`;
                return;
            }
            prevLoaded = prevLoaded || 0;
            listEl.innerHTML = items.map(function (r, i) {
                var isNew = i >= prevLoaded;
                return `
                    <div class="nbl-hta-reward-item-v1${isNew ? ' nbl-item-new-v1' : ''}" data-voucher="${escapeAttribute(r.code)}">
                        <div class="nbl-hta-reward-icon-v1">${icon('reward-discount')}</div>
                        <div class="nbl-hta-reward-content-v1">
                            <div class="nbl-hta-reward-title-v1">${escapeText(r.title || 'Voucher')}</div>
                        </div>
                        <div class="nbl-hta-reward-action-v1">
                            <div class="nbl-hta-reward-chevron-icon">${icon('chevron-right')}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        if (!active.length) { renderPage([]); return; }
        loyaltyApp.pagination.init('full-rewards', active, 8, renderPage);
    };

    /**
     * @listens tab:activated:active-rewards (once)
     */
    eventBus.once('tab:activated:active-rewards', function () {
        loyaltyApp.tab.renderFullActiveRewards();
        /** @fires tab:visited:active-rewards */
        eventBus.emitSticky('tab:visited:active-rewards', true);
    });
}
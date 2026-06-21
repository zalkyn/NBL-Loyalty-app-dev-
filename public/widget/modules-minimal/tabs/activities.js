// =============================================================================
// modules/tabs/activities.js
// Full Activities tab + Full Active Rewards (My Rewards) tab.
// Call initActivitiesTab() once at boot after initWidget().
// =============================================================================

import { getStore } from '../store.js';
import { lbl } from '../config.js';
import { listItem, tableHead, tableRow, emptyState } from '../builder.js';

export function initActivitiesTab() {
    var { loyaltyApp } = getStore();
    var eventBus = loyaltyApp.bus;

    loyaltyApp.tab = loyaltyApp.tab || {};

    // ── Full Activities tab ───────────────────────────────────────────────────

    loyaltyApp.tab.renderFullActivities = function () {
        var tableEl = document.querySelector('nbl-table[data-table="full-activities"]');
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
        var listEl = document.querySelector('nbl-list[data-list="full-rewards"]');
        if (!listEl) return;
        var customerRewards = (loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.rewards) || [];
        var active = customerRewards.filter(function (r) { return r.discountUsed === false && r.status === 'ACTIVE'; });

        function renderPage(items, prevLoaded) {
            prevLoaded = prevLoaded || 0;
            listEl.innerHTML = '';
            if (!items.length) { listEl.append(emptyState(lbl('emptyRewards') || 'No active rewards available')); return; }
            items.forEach(function (r, i) {
                listEl.append(listItem({
                    iconName: 'reward-discount',
                    title: r.title || 'Voucher',
                    data: { code: r.code },
                    isNew: i >= prevLoaded,
                }));
            });
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

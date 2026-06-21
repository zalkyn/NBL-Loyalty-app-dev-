// =============================================================================
// modules/click-router.js
// Global click delegation + bus → action wiring.
// Covers ui.v3.js Section 17.
// Call initClickRouter() once at boot after initWidget().
// =============================================================================

import { getStore } from './store.js';
import { getConfig, getPoints, lbl } from './config.js';
import { icon } from './icons.js';
import { formatNumber } from './utils.js';

/**
 * Wires global click delegation and all bus → action listeners.
 * Call once at boot after initWidget().
 */
export function initClickRouter() {
    var { loyaltyApp, appConfig } = getStore();
    var eventBus = loyaltyApp.bus;

    // ── Global click capture ──────────────────────────────────────────────────

    /**
     * Capture every click and publish on the eventBus.
     * @fires event:click { event, target }
     */
    window.addEventListener('click', function (e) {
        eventBus.emit('event:click', { event: e, target: e.target });
    });

    /**
     * @listens event:click
     * Central click router — delegates to the correct handler or emits a
     * more specific bus event.
     */
    // ── Click router: translates DOM events into semantic bus events ───────
    // The router itself never calls modules directly — it only emits events.
    // Each module listens for the event it cares about and responds.
    // This keeps the router decoupled from every module's internal API.
    eventBus.on('event:click', function (data) {
        var target = data.target;
        var WIDGET_CONFIG = getConfig();

        // Widget open button → request a toggle via the bus.
        // loyaltyApp.toggleWidget() listens for widget:toggle (below).
        if (loyaltyApp.getTargetElement(target, 'nbl-widget-open-button-v1')) {
            /** @fires widget:toggle */
            eventBus.emit('widget:toggle');
            return;
        }

        // Widget close button → request a close via the bus.
        if (loyaltyApp.getTargetElement(target, 'nbl-widget-close-button-v1')) {
            /** @fires widget:close */
            eventBus.emit('widget:close');
            return;
        }

        // Nav item or home nav card clicked → request tab change via the bus.
        // setActiveNavigation() listens for nav:change (below).
        var navEl = loyaltyApp.getTargetElement(target, 'nbl-nav-item-v1')
            || loyaltyApp.getTargetElement(target, 'nbl-home-nav-itm-v1');
        if (navEl && navEl.dataset.nav) {
            /** @fires nav:change { tab } */
            eventBus.emit('nav:change', { tab: navEl.dataset.nav });
            return;
        }

        var rewardItem = loyaltyApp.getTargetElement(target, 'nbl-hta-reward-item-v1');
        if (rewardItem && rewardItem.dataset.voucher) {
            /** @fires notify:reward:open */
            eventBus.emit('notify:reward:open', { code: rewardItem.dataset.voucher });
            return;
        }

        var ruleItem = loyaltyApp.getTargetElement(target, 'nbl-reward-item-v1');
        if (ruleItem) {
            if (ruleItem.classList.contains('active')) {
                var ruleId = Number(ruleItem.dataset.rewardRuleId);
                var rule = (appConfig.rewardRules || []).find(function (rewardRule) { return rewardRule.id === ruleId; });
                /** @fires notify:info:open */
                eventBus.emit('notify:info:open', {
                    payload: {
                        text: 'Spend ' + formatNumber(rule && rule.pointsCost) + ' points for this reward?',
                        claim: true,
                        data: { rewardRule: rule, title: ruleItem.dataset.title }
                    }
                });
            }
            return;
        }

        var prizeItem = loyaltyApp.getTargetElement(target, 'nbl-prize-item-v1');
        if (prizeItem) {
            if (prizeItem.classList.contains('active')) {
                var prizeId = Number(prizeItem.dataset.prizeId);
                var cost = Number(prizeItem.dataset.cost);
                var prizeTitle = prizeItem.dataset.title || '';
                var prize = (appConfig.physicalPrizes || []).find(function (pr) { return Number(pr.id) === prizeId; });
                var prizeValue = prize && prize.productValue ? prize.productValue : '';
                var customerPts = getPoints();
                var p = WIDGET_CONFIG.prize;

                eventBus.emit('notify:info:open', {
                    payload: {
                        title: prizeTitle,
                        sub: prizeValue ? `$${Number(prizeValue).toLocaleString()} value  ·  ${formatNumber(cost)} pts to claim` : `${formatNumber(cost)} pts to claim`,
                        rows: [
                            { key: 'Points cost', val: `${formatNumber(cost)} pts` },
                            { key: 'Your balance', val: `${formatNumber(customerPts)} pts` },
                            { key: 'Balance after', val: `${formatNumber(customerPts - cost)} pts` },
                        ],
                        claim: true,
                        data: { prize: { id: prizeId, pointsCost: cost }, title: prizeTitle, isPrize: true }
                    }
                });
            }
            return;
        }

        var myPrizeItem = loyaltyApp.getTargetElement(target, 'nbl-my-prize-item-v1');
        if (myPrizeItem) {
            var d = myPrizeItem.dataset;
            var claimStatus = d.prizeStatus || 'PENDING';
            var claimTitle = d.prizeTitle || 'Prize';
            var claimCost = Number(d.prizeCost) || 0;
            var claimValue = d.prizeValue || '';
            var claimCreated = d.prizeCreated || '';
            var claimFulfilled = d.prizeFulfilled || '';
            var claimCompleted = d.prizeCompleted || '';
            var claimAdminNote = d.prizeAdminNote || '';
            var claimTracking = d.prizeTracking || '';

            function fmtDate(iso) {
                if (!iso) return '';
                try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return ''; }
            }

            var p = WIDGET_CONFIG.prize;
            var contactUrl = p.contactUrl || '';
            var contactText = lbl('prizeContactUsText') || 'Contact us';

            var statusMessages = {
                PENDING: `<span class="nbl-notify-info-msg-icon-v1">${icon('clock')}</span>Your request is being reviewed. We'll reach out to you soon to arrange delivery.`,
                FULFILLED: `<span class="nbl-notify-info-msg-icon-v1">${icon('package')}</span>Your prize is on its way! We've dispatched your order and will follow up shortly.`,
                COMPLETED: `<span class="nbl-notify-info-msg-icon-v1">${icon('check-circle')}</span>Your prize has been delivered. Thank you for being a loyal customer!`,
                CANCELLED: `<span class="nbl-notify-info-msg-icon-v1">${icon('x-circle')}</span>This request was cancelled.`,
            };
            var badgeLabels = {
                PENDING: lbl('prizeStatusPending'),
                FULFILLED: lbl('prizeStatusFulfilled'),
                COMPLETED: lbl('prizeStatusCompleted'),
                CANCELLED: lbl('prizeStatusCancelled'),
            };

            var detailRows = [];
            if (claimValue) detailRows.push({ key: 'Prize value', val: `$${Number(claimValue).toLocaleString()}` });
            if (claimCost) detailRows.push({ key: 'Points spent', val: `${formatNumber(claimCost)} pts` });
            if (p.showRequestDate && claimCreated) detailRows.push({ key: 'Requested on', val: fmtDate(claimCreated) });
            if (p.showFulfilledDate) {
                if (claimStatus === 'FULFILLED' && claimFulfilled) detailRows.push({ key: 'Dispatched on', val: fmtDate(claimFulfilled) });
                if (claimStatus === 'COMPLETED' && claimCompleted) detailRows.push({ key: 'Completed on', val: fmtDate(claimCompleted) });
            }

            var tUrl = '', tText = '', tLabel = 'Track your order';
            if (p.showTrackingInfo && claimTracking && (claimStatus === 'FULFILLED' || claimStatus === 'COMPLETED')) {
                if (/^https?:\/\//i.test(claimTracking)) { tUrl = claimTracking; }
                else { tText = claimTracking; tLabel = claimTracking; }
            }

            var noteStr = '';
            if (p.showAdminNote && claimAdminNote) {
                noteStr = (claimStatus === 'CANCELLED' ? 'Reason: ' : 'Note: ') + claimAdminNote;
            }

            eventBus.emit('notify:info:open', {
                payload: {
                    title: claimTitle,
                    badge: badgeLabels[claimStatus] || claimStatus,
                    badgeType: claimStatus.toLowerCase(),
                    rows: detailRows,
                    msg: statusMessages[claimStatus] || statusMessages.PENDING,
                    msgClass: claimStatus === 'CANCELLED' ? 'cancelled' : '',
                    note: noteStr,
                    trackingUrl: tUrl,
                    trackingLabel: tLabel,
                    trackingText: tText,
                    contactUrl: (claimStatus === 'PENDING' || claimStatus === 'CANCELLED') ? contactUrl : '',
                    contactText: contactText,
                    claim: false,
                }
            });
            return;
        }

        var pointItem = loyaltyApp.getTargetElement(target, 'nbl-points-item-v1');
        if (pointItem && pointItem.dataset.label) {
            /** @fires notify:info:open */
            eventBus.emit('notify:info:open', { payload: { text: pointItem.dataset.label } });
            return;
        }
    });

    // ── Bus → action wiring ───────────────────────────────────────────────────
    // These listeners are the only places that call loyaltyApp methods directly.
    // The click router (above) never calls methods — it emits events.
    // This separation means: click router owns "what was clicked",
    // these listeners own "what to do about it".

    /**
     * @listens widget:toggle
     * Toggles the widget open/closed when the trigger button is clicked.
     */
    eventBus.on('widget:toggle', function () { loyaltyApp.toggleWidget(); });

    /**
     * @listens widget:close
     * Closes the widget when the close button is clicked.
     */
    eventBus.on('widget:close', function () { loyaltyApp.closeWidget(); });

    /**
     * @listens nav:change { tab }
     * Changes the active tab when a nav item or home nav card is clicked.
     */
    eventBus.on('nav:change', function (data) {
        if (data && data.tab) loyaltyApp.setActiveNavigation(data.tab);
    });

    /**
     * @listens notify:info:claim:start { data }
     * Triggers the reward voucher API call.
     */
    eventBus.on('notify:info:claim:start', function (data) {
        var claimData = data && data.data;
        if (!claimData) return;

        // Physical prize claim
        if (claimData.isPrize) {
            var prize = claimData.prize;
            if (!prize || !prize.id) return;
            loyaltyApp.requestToClaimPrize({ prizeId: prize.id, title: claimData.title });
            return;
        }

        // Discount voucher claim
        var rule = claimData.rewardRule;
        if (!rule || !rule.id) return;
        loyaltyApp.requestToGetRewardVoucher({ rewardRuleId: rule.id, title: claimData.title });
    });

    /**
     * @listens notify:info:claim:prize:success { response }
     * Adds an activity entry after a physical prize is successfully claimed.
     */
    eventBus.on('notify:info:claim:prize:success', function (data) {
        var response = data && data.response;
        var activity = (response && response.activity) || 'Prize Claimed';
        var cost = response && response.pointsCost;
        var createdAt = response && response.createdAt;
        eventBus.emit('activity:add', {
            activity: activity,
            points: cost ? -Math.abs(Number(cost)) : 0,
            createdAt: createdAt ? new Date(createdAt).toISOString() : new Date().toISOString()
        });
    });

    /**
     * @listens notify:info:claim:success { response, voucher }
     * Updates points, re-renders reward list, adds voucher + activity entries.
     */
    eventBus.on('notify:info:claim:success', function (data) {
        var response = data && data.response;

        var newPoints = response && Number(response.points);
        if (!isNaN(newPoints)) {
            // points:update listener already handles renderRewardList()
            // when the rewards tab has been visited (via tab:visited:rewards sticky).
            // No direct call needed here — emitting points:update is enough.
            eventBus.emit('points:update', newPoints);
        }

        if (data && data.voucher && data.voucher.length > 5) {
            eventBus.emit('reward:add', {
                code: data.voucher,
                title: (response && response.title) || 'Voucher'
            });
        }

        var activity = (response && response.activity) || 'Reward Redeemed';
        var cost = response && response.pointsCost;
        var createdAt = response && response.createdAt;
        eventBus.emit('activity:add', {
            activity: activity,
            points: cost ? -Math.abs(Number(cost)) : 0,
            createdAt: new Date(createdAt).toISOString()
        });
    });
}
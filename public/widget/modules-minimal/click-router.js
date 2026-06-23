// =============================================================================
// modules/click-router.js
// Global click delegation + bus -> action wiring.
// Call initClickRouter() once at boot after initWidget().
//
// Disambiguation strategy: the old system used a distinct CSS class per
// tab's list-item shape (nbl-reward-item-v1, nbl-prize-item-v1, ...). The
// new component system uses one generic <nbl-list-item> everywhere, so
// context comes from the item's containing <nbl-panel data-tab="...">
// instead of a unique class name. Each tabs/*.js module is responsible for
// putting the right data-* attributes on the list items it builds (see the
// per-tab comments below for the exact attribute contract expected).
// =============================================================================

import { getStore } from './store.js';
import { getConfig, getPoints, lbl } from './config.js';
import { formatNumber } from './utils.js';

/**
 * Wires global click delegation and all bus -> action listeners.
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
     * more specific bus event. The router itself never calls modules
     * directly — it only emits events; each module listens for the event
     * it cares about and responds.
     */
    eventBus.on('event:click', function (data) {
        var target = data.target;
        var WIDGET_CONFIG = getConfig();

        // Launcher button → request a toggle via the bus.
        if (loyaltyApp.getTargetElement(target, 'nbl-launcher-button')) {
            /** @fires widget:toggle */
            eventBus.emit('widget:toggle');
            return;
        }

        // Close button → request a close via the bus.
        if (loyaltyApp.getTargetElement(target, 'nbl-close-button')) {
            /** @fires widget:close */
            eventBus.emit('widget:close');
            return;
        }

        // Tab nav item or a [data-navigate]/[data-nav] action button →
        // request a tab change via the bus.
        var navEl = loyaltyApp.getTargetElement(target, 'nbl-tab-item')
            || target.closest('[data-navigate]')
            || target.closest('[data-nav]');
        if (navEl) {
            var targetTab = navEl.dataset.tab || navEl.dataset.navigate || navEl.dataset.nav;
            if (targetTab) {
                /** @fires nav:change { tab } */
                eventBus.emit('nav:change', { tab: targetTab });
                return;
            }
        }

        // Share button (Referral tab) → delegate to the share handler.
        var shareBtn = loyaltyApp.getTargetElement(target, 'nbl-share-button');
        if (shareBtn && shareBtn.getAttribute('platform')) {
            /** @fires referral:share { platform } */
            eventBus.emit('referral:share', { platform: shareBtn.getAttribute('platform') });
            return;
        }

        // Copy-field button (Referral link, voucher codes in notifications) →
        // delegate to the copy handler. Value comes from data-value if set,
        // else the sibling nbl-copy-field-input's text.
        var copyBtn = loyaltyApp.getTargetElement(target, 'nbl-copy-field-button');
        if (copyBtn) {
            var field = copyBtn.closest('nbl-copy-field');
            var input = field && field.querySelector('nbl-copy-field-input');
            var value = copyBtn.getAttribute('data-value') || (input && input.textContent) || '';
            /** @fires copyfield:copy { value, button } */
            eventBus.emit('copyfield:copy', { value: value, button: copyBtn });
            return;
        }

        // ── List-item clicks — disambiguated by the containing panel ───────
        var listItem = loyaltyApp.getTargetElement(target, 'nbl-list-item');
        if (listItem) {
            var panel = listItem.closest('nbl-panel');
            var tabId = panel && panel.dataset.tab;

            // A submitted prize claim — shows its status. Can appear inside
            // the Home "Prize Requests" preview, the Prizes tab's "Active
            // Prizes" section, or the My Prizes tab — tabs/prizes.js puts
            // the full claim snapshot on data-prize-* attributes on all of
            // them. Checked first since it can appear in any of those panels.
            if (listItem.dataset.prizeStatus) {
                var d = listItem.dataset;
                var claimStatus = d.prizeStatus || 'PENDING';
                var claimTitle = d.prizeTitle || 'Prize';
                var claimCost = Number(d.prizeCost) || 0;
                var claimValue = d.prizeValue || '';
                var claimCreated = d.prizeCreated || '';
                var claimFulfilled = d.prizeFulfilled || '';
                var claimCompleted = d.prizeCompleted || '';
                var claimAdminNote = d.prizeAdminNote || '';
                var claimTracking = d.prizeTracking || '';
                var claimImgUrl = d.prizeImgUrl || '';

                var fmtDate = function (iso) {
                    if (!iso) return '';
                    try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return ''; }
                };

                var pConf = WIDGET_CONFIG.prize;
                var contactUrl = pConf.contactUrl || '';
                var contactText = lbl('prizeContactUsText') || 'Contact us';

                var statusMessages = {
                    PENDING: '\u23f3 Your request is being reviewed. We\u2019ll reach out to you soon to arrange delivery.',
                    FULFILLED: '\ud83d\udce6 Your prize is on its way! We\u2019ve dispatched your order and will follow up shortly.',
                    COMPLETED: '\u2705 Your prize has been delivered. Thank you for being a loyal customer!',
                    CANCELLED: '\u274c This request was cancelled.',
                };
                var badgeLabels = {
                    PENDING: lbl('prizeStatusPending'),
                    FULFILLED: lbl('prizeStatusFulfilled'),
                    COMPLETED: lbl('prizeStatusCompleted'),
                    CANCELLED: lbl('prizeStatusCancelled'),
                };

                var detailRows = [];
                if (claimValue) detailRows.push({ key: 'Prize value', val: '$' + Number(claimValue).toLocaleString() });
                if (claimCost) detailRows.push({ key: 'Points spent', val: formatNumber(claimCost) + ' pts' });
                if (pConf.showRequestDate && claimCreated) detailRows.push({ key: 'Requested on', val: fmtDate(claimCreated) });
                if (pConf.showFulfilledDate) {
                    if (claimStatus === 'FULFILLED' && claimFulfilled) detailRows.push({ key: 'Dispatched on', val: fmtDate(claimFulfilled) });
                    if (claimStatus === 'COMPLETED' && claimCompleted) detailRows.push({ key: 'Completed on', val: fmtDate(claimCompleted) });
                }

                var tUrl = '', tText = '', tLabel = 'Track your order';
                if (pConf.showTrackingInfo && claimTracking && (claimStatus === 'FULFILLED' || claimStatus === 'COMPLETED')) {
                    if (/^https?:\/\//i.test(claimTracking)) { tUrl = claimTracking; }
                    else { tText = claimTracking; tLabel = claimTracking; }
                }

                var noteStr = '';
                if (pConf.showAdminNote && claimAdminNote) {
                    noteStr = (claimStatus === 'CANCELLED' ? 'Reason: ' : 'Note: ') + claimAdminNote;
                }

                eventBus.emit('notify:info:open', {
                    payload: {
                        imageUrl: pConf.showImage ? claimImgUrl : '',
                        imagePlaceholder: pConf.showImage !== false,
                        imageFit: pConf.imageFit || 'cover',
                        imageHeight: pConf.imageHeight || 150,
                        imagePosition: pConf.imagePosition || 'center',
                        imageTitle: claimTitle,
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
                    },
                });
                return;
            }

            // Earn / Points tab: informational row explaining how to earn.
            // tabs/earn.js puts data-label on each row.
            if (tabId === 'points' && listItem.dataset.label) {
                /** @fires notify:info:open */
                eventBus.emit('notify:info:open', { payload: { text: listItem.dataset.label } });
                return;
            }

            // Home: "Active Rewards" preview row (and the My Rewards / Rewards
            // tab's own Active Rewards section) → open the voucher code modal.
            // tabs/home.js and tabs/rewards.js put data-code="<voucher code>"
            // on each row.
            if (listItem.dataset.code) {
                /** @fires notify:reward:open */
                eventBus.emit('notify:reward:open', { code: listItem.dataset.code });
                return;
            }

            // Rewards tab: claimable reward rule. tabs/rewards.js puts
            // data-reward-rule-id + data-title on each row, and only rows the
            // customer can currently afford carry a (non-claimed) nbl-claim-button.
            // Claiming here calls the API directly — no confirmation modal —
            // the row's own button shows loading/claimed/error state and a
            // toast reports the result.
            if (tabId === 'rewards' && listItem.dataset.rewardRuleId) {
                var claimBtn = listItem.querySelector('nbl-claim-button');
                if (!claimBtn || !target.closest('nbl-claim-button')) return;
                if (claimBtn.hasAttribute('claimed') || claimBtn.hasAttribute('loading')) return;
                var ruleId = Number(listItem.dataset.rewardRuleId);
                var rule = (appConfig.rewardRules || []).find(function (r) { return r.id === ruleId; });
                if (!rule) return;

                // notify:info:claim:success/error don't carry which rule
                // they were for, so guard against a second row's claim
                // resolving while this one is still in flight (and vice
                // versa) by checking this exact button is still mid-claim
                // before reacting.
                claimBtn.setAttribute('loading', '');
                claimBtn.removeAttribute('error');

                var onSuccess = function (eventData) {
                    if (!claimBtn.hasAttribute('loading')) return;
                    eventBus.off('notify:info:claim:success', onSuccess);
                    eventBus.off('notify:info:claim:error', onError);
                    claimBtn.removeAttribute('loading');
                    claimBtn.setAttribute('claimed', '');
                    var label = claimBtn.querySelector('nbl-claim-button-label');
                    if (label) label.textContent = 'Claimed!';
                    if (loyaltyApp.notify && loyaltyApp.notify.toast) {
                        loyaltyApp.notify.toast({
                            variant: 'success',
                            title: 'Reward claimed',
                            message: (listItem.dataset.title || 'Reward') + ' has been added to your account.',
                        });
                    }
                };
                var onError = function (eventData) {
                    if (!claimBtn.hasAttribute('loading')) return;
                    eventBus.off('notify:info:claim:success', onSuccess);
                    eventBus.off('notify:info:claim:error', onError);
                    claimBtn.removeAttribute('loading');
                    claimBtn.setAttribute('error', '');
                    var label = claimBtn.querySelector('nbl-claim-button-label');
                    if (label) label.textContent = 'Try again';
                    if (loyaltyApp.notify && loyaltyApp.notify.toast) {
                        loyaltyApp.notify.toast({
                            variant: 'error',
                            title: 'Claim failed',
                            message: (eventData && eventData.message) || 'Something went wrong. Please try again.',
                        });
                    }
                };
                eventBus.on('notify:info:claim:success', onSuccess);
                eventBus.on('notify:info:claim:error', onError);

                loyaltyApp.requestToGetRewardVoucher({ rewardRuleId: rule.id, title: listItem.dataset.title });
                return;
            }

            // Prizes tab: claimable physical prize. tabs/prizes.js puts
            // data-prize-id + data-cost + data-title on each row (the
            // catalog rows only — already-submitted claims were handled by
            // the data-prize-status check above and never reach here).
            if (tabId === 'prizes' && listItem.dataset.prizeId) {
                var prizeClaimBtn = listItem.querySelector('nbl-claim-button');
                if (!prizeClaimBtn || prizeClaimBtn.hasAttribute('claimed') || prizeClaimBtn.hasAttribute('loading')) return;
                var prizeId = Number(listItem.dataset.prizeId);
                var cost = Number(listItem.dataset.cost);
                var prizeTitle = listItem.dataset.title || '';
                var prize = (appConfig.physicalPrizes || []).find(function (pr) { return Number(pr.id) === prizeId; });
                var prizeValue = prize && prize.productValue ? prize.productValue : '';
                var customerPts = getPoints();
                var p = WIDGET_CONFIG.prize;

                eventBus.emit('notify:info:open', {
                    payload: {
                        imageUrl: p.showImage ? (prize && prize.imageUrl || '') : '',
                        imagePlaceholder: p.showImage !== false,
                        imageFit: p.imageFit || 'cover',
                        imageHeight: p.imageHeight || 150,
                        imagePosition: p.imagePosition || 'center',
                        imageTitle: prizeTitle,
                        sub: prizeValue ? ('$' + Number(prizeValue).toLocaleString() + ' value  \u00b7  ' + formatNumber(cost) + ' pts to claim') : (formatNumber(cost) + ' pts to claim'),
                        rows: [
                            { key: 'Points cost', val: formatNumber(cost) + ' pts' },
                            { key: 'Your balance', val: formatNumber(customerPts) + ' pts' },
                            { key: 'Balance after', val: formatNumber(customerPts - cost) + ' pts' },
                        ],
                        claim: true,
                        data: { prize: { id: prizeId, pointsCost: cost }, title: prizeTitle, isPrize: true },
                    },
                });
                return;
            }
        }
    });

    // ── Bus → action wiring ───────────────────────────────────────────────────
    // These listeners are the only places that call loyaltyApp methods
    // directly. The click router (above) never calls methods — it emits
    // events. This separation means: click router owns "what was clicked",
    // these listeners own "what to do about it".

    /**
     * @listens widget:toggle
     */
    eventBus.on('widget:toggle', function () { loyaltyApp.toggleWidget(); });

    /**
     * @listens widget:close
     */
    eventBus.on('widget:close', function () { loyaltyApp.closeWidget(); });

    /**
     * @listens nav:change { tab }
     */
    eventBus.on('nav:change', function (data) {
        if (data && data.tab) loyaltyApp.setActiveNavigation(data.tab);
    });

    /**
     * @listens copyfield:copy { value, button }
     * Copies the value to the clipboard and shows a brief "Copied!" state
     * on the button, matching nbl-copy-field-button[copied] in ui_v3.css.
     * The referral link specifically also gets a toast, since copying it
     * is a distinct, celebratory action worth calling out (other copy
     * fields, like voucher codes, already sit inside a modal and don't
     * need a second notification on top).
     */
    eventBus.on('copyfield:copy', function (data) {
        if (!data || !data.value) return;
        var button = data.button;
        navigator.clipboard && navigator.clipboard.writeText(data.value).catch(function () { });

        var isReferralLink = !!button.closest('nbl-panel[data-tab="referral"]');
        if (isReferralLink && loyaltyApp.notify && loyaltyApp.notify.toast) {
            loyaltyApp.notify.toast({
                variant: 'success',
                title: 'Link copied!',
                message: 'Share it with your friends.',
            });
        }

        if (!button) return;
        var originalLabel = button.textContent;
        button.textContent = 'Copied!';
        button.setAttribute('copied', '');
        setTimeout(function () {
            button.textContent = originalLabel;
            button.removeAttribute('copied');
        }, 1800);
    });

    /**
     * @listens referral:share { platform }
     * Opens the appropriate share target for the referral link.
     */
    eventBus.on('referral:share', function (data) {
        var platform = data && data.platform;
        var linkInput = document.querySelector('nbl-panel[data-tab="referral"] nbl-copy-field-input');
        var url = (linkInput && linkInput.textContent) || '';
        var text = 'Use my referral link and get rewards! ' + url;
        if (platform === 'whatsapp') window.open('https://wa.me/?text=' + encodeURIComponent(text));
        if (platform === 'email') window.open('mailto:?subject=Join me and get rewards&body=' + encodeURIComponent(text));
        if (platform === 'messenger') window.open('https://www.facebook.com/dialog/send?link=' + encodeURIComponent(url));
        if (platform === 'sms') window.open('sms:?body=' + encodeURIComponent(text));
    });

    /**
     * @listens notify:info:claim:start { data }
     * Triggers the reward voucher or physical-prize API call.
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
            createdAt: createdAt ? new Date(createdAt).toISOString() : new Date().toISOString(),
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
            // points:update listener already handles re-rendering reward
            // lists once their tab has been visited — no direct call needed
            // here beyond emitting points:update.
            eventBus.emit('points:update', newPoints);
        }

        if (data && data.voucher && data.voucher.length > 5) {
            eventBus.emit('reward:add', {
                code: data.voucher,
                title: (response && response.title) || 'Voucher',
            });
        }

        var activity = (response && response.activity) || 'Reward Redeemed';
        var cost = response && response.pointsCost;
        var createdAt = response && response.createdAt;
        eventBus.emit('activity:add', {
            activity: activity,
            points: cost ? -Math.abs(Number(cost)) : 0,
            createdAt: new Date(createdAt).toISOString(),
        });
    });
}

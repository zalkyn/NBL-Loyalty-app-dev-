// =============================================================================
// modules/tabs/referral.js
// Referral tab — dynamic reward cards + copy/share button wiring.
// Covers ui.v3.js Section 13.
// Call initReferralTab() once at boot after initWidget().
// =============================================================================

import { getStore } from '../store.js';
import { escapeAttribute } from '../utils.js';

export function initReferralTab() {
    var { loyaltyApp, appConfig } = getStore();
    var eventBus = loyaltyApp.bus;

    loyaltyApp.tab = loyaltyApp.tab || {};

    loyaltyApp.tab.initReferralTab = function () {
        var container = document.getElementById('nbl-referral-rewards');
        var pointRules = appConfig.pointRules || [];
        var refRule = pointRules.find(function (pointRule) { return pointRule.event && pointRule.event.type === 'REFERRAL'; });

        if (container && refRule) {
            var refCond = (refRule.conditions && refRule.conditions.referral) || {};
            var referrer = refCond.referrer || {};
            var referred = refCond.referred || {};
            var trigger = refCond.trigger || 'oneTime';
            var currencySymbol = (appConfig.shop && appConfig.shop.currencySymbol) || '$';
            var isSubscription = trigger === 'subscription' || trigger === 'both';
            var rewardRows = [];

            function rewardRow(who, whoClass, valueText, noteText) {
                return '<div class="nbl-referral-reward-row-v1 ' + whoClass + '">' +
                    '<div class="nbl-referral-reward-who-v1">' + who + '</div>' +
                    '<div class="nbl-referral-reward-info-v1">' +
                    '<span class="nbl-referral-reward-value-v1">' + valueText + '</span>' +
                    '<span class="nbl-referral-reward-note-v1">' + noteText + '</span>' +
                    '</div>' +
                    '</div>';
            }

            if (isSubscription) {
                if (referrer.points > 0)
                    rewardRows.push(rewardRow('You', 'nbl-referral-reward-you-v1',
                        referrer.points + ' points',
                        'When friend places their first subscription order'));
                if (referrer.allowRenewalReward && referrer.renewalPoints > 0)
                    rewardRows.push(rewardRow('You', 'nbl-referral-reward-you-v1',
                        referrer.renewalPoints + ' points',
                        'Each time friend renews their subscription'));
            } else {
                if (referrer.points > 0)
                    rewardRows.push(rewardRow('You', 'nbl-referral-reward-you-v1',
                        referrer.points + ' points',
                        "After friend's first one-time purchase"));
            }

            if (referred.discountValue) {
                var voucherLabel = referred.discountType === 'percentage'
                    ? referred.discountValue + '% discount voucher'
                    : currencySymbol + referred.discountValue + ' discount voucher';
                var orderNote = referred.minimumOrderValue
                    ? 'On orders over ' + currencySymbol + referred.minimumOrderValue
                    : trigger === 'subscription'
                        ? 'On first subscription order'
                        : trigger === 'both'
                            ? 'On first order'
                            : 'On first one-time purchase';
                rewardRows.push(rewardRow('Friend', 'nbl-referral-reward-friend-v1', voucherLabel, orderNote));
                if (isSubscription && referred.allowRenewalReward && referred.renewalPoints > 0)
                    rewardRows.push(rewardRow('Friend', 'nbl-referral-reward-friend-v1',
                        referred.renewalPoints + ' points',
                        'Each time they renew their subscription'));
            }

            container.innerHTML = rewardRows.length
                ? '<div class="nbl-referral-reward-list-v1">' + rewardRows.join('') + '</div>'
                : '';
        }

        var linkInput = document.querySelector('.nbl-referral-link-v1');
        var copyBtn = document.querySelector('.nbl-referral-copy-btn-v1');
        if (linkInput && copyBtn) {
            copyBtn.addEventListener('click', function () {
                var url = linkInput.value;
                function afterCopy() {
                    copyBtn.textContent = 'Copied \u2713';
                    setTimeout(function () { copyBtn.textContent = 'Copy'; }, 2000);
                    eventBus.emit('notify:info:open', { payload: { text: '\uD83C\uDF89 Referral link copied! Share it with your friends' } });
                }
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(url).then(afterCopy).catch(afterCopy);
                } else {
                    afterCopy();
                }
            });
        }

        document.querySelectorAll('.nbl-referral-share-btn-v1').forEach(function (shareButton) {
            shareButton.addEventListener('click', function () {
                var url = linkInput ? linkInput.value : '';
                var text = 'Use my referral link and get rewards! ' + url;
                var type = shareButton.dataset.share;
                if (type === 'whatsapp') window.open('https://wa.me/?text=' + encodeURIComponent(text));
                if (type === 'email') window.open('mailto:?subject=Join me and get rewards&body=' + encodeURIComponent(text));
                if (type === 'messenger') window.open('https://www.facebook.com/dialog/send?link=' + encodeURIComponent(url));
                if (type === 'sms') window.open('sms:?body=' + encodeURIComponent(text));
            });
        });
    };

    /**
     * @listens tab:activated:referral (once)
     */
    eventBus.once('tab:activated:referral', function () {
        loyaltyApp.tab.initReferralTab();
    });
}
// =============================================================================
// modules/tabs/referral.js
// Referral tab — dynamic reward-summary info cards.
// Copy-field and share-button clicks are handled centrally by
// click-router.js (nbl-copy-field-button -> copyfield:copy,
// nbl-share-button -> referral:share) via event delegation, so this file
// only renders the dynamic reward summary, not click wiring.
// Call initReferralTab() once at boot after initWidget().
// =============================================================================

import { getStore } from '../store.js';
import { infoCard } from '../builder.js';

export function initReferralTab() {
    var { loyaltyApp, appConfig } = getStore();
    var eventBus = loyaltyApp.bus;

    loyaltyApp.tab = loyaltyApp.tab || {};

    loyaltyApp.tab.initReferralTab = function () {
        var listEl = document.querySelector('nbl-panel[data-tab="referral"] [data-list="referral-rewards"]');
        if (!listEl) return;

        var pointRules = appConfig.pointRules || [];
        var refRule = pointRules.find(function (pointRule) { return pointRule.event && pointRule.event.type === 'REFERRAL'; });

        listEl.innerHTML = '';
        if (!refRule) return;

        var refCond = (refRule.conditions && refRule.conditions.referral) || {};
        var referrer = refCond.referrer || {};
        var referred = refCond.referred || {};
        var trigger = refCond.trigger || 'oneTime';
        var currencySymbol = (appConfig.shop && appConfig.shop.currencySymbol) || '$';
        var isSubscription = trigger === 'subscription' || trigger === 'both';
        var cards = [];

        if (isSubscription) {
            if (referrer.points > 0) {
                cards.push(infoCard({
                    role: 'you', label: 'YOU',
                    title: referrer.points + ' points',
                    description: 'When friend places their first subscription order',
                }));
            }
            if (referrer.allowRenewalReward && referrer.renewalPoints > 0) {
                cards.push(infoCard({
                    role: 'you', label: 'YOU',
                    title: referrer.renewalPoints + ' points',
                    description: 'Each time friend renews their subscription',
                }));
            }
        } else if (referrer.points > 0) {
            cards.push(infoCard({
                role: 'you', label: 'YOU',
                title: referrer.points + ' points',
                description: 'After friend\u2019s first one-time purchase',
            }));
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
            cards.push(infoCard({ role: 'friend', label: 'FRIEND', title: voucherLabel, description: orderNote }));

            if (isSubscription && referred.allowRenewalReward && referred.renewalPoints > 0) {
                cards.push(infoCard({
                    role: 'friend', label: 'FRIEND',
                    title: referred.renewalPoints + ' points',
                    description: 'Each time they renew their subscription',
                }));
            }
        }

        cards.forEach(function (card) { listEl.append(card); });
    };

    /**
     * @listens tab:activated:referral (once)
     */
    eventBus.once('tab:activated:referral', function () {
        loyaltyApp.tab.initReferralTab();
    });
}

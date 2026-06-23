// =============================================================================
// modules/tabs/earn.js
// Earn Points tab — renders point rules list.
// Covers ui.v3.js Section 9.
// Call initEarnTab() once at boot after initWidget().
// =============================================================================

import { getStore } from '../store.js';
import { lbl } from '../config.js';
import { icon } from '../icons.js';
import { escapeText, escapeAttribute, formatNumber, formatPoints, formatDiscount } from '../utils.js';

export function initEarnTab() {
    var { loyaltyApp, appConfig } = getStore();
    var eventBus = loyaltyApp.bus;

    loyaltyApp.tab = loyaltyApp.tab || {};

    loyaltyApp.tab.renderEarnPointsList = function () {
        var container = document.querySelector('.nbl-points-list-v1');
        if (!container) return;

        var pointRules = (appConfig.pointRules || []).filter(function (r) { return r.isActive; });
        var currencySymbol = (appConfig.shop && appConfig.shop.currencySymbol) || '$';

        function buildLabel(rule) {
            var type = rule.event && rule.event.type;
            var ruleConditions = rule.conditions || {};
            var order = ruleConditions.order || {};
            var referralConditions = ruleConditions.referral || {};
            var review = ruleConditions.review || {};

            if (type === 'REVIEW') {
                var parts = [];
                if (review.text && review.text.isActive && review.text.points > 0)
                    parts.push(formatPoints(review.text.points) + ' for text review');
                if (review.image && review.image.isActive && review.image.points > 0)
                    parts.push(formatPoints(review.image.points) + ' for photo review');
                if (review.video && review.video.isActive && review.video.points > 0)
                    parts.push(formatPoints(review.video.points) + ' for video review');
                return parts.join('. ') || 'Earn points for reviews';
            }

            if (type === 'ORDER') {
                if (order.type === 'incremental' && order.rate)
                    return 'Get ' + formatPoints(order.rate.points) + ' for every ' + currencySymbol + formatNumber(order.rate.amount) + ' spent';
                if (order.type === 'fixed')
                    return 'Get ' + formatPoints(order.fixedPoints) + ' for every order';
            }

            if (type === 'REFERRAL') {
                var referrer = referralConditions.referrer || {};
                var referred = referralConditions.referred || {};
                var trigger = referralConditions.trigger || 'oneTime';
                var p2 = [];
                if (trigger === 'subscription') {
                    if (referrer.points > 0)
                        p2.push('Earn ' + formatPoints(referrer.points) + ' when your friend places their first subscription order');
                    if (referrer.allowRenewalReward && referrer.renewalPoints > 0)
                        p2.push('Earn ' + formatPoints(referrer.renewalPoints) + ' for each renewal');
                } else if (trigger === 'both') {
                    if (referrer.points > 0)
                        p2.push('Earn ' + formatPoints(referrer.points) + ' when your friend places their first order');
                    if (referrer.allowRenewalReward && referrer.renewalPoints > 0)
                        p2.push('Earn ' + formatPoints(referrer.renewalPoints) + ' for each subscription renewal');
                } else {
                    if (referrer.points > 0)
                        p2.push('Earn ' + formatPoints(referrer.points) + ' when your friend makes their first one-time purchase');
                }
                if (referred.discountValue) {
                    var discountOrderNote = trigger === 'subscription'
                        ? ' on their first subscription order'
                        : trigger === 'both'
                            ? ' on their first order'
                            : ' on their first one-time purchase';
                    p2.push('Your friend gets ' + formatDiscount(referred.discountValue, referred.discountType, currencySymbol) + discountOrderNote);
                }
                return p2.length ? p2.join('. ') : 'Earn points by referring friends';
            }

            return 'Earn ' + formatPoints(order.fixedPoints || rule.pointsCost || 0) + ' for completing this action';
        }

        function buildPointsText(rule) {
            var type = rule.event && rule.event.type;
            var ruleConditions = rule.conditions || {};
            var order = ruleConditions.order || {};
            var referralConditions = ruleConditions.referral || {};
            var review = ruleConditions.review || {};

            if (type === 'REVIEW') {
                var reviewPointParts = [];
                if (review.text && review.text.isActive && review.text.points > 0)
                    reviewPointParts.push(formatPoints(review.text.points) + ' text');
                if (review.image && review.image.isActive && review.image.points > 0)
                    reviewPointParts.push(formatPoints(review.image.points) + ' photo');
                if (review.video && review.video.isActive && review.video.points > 0)
                    reviewPointParts.push(formatPoints(review.video.points) + ' video');
                return reviewPointParts.join(' · ') || '—';
            }

            if (type === 'REFERRAL') {
                var referrer = referralConditions.referrer || {};
                var trigger = referralConditions.trigger || 'oneTime';
                if (trigger === 'subscription' || trigger === 'both') {
                    var pointParts = [];
                    if (referrer.points > 0)
                        pointParts.push(formatPoints(referrer.points) + ' (first subscription order)');
                    if (referrer.allowRenewalReward && referrer.renewalPoints > 0)
                        pointParts.push(formatPoints(referrer.renewalPoints) + ' (renewals)');
                    return pointParts.length ? pointParts.join(' + ') : '—';
                }
                if (referrer.points > 0)
                    return formatPoints(referrer.points) + ' (one-time purchase)';
                return '—';
            }

            if (type === 'ORDER') {
                if (order.type === 'incremental' && order.rate)
                    return formatPoints(order.rate.points) + ' per ' + currencySymbol + formatNumber(order.rate.amount);
                if (order.type === 'fixed')
                    return formatPoints(order.fixedPoints) + ' per order';
            }

            return formatPoints(order.fixedPoints || rule.pointsCost || 0);
        }

        var ICON_MAP = { REVIEW: 'review', REFERRAL: 'referral', ORDER: 'purchase' };

        if (!pointRules.length) {
            container.innerHTML = '<div class="nbl-hta-rewards-empty-v1">No earn rules available</div>';
            return;
        }

        if (!pointRules.length) {
            container.innerHTML = '<div class="nbl-hta-rewards-empty-v1">No earn rules available</div>';
            return;
        }

        container.innerHTML = pointRules.map(function (rule) {
            var type = rule.event && rule.event.type;
            var title = escapeText(rule.event && rule.event.name || rule.title || 'Earn Points');
            var label = buildLabel(rule);
            return `
                    <div class="nbl-points-item-v1" data-rule-id="${rule.id}" data-label="${escapeAttribute(label)}">
                        <div class="nbl-points-icon-v1">${icon(ICON_MAP[type] || 'earn-points')}</div>
                        <div class="nbl-points-content-v1">
                            <div class="nbl-points-title-v1">${title}</div>
                            <div class="nbl-points-points-v1">${buildPointsText(rule)}</div>
                        </div>
                        <div class="nbl-points-action-v1">
                            <div class="nbl-points-chevron-icon">${icon('chevron-right')}</div>
                        </div>
                    </div>`;
        }).join('');
    };

    /**
     * @listens tab:activated:points (once)
     */
    eventBus.once('tab:activated:points', function () {
        loyaltyApp.tab.renderEarnPointsList();
        /** @fires tab:visited:points */
        eventBus.emitSticky('tab:visited:points', true);
    });

    /**
     * @listens tab:visited:points (sticky)
     */
    eventBus.on('tab:visited:points', function () {
        eventBus.on('points:update', function () {
            loyaltyApp.tab.renderEarnPointsList();
        });
    });
}
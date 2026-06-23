// =============================================================================
// modules/api.js
// All fetch calls — reward voucher + prize claim.
// initApi() attaches them onto loyaltyApp so click-router can call them
// via loyaltyApp.requestToGetRewardVoucher / loyaltyApp.requestToClaimPrize.
// =============================================================================

import { getStore } from './store.js';

/**
 * Request a discount voucher for a reward rule.
 * @param {{ rewardRuleId: number, title: string }} params
 */
export function requestToGetRewardVoucher(params) {
    var { eventBus, loyaltyApp, appConfig } = getStore();
    var rewardRuleId = params.rewardRuleId;
    var title = params.title;
    var customer = loyaltyApp.customer;

    if (!rewardRuleId || !customer || !customer.id || !customer.config || !customer.config.id) {
        eventBus.emit('notify:info:claim:error', { message: 'Missing required data. Please refresh and try again.' });
        return;
    }

    fetch(appConfig.appUrl + '/api/get-reward-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            shop: window.Shopify && window.Shopify.shop,
            customerId: customer.id,
            rewardRuleId: rewardRuleId,
            title: title,
            customerIndex: customer.config.id,
        }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(40000) : undefined,
    })
        .then(function (res) {
            if (!res.ok) throw new Error('Server error: ' + res.status);
            return res.json();
        })
        .then(function (data) {
            var voucher = data && data.voucherCode;
            if (!voucher) throw new Error('No voucher code returned. Please try again.');
            eventBus.emit('notify:info:claim:success', { response: data, voucher: voucher });
        })
        .catch(function (err) {
            eventBus.emit('notify:info:claim:error', { message: err.message || 'Something went wrong. Please try again.' });
        });
}

/**
 * Request a physical prize claim.
 * @param {{ prizeId: number, title: string }} params
 */
export function requestToClaimPrize(params) {
    var { eventBus, loyaltyApp, appConfig } = getStore();
    var prizeId = params.prizeId;
    var customer = loyaltyApp.customer;

    if (!prizeId || !customer || !customer.id || !customer.config || !customer.config.id) {
        eventBus.emit('notify:info:claim:error', { message: 'Missing required data. Please refresh and try again.' });
        return;
    }

    fetch(appConfig.appUrl + '/api/claim-prize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            shop: window.Shopify && window.Shopify.shop,
            customerId: customer.id,
            customerIndex: customer.config.id,
            prizeId: prizeId,
        }),
        signal: AbortSignal.timeout ? AbortSignal.timeout(40000) : undefined,
    })
        .then(function (res) {
            if (!res.ok) throw new Error('Server error: ' + res.status);
            return res.json();
        })
        .then(function (data) {
            if (data.error) throw new Error(data.details || data.error);
            eventBus.emit('notify:info:claim:prize:success', { response: data });
        })
        .catch(function (err) {
            eventBus.emit('notify:info:claim:error', { message: err.message || 'Something went wrong. Please try again.' });
        });
}

/**
 * Attaches API functions onto loyaltyApp so click-router can call them directly.
 * Call once at boot after initStore().
 *
 * ui.v3.js reference:
 *   loyaltyApp.requestToGetRewardVoucher = function(...) { ... }  (Section 14)
 *   loyaltyApp.requestToClaimPrize       = function(...) { ... }  (Section 14)
 */
export function initApi() {
    var { loyaltyApp } = getStore();
    loyaltyApp.requestToGetRewardVoucher = requestToGetRewardVoucher;
    loyaltyApp.requestToClaimPrize = requestToClaimPrize;
}
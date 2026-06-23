// =============================================================================
// modules/referral-modal.js
// Referral modal flow — URL code detection, discount fetch, step management.
// Covers ui.v3.js Section 16.
// Call initReferralModal() once at boot — tryInit runs immediately.
// =============================================================================

import { getStore } from './store.js';
import { getConfig } from './config.js';

/**
 * Initialises the referral modal.
 * tryInit runs immediately (URL code check must happen before navigation).
 * All internal logic is event-driven via eventBus.
 */
export function initReferralModal() {
    var { loyaltyApp, appConfig } = getStore();
    var eventBus = loyaltyApp.bus;

    (function initReferralModalInner() {
        var WIDGET_CONFIG = getConfig();
        var STEPS = { LOGIN: 'login', FORM: 'form', SUCCESS: 'success', LOCKED: 'locked' };
        var LOCKED_CODES = ['DISCOUNT_ALREADY_USED', 'REFERRAL_ALREADY_LOCKED'];
        var HTTP_ERRORS = { 400: 'Invalid request.', 404: 'Code not found.', 409: 'Already used.', 422: 'Not eligible.', 500: 'Server error.' };
        var CACHE_KEY = 'NBL_ReferralCache';
        var PENDING_KEY = 'NBL_PendingReferral';

        var modalElements = {};
        var activeStep = null;
        var hasCopied = false;
        var sweepId = null;
        var timeoutId = null;
        var isAutoSubmit = false;

        function getStore() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { return {}; } }
        function setStore(storeData) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(storeData)); } catch (e) { } }

        function getCache(code) {
            var store = getStore(), item = store[code]; if (!item) return null;
            if (Date.now() > item.expiresAt) { delete store[code]; setStore(store); return null; }
            return item.data;
        }
        function setCache(code, data) {
            var cacheDuration = data.success ? 60000 : 30000;
            var store = getStore(); store[code] = { data: data, expiresAt: Date.now() + cacheDuration }; setStore(store);
        }
        function hasUsedCode() {
            return Object.values(getStore()).some(function (cacheEntry) { return cacheEntry.data && cacheEntry.data.success && cacheEntry.data.referralDiscountCode; });
        }

        function getURLCode() { return new URLSearchParams(window.location.search).get('nbl-referral'); }
        function removeURLCode() { var currentUrl = new URL(window.location.href); currentUrl.searchParams.delete('nbl-referral'); history.replaceState({}, '', currentUrl); }
        function savePending(pendingCode) { if (pendingCode) localStorage.setItem(PENDING_KEY, pendingCode); }

        function restorePendingCode() {
            var urlCode = getURLCode(); if (urlCode) return urlCode;
            var saved = localStorage.getItem(PENDING_KEY); if (!saved) return null;
            var currentUrl = new URL(window.location.href); currentUrl.searchParams.set('nbl-referral', saved);
            history.replaceState({}, '', currentUrl);
            localStorage.removeItem(PENDING_KEY);
            return saved;
        }

        function cacheDOM() {
            var root = document.querySelector('.nbl-refer-modal-overlay-v1'); if (!root) return false;
            modalElements = {
                root: root,
                closeBtn: root.querySelector('.nbl-refer-modal-close-v1'),
                loginStep: root.querySelector('.nbl-refer-modal-login-step-v1'),
                formStep: root.querySelector('.nbl-refer-modal-form-v1'),
                successStep: root.querySelector('.nbl-refer-modal-success-v1'),
                lockedStep: root.querySelector('.nbl-refer-modal-locked-v1'),
                referralInput: root.querySelector('#referralInput'),
                submitBtn: root.querySelector('#submitBtn'),
                loginBtn: root.querySelector('#loginBtn'),
                finishBtn: root.querySelector('#finishBtn'),
                copyBtn: root.querySelector('#copyBtn'),
                copiedText: root.querySelector('.nbl-refer-modal-copied-text-v1'),
                discountCodeText: root.querySelector('#discountCode'),
                lockedCloseBtn: root.querySelector('#lockedCloseBtn'),
                formMessage: root.querySelector('#formMessage'),
                successMessage: root.querySelector('#successMessage'),
                lockedMessage: root.querySelector('#lockedMessage')
            };
            return true;
        }

        function showMsg(el, type, msg) {
            if (!el) return;
            var prefix = { success: '\u2705', error: '\u274C', info: '\u2139\uFE0F' }[type] || '';
            el.className = 'nbl-refer-modal-message-v1 nbl-refer-modal-message-' + type + '-v1';
            el.textContent = prefix + ' ' + msg;
        }
        function clearMsg(el) {
            if (!el) return; el.className = 'nbl-refer-modal-message-v1'; el.textContent = '';
        }

        function showStep(step) {
            activeStep = step;
            Object.values(STEPS).forEach(function (stepKey) {
                modalElements[stepKey + 'Step'] && modalElements[stepKey + 'Step'].classList.add('nbl-hidden-v1');
            });
            modalElements[step + 'Step'] && modalElements[step + 'Step'].classList.remove('nbl-hidden-v1');
        }

        function openModal() { modalElements.root.classList.add('show'); hasCopied = false; }
        function closeModal() { modalElements.root.classList.remove('show'); removeURLCode(); }

        function resetSubmitBtn() {
            var loader = modalElements.formStep && modalElements.formStep.querySelector('.nbl-refer-modal-loader-v1');
            if (loader) loader.remove();
            if (!modalElements.submitBtn) return;
            modalElements.submitBtn.disabled = false;
            modalElements.submitBtn.textContent = 'Request Discount Code';
            modalElements.submitBtn.classList.remove('nbl-hidden-v1');
        }

        function showLoader() {
            if (modalElements.formStep && modalElements.formStep.querySelector('.nbl-refer-modal-loader-v1')) return;
            var loader = document.createElement('div');
            loader.className = 'nbl-refer-modal-loader-v1';
            loader.innerHTML = '<span class="nbl-refer-modal-loader-spinner-v1"></span><span>Verifying your referral code...</span>';
            modalElements.submitBtn && modalElements.submitBtn.insertAdjacentElement('afterend', loader);
        }

        function fetchDiscount(code) {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(function () {
                if (!isAutoSubmit || WIDGET_CONFIG.showSubmitButtonOnAuto) resetSubmitBtn();
                else {
                    var loader = modalElements.formStep && modalElements.formStep.querySelector('.nbl-refer-modal-loader-v1');
                    if (loader) loader.remove();
                    if (modalElements.submitBtn) { modalElements.submitBtn.disabled = false; modalElements.submitBtn.classList.add('nbl-hidden-v1'); }
                }
                isAutoSubmit = false;
                showMsg(modalElements.formMessage, 'error', 'Request timed out. Please try again.');
            }, 8000);

            fetch(appConfig.appUrl + '/api/get-referral-discount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shop: window.Shopify && window.Shopify.shop,
                    customerId: loyaltyApp.customer && loyaltyApp.customer.id,
                    referralCode: code
                })
            })
                .then(function (res) {
                    return res.json().then(function (jsonBody) {
                        jsonBody._status = res.status;
                        if (!res.ok && !jsonBody.message) jsonBody.message = HTTP_ERRORS[res.status] || HTTP_ERRORS[500];
                        return jsonBody;
                    });
                })
                .then(function (data) { eventBus.emit('discount:response', { code: code, data: data }); })
                .catch(function () { eventBus.emit('discount:response', { code: code, data: { success: false, message: 'Network error.' } }); })
                .finally(function () { clearTimeout(timeoutId); });
        }

        function initBus() {
            /** @listens referralModal:open */
            eventBus.on('referralModal:open', openModal);
            /** @listens referralModal:close */
            eventBus.on('referralModal:close', closeModal);

            /** @listens referralModal:login */
            eventBus.on('referralModal:login', function () {
                var code = getURLCode(); if (code) savePending(code);
                window.location.href = '/account/login';
            });

            /** @listens referralModal:submit { code } */
            eventBus.on('referralModal:submit', function (code) {
                clearMsg(modalElements.formMessage);
                if (!code) return showMsg(modalElements.formMessage, 'error', 'Please enter a referral code.');
                if (hasUsedCode()) { showStep(STEPS.LOCKED); return showMsg(modalElements.lockedMessage, 'error', 'You have already used a referral code.'); }

                var cached = getCache(code);
                if (cached) {
                    isAutoSubmit = false;
                    resetSubmitBtn();
                    if (cached.success) { showStep(STEPS.SUCCESS); modalElements.discountCodeText.textContent = cached.referralDiscountCode; return showMsg(modalElements.successMessage, 'success', cached.message || 'Your code is ready!'); }
                    if (LOCKED_CODES.indexOf(cached.code) > -1) { showStep(STEPS.LOCKED); return showMsg(modalElements.lockedMessage, 'error', cached.message); }
                    return showMsg(modalElements.formMessage, 'error', cached.message);
                }

                modalElements.submitBtn.classList.add('nbl-hidden-v1');
                showLoader();
                fetchDiscount(code);
            });

            /** @listens discount:response */
            eventBus.on('discount:response', function (response) {
                var wasAuto = isAutoSubmit;
                isAutoSubmit = false;
                if (!wasAuto) resetSubmitBtn();
                else if (WIDGET_CONFIG.showSubmitButtonOnAuto) resetSubmitBtn();
                else {
                    var loader = modalElements.formStep && modalElements.formStep.querySelector('.nbl-refer-modal-loader-v1');
                    if (loader) loader.remove();
                    if (modalElements.submitBtn) {
                        modalElements.submitBtn.disabled = false;
                        modalElements.submitBtn.textContent = 'Request Discount Code';
                        modalElements.submitBtn.classList.add('nbl-hidden-v1');
                    }
                }
                setCache(response.code, response.data);
                if (response.data.success) { showStep(STEPS.SUCCESS); modalElements.discountCodeText.textContent = response.data.referralDiscountCode; return showMsg(modalElements.successMessage, 'success', response.data.message); }
                if (LOCKED_CODES.indexOf(response.data.code) > -1) { showStep(STEPS.LOCKED); return showMsg(modalElements.lockedMessage, 'error', response.data.message); }
                showMsg(modalElements.formMessage, 'error', response.data.message);
            });

            /** @listens referralModal:copy */
            eventBus.on('referralModal:copy', function (text) {
                if (!text) return;
                navigator.clipboard && navigator.clipboard.writeText(text).then(function () {
                    hasCopied = true;
                    if (modalElements.copyBtn) { modalElements.copyBtn.textContent = 'Copied \u2713'; modalElements.copyBtn.disabled = true; }
                    if (modalElements.copiedText) modalElements.copiedText.classList.remove('nbl-hidden-v1');
                    setTimeout(function () {
                        if (modalElements.copyBtn) { modalElements.copyBtn.textContent = 'Copy Code'; modalElements.copyBtn.disabled = false; }
                        if (modalElements.copiedText) modalElements.copiedText.classList.add('nbl-hidden-v1');
                    }, 2500);
                });
            });

            /** @listens referralModal:finish */
            eventBus.on('referralModal:finish', function () {
                if (activeStep === STEPS.SUCCESS && !hasCopied)
                    return showMsg(modalElements.successMessage, 'error', 'Please copy your code before closing.');
                closeModal();
            });
        }

        function bindEvents() {
            /** @fires referralModal:close */
            modalElements.closeBtn && modalElements.closeBtn.addEventListener('click', function () { eventBus.emit('referralModal:close'); });
            /** @fires referralModal:login */
            modalElements.loginBtn && modalElements.loginBtn.addEventListener('click', function () { eventBus.emit('referralModal:login'); });
            /** @fires referralModal:finish */
            modalElements.finishBtn && modalElements.finishBtn.addEventListener('click', function () { eventBus.emit('referralModal:finish'); });
            /** @fires referralModal:close */
            modalElements.lockedCloseBtn && modalElements.lockedCloseBtn.addEventListener('click', function () { eventBus.emit('referralModal:close'); });
            /** @fires referralModal:submit */
            modalElements.submitBtn && modalElements.submitBtn.addEventListener('click', function () { eventBus.emit('referralModal:submit', modalElements.referralInput && modalElements.referralInput.value.trim()); });
            /** @fires referralModal:copy */
            modalElements.copyBtn && modalElements.copyBtn.addEventListener('click', function () { eventBus.emit('referralModal:copy', modalElements.discountCodeText && modalElements.discountCodeText.textContent.trim()); });
        }

        function tryInit(retry) {
            var code = restorePendingCode();
            if (!cacheDOM()) {
                if (retry > 0) { setTimeout(function () { tryInit(retry - 1); }, 300); return; }
                return;
            }
            bindEvents();
            initBus();

            sweepId = setInterval(function () {
                var store = getStore(); var now = Date.now();
                Object.keys(store).forEach(function (cacheKey) { if (now > store[cacheKey].expiresAt) delete store[cacheKey]; });
                setStore(store);
            }, 30000);

            if (!code) return;
            openModal();
            if (!loyaltyApp.customer || !loyaltyApp.customer.id) { showStep(STEPS.LOGIN); return; }
            showStep(STEPS.FORM);
            if (modalElements.referralInput) modalElements.referralInput.value = code;
            isAutoSubmit = true;
            modalElements.submitBtn && modalElements.submitBtn.classList.add('nbl-hidden-v1');
            showLoader();
            eventBus.emit('referralModal:submit', code);
        }

        tryInit(10);
    })();
}
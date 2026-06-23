// =============================================================================
// modules/referral-modal.js
// Referral modal flow — URL code detection, discount fetch, step management.
// Builds its own markup (new tag/attribute component system) and wires its
// own direct event listeners — this modal lives outside any nbl-panel, so
// it isn't covered by click-router.js's delegation.
// Call initReferralModal() once at boot — tryInit runs immediately.
// =============================================================================

import { getStore } from './store.js';
import { getConfig } from './config.js';
import { el, text } from './builder.js';

// ── Markup builder ────────────────────────────────────────────────────────────
// Local to this file since the referral modal's shape isn't reused
// anywhere else (unlike the shared list-item/section/table builders).

function actionButton(id, label, variant) {
    var btn = document.createElement('button');
    btn.id = id;
    btn.setAttribute('nbl-referral-modal-btn', '');
    if (variant) btn.setAttribute('variant', variant);
    btn.textContent = label;
    return btn;
}

function buildReferralModal() {
    var loginStep = el('nbl-referral-modal-step', { name: 'login' }, [
        text('nbl-referral-modal-brand', 'NBL Loyalty'),
        text('nbl-referral-modal-title', 'Login to Claim Your Referral Discount'),
        text('nbl-referral-modal-subtitle', 'Log into your account to unlock your referral discount.'),
        el('div', { id: 'loginRewardSummary' }),
        actionButton('loginBtn', 'Login / Register'),
        el('nbl-referral-modal-message', { id: 'loginMessage' }),
    ]);

    var formStep = el('nbl-referral-modal-step', { name: 'form', hidden: true }, [
        text('nbl-referral-modal-brand', 'NBL Loyalty'),
        text('nbl-referral-modal-title', 'Get Your Referral Discount'),
        text('nbl-referral-modal-subtitle', 'Enter your referral code to unlock your discount.'),
        el('div', { id: 'formRewardSummary' }),
        el('nbl-referral-modal-input', { id: 'referralInputWrap' }, [
            (function () { var i = document.createElement('input'); i.type = 'text'; i.id = 'referralInput'; i.readOnly = true; i.style.cssText = 'width:100%;border:none;background:none;outline:none;font-size:inherit;color:inherit;'; return i; })(),
        ]),
        actionButton('submitBtn', 'Request Discount Code'),
        el('nbl-referral-modal-message', { id: 'formMessage' }),
    ]);

    var successStep = el('nbl-referral-modal-step', { name: 'success', hidden: true }, [
        text('nbl-referral-modal-brand', 'NBL Loyalty'),
        text('nbl-referral-modal-title', 'Your Discount Code'),
        el('nbl-copy-field', {}, [
            text('nbl-copy-field-input', '', { id: 'discountCode' }),
            actionButton('copyBtn', 'Copy Code'),
        ]),
        text('nbl-referral-modal-message', 'Copied \u2713', { id: 'copiedNotice', variant: 'success', hidden: true }),
        el('div', { id: 'successRewardSummary' }),
        el('nbl-referral-modal-important', {}, [
            el('strong', {}, [document.createTextNode('Important:')]),
            el('ul', {}, [
                el('li', {}, [document.createTextNode('One-time code — use at checkout.')]),
                el('li', {}, [document.createTextNode('Use it quickly.')]),
            ]),
        ]),
        actionButton('finishBtn', 'Finish & Save'),
        el('nbl-referral-modal-message', { id: 'successMessage' }),
    ]);

    var lockedStep = el('nbl-referral-modal-step', { name: 'locked', hidden: true }, [
        text('nbl-referral-modal-brand', 'NBL Loyalty'),
        text('nbl-referral-modal-title', 'Referral Already Used'),
        text('nbl-referral-modal-subtitle', 'Only one referral discount is allowed per customer.'),
        actionButton('lockedCloseBtn', 'Close'),
        el('nbl-referral-modal-message', { id: 'lockedMessage' }),
    ]);

    return el('nbl-referral-modal', { hidden: true }, [
        el('nbl-referral-modal-overlay'),
        el('nbl-referral-modal-content', {}, [
            el('nbl-referral-modal-close', { id: 'referralModalCloseBtn', 'aria-label': 'Close' }, [document.createTextNode('\u00d7')]),
            loginStep,
            formStep,
            successStep,
            lockedStep,
        ]),
    ]);
}

/** Builds the reward-summary rows shown on the login/form/success steps (plain text rows — no shared component needed for this one-off list). */
function buildRewardSummaryRows(rows) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin:-4px 0 4px;';
    rows.forEach(function (rowHtml) {
        var row = document.createElement('div');
        row.style.cssText = 'font-size:13px;color:var(--nbl-text-secondary);line-height:1.5;';
        row.innerHTML = rowHtml;
        wrap.append(row);
    });
    return wrap;
}

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

        function getStoreCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { return {}; } }
        function setStoreCache(storeData) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(storeData)); } catch (e) { } }

        function getCache(code) {
            var store = getStoreCache(), item = store[code]; if (!item) return null;
            if (Date.now() > item.expiresAt) { delete store[code]; setStoreCache(store); return null; }
            return item.data;
        }
        function setCache(code, data) {
            var cacheDuration = data.success ? 60000 : 30000;
            var store = getStoreCache(); store[code] = { data: data, expiresAt: Date.now() + cacheDuration }; setStoreCache(store);
        }
        function hasUsedCode() {
            return Object.values(getStoreCache()).some(function (cacheEntry) { return cacheEntry.data && cacheEntry.data.success && cacheEntry.data.referralDiscountCode; });
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

        // ── Build + mount the modal, then cache element refs ────────────────────

        function mountAndCacheDOM() {
            var modal = buildReferralModal();
            document.body.append(modal);

            modalElements = {
                root: modal,
                closeBtn: modal.querySelector('#referralModalCloseBtn'),
                loginStep: modal.querySelector('nbl-referral-modal-step[name="login"]'),
                formStep: modal.querySelector('nbl-referral-modal-step[name="form"]'),
                successStep: modal.querySelector('nbl-referral-modal-step[name="success"]'),
                lockedStep: modal.querySelector('nbl-referral-modal-step[name="locked"]'),
                referralInput: modal.querySelector('#referralInput'),
                submitBtn: modal.querySelector('#submitBtn'),
                loginBtn: modal.querySelector('#loginBtn'),
                finishBtn: modal.querySelector('#finishBtn'),
                copyBtn: modal.querySelector('#copyBtn'),
                copiedText: modal.querySelector('#copiedNotice'),
                discountCodeText: modal.querySelector('#discountCode'),
                lockedCloseBtn: modal.querySelector('#lockedCloseBtn'),
                formMessage: modal.querySelector('#formMessage'),
                successMessage: modal.querySelector('#successMessage'),
                lockedMessage: modal.querySelector('#lockedMessage'),
                loginRewardSummary: modal.querySelector('#loginRewardSummary'),
                formRewardSummary: modal.querySelector('#formRewardSummary'),
                successRewardSummary: modal.querySelector('#successRewardSummary'),
            };
            return true;
        }

        function buildRewardSummaryHTML() {
            var pointRules = appConfig.pointRules || [];
            var refRule = pointRules.find(function (r) { return r.event && r.event.type === 'REFERRAL'; });
            var refCond = (refRule && refRule.conditions && refRule.conditions.referral) || {};
            var referred = refCond.referred || {};
            var trigger = refCond.trigger || 'oneTime';
            var currencySymbol = (appConfig.shop && appConfig.shop.currencySymbol) || '$';

            var rows = [];
            if (referred.discountValue) {
                var voucherValue = referred.discountType === 'percentage'
                    ? referred.discountValue + '% discount voucher'
                    : 'a ' + currencySymbol + referred.discountValue + ' discount voucher';
                var orderNote = referred.minimumOrderValue
                    ? ' on orders over ' + currencySymbol + referred.minimumOrderValue
                    : trigger === 'subscription' ? ' for your first subscription order'
                        : trigger === 'both' ? ' for your first order'
                            : ' for your first one-time purchase';
                rows.push('\ud83c\udf81 You get <strong>' + voucherValue + '</strong>' + orderNote + '.');
            }
            if ((trigger === 'subscription' || trigger === 'both') && referred.allowRenewalReward && referred.renewalPoints > 0) {
                rows.push('\ud83d\udd04 Earn <strong>' + referred.renewalPoints + ' points</strong> every time you renew your subscription.');
            }
            return rows;
        }

        function renderRewardSummaries() {
            var rows = buildRewardSummaryHTML();
            [modalElements.loginRewardSummary, modalElements.formRewardSummary, modalElements.successRewardSummary].forEach(function (slot) {
                if (!slot) return;
                slot.innerHTML = '';
                if (rows.length) slot.append(buildRewardSummaryRows(rows));
            });
        }

        function showMsg(msgEl, type, msg) {
            if (!msgEl) return;
            var prefix = { success: '\u2705', error: '\u274C', info: '\u2139\ufe0f' }[type] || '';
            msgEl.setAttribute('variant', type);
            msgEl.textContent = prefix + ' ' + msg;
        }
        function clearMsg(msgEl) {
            if (!msgEl) return; msgEl.removeAttribute('variant'); msgEl.textContent = '';
        }

        function showStep(step) {
            activeStep = step;
            modalElements.root.setAttribute('step', step);
            Object.values(STEPS).forEach(function (stepKey) {
                var stepEl = modalElements[stepKey + 'Step'];
                if (stepEl) stepEl.toggleAttribute('hidden', stepKey !== step);
            });
        }

        function openModal() { modalElements.root.removeAttribute('hidden'); hasCopied = false; }
        function closeModal() { modalElements.root.setAttribute('hidden', ''); removeURLCode(); }

        function resetSubmitBtn() {
            var loader = modalElements.formStep && modalElements.formStep.querySelector('nbl-referral-modal-loader');
            if (loader) loader.remove();
            if (!modalElements.submitBtn) return;
            modalElements.submitBtn.disabled = false;
            modalElements.submitBtn.textContent = 'Request Discount Code';
            modalElements.submitBtn.removeAttribute('hidden');
        }

        function showLoader() {
            if (modalElements.formStep && modalElements.formStep.querySelector('nbl-referral-modal-loader')) return;
            var loader = el('nbl-referral-modal-loader', {}, [
                el('nbl-referral-modal-loader-spinner'),
                document.createTextNode('Verifying your referral code...'),
            ]);
            modalElements.submitBtn && modalElements.submitBtn.insertAdjacentElement('afterend', loader);
        }

        function fetchDiscount(code) {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(function () {
                if (!isAutoSubmit || WIDGET_CONFIG.showSubmitButtonOnAuto) resetSubmitBtn();
                else {
                    var loader = modalElements.formStep && modalElements.formStep.querySelector('nbl-referral-modal-loader');
                    if (loader) loader.remove();
                    if (modalElements.submitBtn) { modalElements.submitBtn.disabled = false; modalElements.submitBtn.setAttribute('hidden', ''); }
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
                    referralCode: code,
                }),
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

                modalElements.submitBtn.setAttribute('hidden', '');
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
                    var loader = modalElements.formStep && modalElements.formStep.querySelector('nbl-referral-modal-loader');
                    if (loader) loader.remove();
                    if (modalElements.submitBtn) {
                        modalElements.submitBtn.disabled = false;
                        modalElements.submitBtn.textContent = 'Request Discount Code';
                        modalElements.submitBtn.setAttribute('hidden', '');
                    }
                }
                setCache(response.code, response.data);
                if (response.data.success) { showStep(STEPS.SUCCESS); modalElements.discountCodeText.textContent = response.data.referralDiscountCode; return showMsg(modalElements.successMessage, 'success', response.data.message); }
                if (LOCKED_CODES.indexOf(response.data.code) > -1) { showStep(STEPS.LOCKED); return showMsg(modalElements.lockedMessage, 'error', response.data.message); }
                showMsg(modalElements.formMessage, 'error', response.data.message);
            });

            /** @listens referralModal:copy */
            eventBus.on('referralModal:copy', function (codeText) {
                if (!codeText) return;
                navigator.clipboard && navigator.clipboard.writeText(codeText).then(function () {
                    hasCopied = true;
                    if (modalElements.copyBtn) { modalElements.copyBtn.textContent = 'Copied \u2713'; modalElements.copyBtn.disabled = true; }
                    if (modalElements.copiedText) modalElements.copiedText.removeAttribute('hidden');
                    setTimeout(function () {
                        if (modalElements.copyBtn) { modalElements.copyBtn.textContent = 'Copy Code'; modalElements.copyBtn.disabled = false; }
                        if (modalElements.copiedText) modalElements.copiedText.setAttribute('hidden', '');
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
            if (!mountAndCacheDOM()) {
                if (retry > 0) { setTimeout(function () { tryInit(retry - 1); }, 300); return; }
                return;
            }
            renderRewardSummaries();
            bindEvents();
            initBus();

            sweepId = setInterval(function () {
                var store = getStoreCache(); var now = Date.now();
                Object.keys(store).forEach(function (cacheKey) { if (now > store[cacheKey].expiresAt) delete store[cacheKey]; });
                setStoreCache(store);
            }, 30000);

            if (!code) return;
            openModal();
            if (!loyaltyApp.customer || !loyaltyApp.customer.id) { showStep(STEPS.LOGIN); return; }
            showStep(STEPS.FORM);
            if (modalElements.referralInput) modalElements.referralInput.value = code;
            isAutoSubmit = true;
            modalElements.submitBtn && modalElements.submitBtn.setAttribute('hidden', '');
            showLoader();
            eventBus.emit('referralModal:submit', code);
        }

        tryInit(10);
    })();
}

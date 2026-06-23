// =============================================================================
// modules/notifications.js
// notify:* event handlers — reward panel + info panel.
// Covers ui.v3.js Section after 14 (notifications).
// Call initNotifications() once at boot after initWidget().
// =============================================================================

import { getStore } from './store.js';
import { lbl } from './config.js';
import { icon } from './icons.js';
import { escapeText, escapeAttribute } from './utils.js';

/**
 * Injects notification HTML and wires all notify:* bus events.
 * Initialises on widget:first-open — panels are injected and wired then.
 */
export function initNotifications() {
    var { loyaltyApp } = getStore();
    var eventBus = loyaltyApp.bus;

    /**
     * @listens widget:first-open
     * Injects notification HTML and wires all notify:* bus events.
     */
    eventBus.on('widget:first-open', function () {
        var notifyWrapper = document.getElementById('nbl-notification-wrapper');
        if (!notifyWrapper) return;
        notifyWrapper.innerHTML = `
                <div class="nbl-notify-overlay-v1"></div>

                <div class="nbl-notify-reward-container-v1 nbl-notify-base-v1">
                    <span class="nbl-notify-reward-close-v1">${icon('close')}</span>
                    <div class="nbl-notify-reward-heading-v1">${lbl('notifyRewardHeading')}</div>
                    <div class="nbl-notify-reward-copy-wrapper-v1">
                        <div class="nbl-notify-reward-code-v1"></div>
                        <button class="nbl-notify-reward-copy-btn-v1">${lbl('notifyRewardCopyBtn')}</button>
                    </div>
                </div>

                <div class="nbl-notify-info-container-v1 nbl-notify-base-v1">
                    <span class="nbl-notify-info-close-v1">${icon('close')}</span>
                    <div class="nbl-notify-info-body-v1">
                        <div class="nbl-notify-info-sub-v1 nbl-notify-hidden-v1"></div>
                        <div class="nbl-notify-info-rows-v1 nbl-notify-hidden-v1"></div>
                        <div class="nbl-notify-info-text-v1"></div>
                        <div class="nbl-notify-info-msg-v1 nbl-notify-hidden-v1"></div>
                        <div class="nbl-notify-info-note-v1 nbl-notify-hidden-v1"></div>
                        <div class="nbl-notify-info-tracking-v1 nbl-notify-hidden-v1">${icon('purchase')}</div>
                        <div class="nbl-notify-info-error-v1"></div>
                        <button class="nbl-notify-info-claim-btn-v1">${lbl('notifyInfoClaimBtn')}</button>
                        <a class="nbl-notify-info-contact-btn-v1 nbl-notify-hidden-v1" target="_blank" rel="noopener"></a>
                    </div>
                </div>`;

        var notifyContainer = document.getElementById('nbl-notification-wrapper');
        var overlay = document.querySelector('.nbl-notify-overlay-v1');
        var rewardEl = document.querySelector('.nbl-notify-reward-container-v1');
        var infoEl = document.querySelector('.nbl-notify-info-container-v1');
        var rewardWrapper = rewardEl.querySelector('.nbl-notify-reward-copy-wrapper-v1');
        var infoText = infoEl.querySelector('.nbl-notify-info-text-v1');
        var infoError = infoEl.querySelector('.nbl-notify-info-error-v1');
        var claimBtn = infoEl.querySelector('.nbl-notify-info-claim-btn-v1');
        var infoCloseBtn = infoEl.querySelector('.nbl-notify-info-close-v1');
        var infoBodyEl = infoEl.querySelector('.nbl-notify-info-body-v1');
        var infoSubEl = infoEl.querySelector('.nbl-notify-info-sub-v1');
        var infoRowsEl = infoEl.querySelector('.nbl-notify-info-rows-v1');
        var infoMsgEl = infoEl.querySelector('.nbl-notify-info-msg-v1');
        var infoNoteEl = infoEl.querySelector('.nbl-notify-info-note-v1');
        var infoTrackingEl = infoEl.querySelector('.nbl-notify-info-tracking-v1');
        var infoContactBtn = infoEl.querySelector('.nbl-notify-info-contact-btn-v1');

        var active = null;
        var processing = false;

        function showOverlay() {
            overlay.classList.add('nbl-notify-active-v1');
            if (notifyContainer) notifyContainer.classList.add('nbl-notify-active-v1');
        }
        function hideOverlay() {
            overlay.classList.remove('nbl-notify-active-v1');
            if (notifyContainer) notifyContainer.classList.remove('nbl-notify-active-v1');
        }

        function closeCurrent() {
            if (processing) return;
            if (active === 'reward') { rewardEl.classList.remove('nbl-notify-active-v1'); active = null; }
            if (active === 'info') { infoEl.classList.remove('nbl-notify-active-v1'); setClaimIdle(); hideError(); active = null; }
        }

        overlay.addEventListener('click', function () {
            if (processing) return;
            if (active === 'reward') closeReward();
            if (active === 'info') closeInfo();
        });

        function openReward(code) {
            if (!code) return;
            closeCurrent(); active = 'reward';
            rewardWrapper.innerHTML = `
                    <div class="nbl-notify-reward-code-v1">${escapeText(code)}</div>
                    <button class="nbl-notify-reward-copy-btn-v1">${lbl('notifyRewardCopyBtn')}</button>`;
            rewardWrapper.querySelector('button').onclick = function () {
                navigator.clipboard && navigator.clipboard.writeText(code);
                rewardWrapper.innerHTML = `
                        <div style="display:flex;align-items:center;gap:10px;width:100%">
                            <span>\u2714 Copied!</span>
                            <button class="nbl-notify-reward-copy-btn-v1" style="margin-left:auto;padding:6px 14px">Close</button>
                        </div>`;
                rewardWrapper.querySelector('button').onclick = closeReward;
            };
            rewardEl.classList.add('nbl-notify-active-v1');
            showOverlay();
        }

        function closeReward() {
            rewardEl.classList.remove('nbl-notify-active-v1');
            hideOverlay(); active = null;
        }

        rewardEl.querySelector('.nbl-notify-reward-close-v1').addEventListener('click', closeReward);

        function openInfo(payload) {
            if (!payload || processing) return;
            closeCurrent(); active = 'info';

            var text = payload.text || '';
            var claim = !!payload.claim;
            var data = payload.data || null;
            var titleText = payload.title || '';
            var badge = payload.badge || '';
            var badgeType = (payload.badgeType || '').toLowerCase();
            var subText = payload.sub || '';
            var rows = Array.isArray(payload.rows) ? payload.rows : [];
            var msgText = payload.msg || '';
            var msgClass = payload.msgClass || '';
            var noteText = payload.note || '';
            var trackingUrl = payload.trackingUrl || '';
            var trackingLabel = payload.trackingLabel || 'Track your order';
            var trackingText = payload.trackingText || '';
            var contactUrl = payload.contactUrl || '';
            var contactText = payload.contactText || 'Contact us';

            // ── Title + badge row ────────────────────────────────────────────
            var bodyTitleEl = infoBodyEl.querySelector('.nbl-notify-info-body-title-v1');
            if (bodyTitleEl) bodyTitleEl.remove();
            if (titleText || badge) {
                var titleRow = document.createElement('div');
                titleRow.className = 'nbl-notify-info-body-title-v1';
                titleRow.innerHTML = (titleText ? '<span class="nbl-notify-info-body-title-text-v1">' + escapeText(titleText) + '</span>' : '')
                    + (badge ? '<span class="nbl-notify-info-badge-v1 nbl-notify-info-badge-' + (badgeType || 'pending') + '-v1">' + escapeText(badge) + '</span>' : '');
                infoBodyEl.insertBefore(titleRow, infoBodyEl.firstChild);
            }

            // ── Sub-label ─────────────────────────────────────────────────────
            if (subText) {
                infoSubEl.textContent = subText;
                infoSubEl.classList.remove('nbl-notify-hidden-v1');
            } else {
                infoSubEl.classList.add('nbl-notify-hidden-v1');
            }

            // ── Detail rows ───────────────────────────────────────────────────
            if (rows.length) {
                infoRowsEl.innerHTML = rows.map(function (row) {
                    return '<div class="nbl-notify-info-row-v1">'
                        + '<span class="nbl-notify-info-row-key-v1">' + escapeText(row.key) + '</span>'
                        + '<span class="nbl-notify-info-row-val-v1">' + escapeText(row.val) + '</span>'
                        + '</div>';
                }).join('');
                infoRowsEl.classList.remove('nbl-notify-hidden-v1');
            } else {
                infoRowsEl.classList.add('nbl-notify-hidden-v1');
            }

            // ── Main text (backward compat) ───────────────────────────────────
            if (text) {
                if (payload.isHtml) {
                    infoText.innerHTML = text;
                } else {
                    infoText.innerText = text;
                }
                infoText.classList.remove('nbl-notify-hidden-v1');
            } else {
                infoText.innerHTML = '';
                infoText.classList.add('nbl-notify-hidden-v1');
            }

            // ── Status message box ────────────────────────────────────────────
            if (msgText) {
                infoMsgEl.innerHTML = msgText;
                infoMsgEl.className = 'nbl-notify-info-msg-v1'
                    + (msgClass ? ' nbl-notify-info-msg-' + msgClass + '-v1' : '');
                infoMsgEl.classList.remove('nbl-notify-hidden-v1');
            } else {
                infoMsgEl.classList.add('nbl-notify-hidden-v1');
            }

            // ── Admin / secondary note ────────────────────────────────────────
            if (noteText) {
                infoNoteEl.textContent = noteText;
                infoNoteEl.classList.remove('nbl-notify-hidden-v1');
            } else {
                infoNoteEl.classList.add('nbl-notify-hidden-v1');
            }

            // ── Tracking box ──────────────────────────────────────────────────
            if (trackingUrl || trackingText) {
                var trackContent = trackingUrl
                    ? '<a href="' + escapeAttribute(trackingUrl) + '" target="_blank" rel="noopener">' + escapeText(trackingLabel) + '</a>'
                    : escapeText(trackingText);
                infoTrackingEl.innerHTML = icon('purchase') + trackContent;
                infoTrackingEl.classList.remove('nbl-notify-hidden-v1');
            } else {
                infoTrackingEl.classList.add('nbl-notify-hidden-v1');
            }

            // ── Contact button ────────────────────────────────────────────────
            if (contactUrl) {
                infoContactBtn.href = contactUrl;
                infoContactBtn.textContent = contactText;
                infoContactBtn.classList.remove('nbl-notify-hidden-v1');
            } else {
                infoContactBtn.classList.add('nbl-notify-hidden-v1');
            }

            // ── Claim button ──────────────────────────────────────────────────
            hideError();
            if (claim) {
                claimBtn.classList.remove('nbl-notify-hidden-v1');
                setClaimIdle();
                claimBtn.onclick = function () {
                    setClaimLoading();
                    hideError();
                    eventBus.emit('notify:info:claim:start', { data: data });
                };
            } else {
                claimBtn.classList.add('nbl-notify-hidden-v1');
            }

            infoEl.classList.add('nbl-notify-active-v1');
            showOverlay();
        }

        function closeInfo() {
            infoEl.classList.remove('nbl-notify-active-v1');
            infoSubEl.classList.add('nbl-notify-hidden-v1');
            infoRowsEl.classList.add('nbl-notify-hidden-v1');
            infoMsgEl.classList.add('nbl-notify-hidden-v1');
            infoNoteEl.classList.add('nbl-notify-hidden-v1');
            infoTrackingEl.classList.add('nbl-notify-hidden-v1');
            infoContactBtn.classList.add('nbl-notify-hidden-v1');
            var bodyTitle = infoBodyEl && infoBodyEl.querySelector('.nbl-notify-info-body-title-v1');
            if (bodyTitle) bodyTitle.remove();
            hideOverlay(); setClaimIdle(); hideError(); active = null;
        }

        infoCloseBtn.addEventListener('click', closeInfo);

        function setClaimLoading() {
            processing = true;
            claimBtn.disabled = true;
            claimBtn.innerHTML = '<span class="nbl-spinner-v1"></span><span>' + (lbl('claimingLabel') || 'Processing...') + '</span>';
            claimBtn.classList.remove('nbl-notify-claim-error-v1');
        }
        function setClaimIdle() {
            processing = false;
            claimBtn.disabled = false;
            claimBtn.innerHTML = lbl('notifyInfoClaimBtn') || 'Claim';
            claimBtn.classList.remove('nbl-notify-claim-error-v1');
        }
        function setClaimError() {
            processing = false;
            claimBtn.disabled = false;
            claimBtn.innerHTML = (lbl('claimRetryLabel') || 'Try again');
            claimBtn.classList.add('nbl-notify-claim-error-v1');
        }
        function showError(msg) {
            infoError.textContent = msg;
            infoError.classList.add('nbl-notify-active-v1');
            setTimeout(function () { hideError(); }, 5000);
        }
        function hideError() {
            infoError.textContent = '';
            infoError.classList.remove('nbl-notify-active-v1');
        }

        /** @listens notify:reward:open */
        eventBus.on('notify:reward:open', function (eventData) { if (eventData && eventData.code) openReward(eventData.code); });
        /** @listens notify:reward:close */
        eventBus.on('notify:reward:close', function () { closeReward(); });
        /** @listens notify:info:open */
        eventBus.on('notify:info:open', function (eventData) { if (eventData && eventData.payload) openInfo(eventData.payload); });
        /** @listens notify:info:close */
        eventBus.on('notify:info:close', function () { closeInfo(); });

        /** @listens notify:info:claim:success */
        eventBus.on('notify:info:claim:success', function (eventData) {
            processing = false;
            closeInfo();
            if (eventData && eventData.voucher) openReward(eventData.voucher);
        });

        /** @listens notify:info:claim:prize:success */
        eventBus.on('notify:info:claim:prize:success', function (eventData) {
            processing = false;
            var response = eventData && eventData.response;
            // Update points balance
            var newPoints = response && Number(response.points);
            if (!isNaN(newPoints)) eventBus.emit('points:update', newPoints);
            // Re-render prizes tab if visited
            if (eventBus.hasListeners('tab:visited:prizes')) loyaltyApp.tab.renderPrizeList();
            // Re-render home prize requests
            if (response && response.claimId && loyaltyApp.customer && loyaltyApp.customer.config) {
                var claims = loyaltyApp.customer.config.prizeClaims || [];
                claims.unshift({ id: response.claimId, physicalPrizeId: response.prizeId || 0, status: 'PENDING', pointsCost: response.pointsCost ? Math.abs(response.pointsCost) : 0 });
                loyaltyApp.customer.config.prizeClaims = claims;
                loyaltyApp.tab.renderHomePrizeRequests();
                if (eventBus.hasListeners('tab:visited:my-prizes')) loyaltyApp.tab.renderMyPrizesTab();
                if (eventBus.hasListeners('tab:visited:prizes')) loyaltyApp.tab.renderPrizesTabActivePrizeList();
            }
            // Show clean success state via openInfo
            openInfo({
                msg: lbl('prizeClaimSuccessMsg') || 'Your request has been submitted! We\'ll contact you soon to arrange delivery.',
                claim: false,
            });
        });

        /** @listens notify:info:claim:error */
        eventBus.on('notify:info:claim:error', function (eventData) {
            processing = false;
            setClaimError();
            showError((eventData && eventData.message) || 'Something went wrong. Please try again.');
        });

        loyaltyApp.notify = { openReward: openReward, closeReward: closeReward, openInfo: openInfo, closeInfo: closeInfo };
    });
}
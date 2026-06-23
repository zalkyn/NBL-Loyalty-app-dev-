// =============================================================================
// modules/notifications.js
// notify:* event handlers — single reusable <nbl-notification> modal shell
// + non-blocking, stackable <nbl-toast> system.
// Markup is built via modules/builder.js (custom tag + attribute
// components, no class-soup). This file owns all behavior/state; it never
// hardcodes HTML strings for notification/toast content.
// Call initNotifications() once at boot after initWidget().
//
// Public event contract is unchanged from the previous implementation so no
// caller (click-router.js, api.js, tabs/referral.js) needs to change:
//   notify:reward:open { code }            notify:reward:close
//   notify:info:open { payload }           notify:info:close
//   notify:info:claim:start { data }
//   notify:info:claim:success { response, voucher }
//   notify:info:claim:prize:success { response }
//   notify:info:claim:error { message }
//
// Additive API for non-blocking notifications: loyaltyApp.notify.toast({
// variant, title, message, image, position, duration }) — see buildToast()
// in builder.js. Used by click-router.js's referral-link-copy handler.
//
// Note on the media banner: the reference's <nbl-notification-media> is a
// fixed-height cover/center background-image box — there is no per-payload
// fit-mode (cover/contain/auto) or position switching like the old
// bottom-sheet design had. --media-h still lets the dashboard's configured
// prize-image height come through; fit/position payload fields are
// accepted but ignored, since the new shell has nowhere to apply them.
// =============================================================================

import { getStore } from './store.js';
import { lbl } from './config.js';
import {
    buildNotificationShell,
    notificationRow,
    buildToastRegions,
    buildToast,
    buildToastProgress,
    text,
} from './builder.js';

/**
 * Injects notification + toast markup and wires all notify:* bus events.
 * Initialises on widget:first-open — panels are injected and wired then.
 */
export function initNotifications() {
    var { loyaltyApp } = getStore();
    var eventBus = loyaltyApp.bus;

    /**
     * @listens widget:first-open
     * Injects notification + toast markup and wires all notify:* bus events.
     */
    eventBus.on('widget:first-open', function () {
        var notifyWrapper = document.getElementById('nbl-notification-wrapper');
        if (!notifyWrapper) return;

        notifyWrapper.innerHTML = '';
        var shell = buildNotificationShell();
        notifyWrapper.append(shell);
        buildToastRegions().forEach(function (region) { notifyWrapper.append(region); });

        // ── Element refs (queried once against the freshly-built shell) ──────
        var overlay = shell.querySelector('nbl-notification-overlay');
        var closeBtn = shell.querySelector('nbl-notification-close');
        var mediaEl = shell.querySelector('nbl-notification-media');
        var mediaTitleEl = mediaEl.querySelector('nbl-notification-media-title');
        var mediaBadgeEl = mediaEl.querySelector('nbl-badge');
        var titleEl = shell.querySelector('nbl-notification-title');
        var subEl = shell.querySelector('nbl-notification-sub');
        var rowsEl = shell.querySelector('nbl-notification-rows');
        var bodyEl = shell.querySelector('nbl-notification-body');
        var msgEl = shell.querySelector('nbl-notification-message');
        var noteEl = shell.querySelector('nbl-notification-note');
        var trackingEl = shell.querySelector('nbl-notification-tracking');
        var errorEl = shell.querySelector('nbl-notification-error');
        var claimBtn = shell.querySelector('nbl-claim-button');
        var contactBtn = shell.querySelector('nbl-notification-contact');

        var mode = null; // 'reward' | 'info' | null
        var processing = false;
        var rewardCode = '';

        function show() { shell.removeAttribute('hidden'); }
        function hideShell() { shell.setAttribute('hidden', ''); }

        function closeCurrent() {
            if (processing) return;
            if (mode === 'reward') closeReward();
            else if (mode === 'info') closeInfo();
        }

        overlay.addEventListener('click', closeCurrent);
        closeBtn.addEventListener('click', closeCurrent);

        // ── Reward (voucher code) mode ────────────────────────────────────────
        // Reuses nbl-copy-field for the code + copy button, same component
        // referral links use, instead of a bespoke pair of tags.

        function renderRewardBody() {
            bodyEl.innerHTML = '';
            titleEl.textContent = lbl('notifyRewardHeading') || 'Success! Use this code at checkout';
            var field = document.createElement('nbl-copy-field');
            var input = text('nbl-copy-field-input', rewardCode);
            var button = text('nbl-copy-field-button', lbl('notifyRewardCopyBtn') || 'Copy', { 'data-value': rewardCode });
            field.append(input, button);
            bodyEl.append(field);
        }

        function openReward(code) {
            if (!code) return;
            closeCurrent();
            mode = 'reward';
            rewardCode = code;
            shell.setAttribute('variant', 'success');
            mediaEl.setAttribute('hidden', '');
            [subEl, rowsEl, msgEl, noteEl, trackingEl, claimBtn, contactBtn].forEach(function (n) { n.setAttribute('hidden', ''); });
            hideError();
            renderRewardBody();
            show();
        }

        function closeReward() {
            hideShell();
            mode = null;
        }

        // The reward-code copy button is a standard nbl-copy-field-button,
        // so click-router.js's generic delegated handler (copyfield:copy)
        // already manages its "Copied!" state and auto-revert in place —
        // no extra wiring needed here.

        // ── Info mode (rich payload: image, rows, message, claim, etc.) ──────

        function openInfo(payload) {
            if (!payload || processing) return;
            closeCurrent();
            mode = 'info';

            var bodyText = payload.text || '';
            var claim = !!payload.claim;
            var claimData = payload.data || null;
            var imageUrl = payload.imageUrl || '';
            var imgTitle = payload.imageTitle || '';
            var imgPlaceholder = payload.imagePlaceholder !== false;
            var imageHeight = payload.imageHeight || 120;
            var badge = payload.badge || '';
            var badgeType = (payload.badgeType || 'pending').toLowerCase();
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

            shell.setAttribute('variant', badgeType === 'cancelled' || badgeType === 'rejected' ? 'error' : 'info');

            // ── Media banner (image / placeholder background + title/badge overlay) ──
            var hasMedia = (imageUrl || imgPlaceholder) && !!(imageUrl || imgTitle || badge);
            if (hasMedia) {
                mediaEl.style.setProperty('--media-h', imageHeight + 'px');
                mediaEl.style.setProperty('--media-image', imageUrl ? 'url("' + imageUrl.replace(/"/g, '%22') + '")' : 'none');
                mediaTitleEl.textContent = imgTitle;

                if (badge) {
                    mediaBadgeEl.textContent = badge;
                    mediaBadgeEl.setAttribute('status', badgeType);
                    mediaBadgeEl.removeAttribute('hidden');
                } else {
                    mediaBadgeEl.setAttribute('hidden', '');
                }

                mediaEl.removeAttribute('hidden');
            } else {
                mediaEl.setAttribute('hidden', '');
                mediaEl.removeAttribute('style');
            }

            // Title: shown in the shared title slot whenever there's no
            // media banner to host it as an overlay (the media-title
            // element handles that case instead).
            titleEl.textContent = hasMedia ? '' : imgTitle;

            // ── Sub-label ───────────────────────────────────────────────────────
            if (subText) { subEl.textContent = subText; subEl.removeAttribute('hidden'); }
            else { subEl.setAttribute('hidden', ''); }

            // ── Detail rows ─────────────────────────────────────────────────────
            rowsEl.innerHTML = '';
            if (rows.length) {
                rows.forEach(function (row) { rowsEl.append(notificationRow(row.key, row.val)); });
                rowsEl.removeAttribute('hidden');
            } else {
                rowsEl.setAttribute('hidden', '');
            }

            // ── Main body text (backward compat with the old `text` field) ─────
            if (bodyText) {
                var p = document.createElement('p');
                if (payload.isHtml) p.innerHTML = bodyText; else p.textContent = bodyText;
                bodyEl.innerHTML = '';
                bodyEl.append(p);
            } else {
                bodyEl.innerHTML = '';
            }

            // ── Status message box ──────────────────────────────────────────────
            if (msgText) {
                msgEl.innerHTML = msgText;
                if (msgClass) msgEl.setAttribute('variant', msgClass); else msgEl.removeAttribute('variant');
                msgEl.removeAttribute('hidden');
            } else {
                msgEl.setAttribute('hidden', '');
            }

            // ── Admin / secondary note ───────────────────────────────────────────
            if (noteText) { noteEl.textContent = noteText; noteEl.removeAttribute('hidden'); }
            else { noteEl.setAttribute('hidden', ''); }

            // ── Tracking box ──────────────────────────────────────────────────────
            trackingEl.innerHTML = '';
            if (trackingUrl || trackingText) {
                if (trackingUrl) {
                    var link = document.createElement('a');
                    link.href = trackingUrl;
                    link.target = '_blank';
                    link.rel = 'noopener';
                    link.textContent = trackingLabel;
                    trackingEl.append(link);
                } else {
                    trackingEl.append(document.createTextNode(trackingText));
                }
                trackingEl.removeAttribute('hidden');
            } else {
                trackingEl.setAttribute('hidden', '');
            }

            // ── Contact button ──────────────────────────────────────────────────
            if (contactUrl) {
                contactBtn.href = contactUrl;
                contactBtn.textContent = contactText;
                contactBtn.removeAttribute('hidden');
            } else {
                contactBtn.setAttribute('hidden', '');
            }

            // ── Claim button ──────────────────────────────────────────────────────
            hideError();
            if (claim) {
                claimBtn.removeAttribute('hidden');
                setClaimIdle();
                claimBtn.onclick = function () {
                    setClaimLoading();
                    hideError();
                    eventBus.emit('notify:info:claim:start', { data: claimData });
                };
            } else {
                claimBtn.setAttribute('hidden', '');
            }

            show();
        }

        function closeInfo() {
            hideShell();
            mediaEl.setAttribute('hidden', '');
            mediaEl.removeAttribute('style');
            subEl.setAttribute('hidden', '');
            rowsEl.setAttribute('hidden', '');
            msgEl.setAttribute('hidden', '');
            noteEl.setAttribute('hidden', '');
            trackingEl.setAttribute('hidden', '');
            contactBtn.setAttribute('hidden', '');
            setClaimIdle();
            hideError();
            mode = null;
        }

        function setClaimLoading() {
            processing = true;
            claimBtn.setAttribute('loading', '');
            var label = claimBtn.querySelector('nbl-claim-button-label');
            if (label) label.textContent = lbl('claimingLabel') || 'Processing...';
            claimBtn.removeAttribute('error');
        }
        function setClaimIdle() {
            processing = false;
            claimBtn.removeAttribute('loading');
            var label = claimBtn.querySelector('nbl-claim-button-label');
            if (label) label.textContent = lbl('notifyInfoClaimBtn') || 'Claim';
            claimBtn.removeAttribute('error');
        }
        function setClaimError() {
            processing = false;
            claimBtn.removeAttribute('loading');
            var label = claimBtn.querySelector('nbl-claim-button-label');
            if (label) label.textContent = lbl('claimRetryLabel') || 'Try again';
            claimBtn.setAttribute('error', '');
        }
        function showError(msg) {
            errorEl.textContent = msg;
            errorEl.removeAttribute('hidden');
            setTimeout(hideError, 5000);
        }
        function hideError() {
            errorEl.textContent = '';
            errorEl.setAttribute('hidden', '');
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
            // Only react with the reward-code modal if the info-modal claim
            // flow is what triggered this (mode === 'info'). Direct claims
            // from the Rewards tab's list-item button skip the confirm
            // modal entirely and show a toast instead (see click-router.js).
            if (mode !== 'info') return;
            processing = false;
            closeInfo();
            if (eventData && eventData.voucher) openReward(eventData.voucher);
        });

        /** @listens notify:info:claim:prize:success */
        eventBus.on('notify:info:claim:prize:success', function (eventData) {
            processing = false;
            var response = eventData && eventData.response;
            var newPoints = response && Number(response.points);
            if (!isNaN(newPoints)) eventBus.emit('points:update', newPoints);
            if (eventBus.hasListeners('tab:visited:prizes')) loyaltyApp.tab.renderPrizeList();
            if (response && response.claimId && loyaltyApp.customer && loyaltyApp.customer.config) {
                var claims = loyaltyApp.customer.config.prizeClaims || [];
                claims.unshift({ id: response.claimId, physicalPrizeId: response.prizeId || 0, status: 'PENDING', pointsCost: response.pointsCost ? Math.abs(response.pointsCost) : 0 });
                loyaltyApp.customer.config.prizeClaims = claims;
                loyaltyApp.tab.renderHomePrizeRequests();
                if (eventBus.hasListeners('tab:visited:my-prizes')) loyaltyApp.tab.renderMyPrizesTab();
                if (eventBus.hasListeners('tab:visited:prizes')) loyaltyApp.tab.renderPrizesTabActivePrizeList();
            }
            openInfo({
                msg: lbl('prizeClaimSuccessMsg') || '\u2705 Your request has been submitted! We\'ll contact you soon to arrange delivery.',
                claim: false,
            });
        });

        /** @listens notify:info:claim:error */
        eventBus.on('notify:info:claim:error', function (eventData) {
            processing = false;
            setClaimError();
            showError((eventData && eventData.message) || 'Something went wrong. Please try again.');
        });

        // ── Toast (non-blocking, stackable, auto-dismiss) ─────────────────────
        var DEFAULT_TOAST_POSITION = 'bottom-center';
        var DEFAULT_TOAST_DURATION = 4000;

        function getRegion(position) {
            return notifyWrapper.querySelector('nbl-toast-region[position="' + position + '"]')
                || notifyWrapper.querySelector('nbl-toast-region[position="' + DEFAULT_TOAST_POSITION + '"]');
        }

        function pushToast(opts) {
            opts = opts || {};
            var position = opts.position || DEFAULT_TOAST_POSITION;
            var duration = opts.duration != null ? opts.duration : DEFAULT_TOAST_DURATION;
            var region = getRegion(position);
            if (!region) return null;

            var toast = buildToast(opts);
            var dismissTimer = null;
            var remaining = duration;
            var startedAt = 0;
            var progress = null;

            function dismiss() {
                if (dismissTimer) clearTimeout(dismissTimer);
                toast.setAttribute('closing', '');
                toast.addEventListener('animationend', function () { toast.remove(); }, { once: true });
            }

            function startTimer(ms) {
                startedAt = Date.now();
                dismissTimer = setTimeout(dismiss, ms);
            }
            function pauseTimer() {
                if (!dismissTimer) return;
                clearTimeout(dismissTimer);
                dismissTimer = null;
                remaining -= Date.now() - startedAt;
                if (progress) progress.style.animationPlayState = 'paused';
            }
            function resumeTimer() {
                if (dismissTimer || remaining <= 0) return;
                startTimer(remaining);
                if (progress) progress.style.animationPlayState = 'running';
            }

            toast.querySelector('nbl-toast-close').addEventListener('click', dismiss);

            if (duration > 0) {
                progress = buildToastProgress(duration);
                toast.append(progress);
                startTimer(duration);
                toast.addEventListener('mouseenter', pauseTimer);
                toast.addEventListener('mouseleave', resumeTimer);
            }

            region.append(toast);
            return { dismiss: dismiss };
        }

        /**
         * @listens toast:push { variant, title, message, image, position, duration }
         * Additive event — wired so toast notifications can be triggered
         * the same way as modals.
         */
        eventBus.on('toast:push', function (eventData) { pushToast(eventData); });

        loyaltyApp.notify = {
            openReward: openReward,
            closeReward: closeReward,
            openInfo: openInfo,
            closeInfo: closeInfo,
            toast: pushToast,
        };
    });
}

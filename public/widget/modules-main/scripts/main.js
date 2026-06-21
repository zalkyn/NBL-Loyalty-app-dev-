// =============================================================================
// main.js — Entry point for the NBL Loyalty Widget.
// Rollup bundles this into a single IIFE (main.min.js).
//
// Boot sequence:
//   onReady() polls until window.NBL_v1.bus exists, then calls init().
//   init() runs the full boot sequence in order:
//     1. initStore()         — shared state
//     2. initConfig()        — WIDGET_CONFIG + logging
//     3. initApi()           — attach API functions onto loyaltyApp
//     4. initPagination()    — attach pagination engine onto loyaltyApp
//     5. buildHTML()         — inject widget shell into DOM
//     6. applyTheme()        — CSS vars + header effect + theme:applied (sticky)
//     7. initWidget()        — DOM helpers, open/close/nav, points, accordion, chevrons
//     8. initClickRouter()   — global click delegation + bus→action wiring
//     9. initNotifications() — notify:* panels (boots on widget:first-open)
//    10. initReferralModal() — referral modal + URL code detection
//    11. Tab modules         — all lazy, self-register via eventBus
//    12. fireDomLoaded()     — emit dom:loaded, show trigger button
// =============================================================================

import { NBLEventBus } from '../bus.js';
import { initStore } from '../store.js';
import { initConfig } from '../config.js';
import { initApi } from '../api.js';
import { initPagination } from '../pagination.js';
import { buildHTML } from '../html.js';
import { applyTheme } from '../theme.js';
import { initWidget } from '../widget.js';
import { initClickRouter } from '../click-router.js';
import { initNotifications } from '../notifications.js';
import { initReferralModal } from '../referral-modal.js';
import { initHomeTab } from '../tabs/home.js';
import { initEarnTab } from '../tabs/earn.js';
import { initRewardsTab } from '../tabs/rewards.js';
import { initPrizesTab } from '../tabs/prizes.js';
import { initActivitiesTab } from '../tabs/activities.js';
import { initReferralTab } from '../tabs/referral.js';

// ── onReady: polls until window.NBL_v1.bus exists ────────────────────────────

function onReady(fn) {
    if (window.NBL_v1 && window.NBL_v1.bus) { fn(); return; }
    var tries = 0;
    var poll = setInterval(function () {
        if (window.NBL_v1 && window.NBL_v1.bus) { clearInterval(poll); fn(); }
        if (++tries > 100) { clearInterval(poll); }
    }, 50);
}

// ── Main init ─────────────────────────────────────────────────────────────────

function init() {
    var loyaltyApp = window.NBL_v1;
    var appConfig = loyaltyApp.appConfig || {};

    // 1. Store — must be first, everything else reads from it
    initStore(loyaltyApp, appConfig);

    // 2. Config — WIDGET_CONFIG + label overrides + logging setup
    initConfig(loyaltyApp, appConfig);

    // 3. API — attach requestToGetRewardVoucher / requestToClaimPrize onto loyaltyApp
    initApi();

    // 4. Pagination — attach loyaltyApp.pagination engine
    initPagination();

    // 5. HTML — inject widget shell into document.body
    buildHTML();

    // 6. Theme — CSS vars + header effect + emitSticky('theme:applied')
    applyTheme();

    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            var headerElement = document.querySelector('.nbl-widget-header-v1');
            if (headerElement) headerElement.classList.add('nbl-header-ready-v1');
        });
    });

    // 7. Widget — DOM helpers, open/close/toggle, nav, points, accordion, chevrons
    initWidget();

    // 8. Click router — global click delegation + bus→action wiring
    initClickRouter();

    // 9. Notifications — notify:* panels (lazy, boots on widget:first-open)
    initNotifications();

    // 10. Referral modal — URL code detection runs immediately
    initReferralModal();

    // 11. Tab modules — all lazy, self-register via eventBus
    initHomeTab();       // tab:activated dispatcher + home renders + reward:add / activity:add
    initEarnTab();       // tab:activated:points
    initRewardsTab();    // tab:activated:rewards
    initPrizesTab();     // tab:activated:prizes + my-prizes + home prize requests
    initActivitiesTab(); // tab:activated:activities + tab:activated:active-rewards
    initReferralTab();   // tab:activated:referral

    // 12. fireDomLoaded — emit dom:loaded, show trigger button
    function fireDomLoaded() {
        if (loyaltyApp.points == null) {
            var config = loyaltyApp.customer && loyaltyApp.customer.config;
            loyaltyApp.points = config && config.points ? Number(config.points) : 0;
        }

        /** @fires dom:loaded — widget shell is in the DOM, trigger button shown */
        loyaltyApp.bus.emit('dom:loaded', { target: document });

        var triggerButtonWrapper = document.querySelector('.nbl-wo-wrapper-v1');
        if (triggerButtonWrapper) triggerButtonWrapper.classList.remove('nbl-d-none-v1');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fireDomLoaded);
    } else {
        fireDomLoaded();
    }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
// Create bus and attach to NBL_v1, then wait for it to be ready.

window.NBL_v1 = window.NBL_v1 || {};
window.NBL_v1.bus = window.NBL_v1.bus || new NBLEventBus();

onReady(init);
// =============================================================================
// main.preact.jsx — Entry point for the FULLY Preact NBL Loyalty Widget.
// =============================================================================

import { h, render } from 'preact';
import { App } from './App.jsx';
import { buildReferralLink } from './utils.js';

function onReady(fn) {
    if (window.NBL_v1) { fn(); return; }
    var tries = 0;
    var poll = setInterval(function () {
        if (window.NBL_v1) { clearInterval(poll); fn(); }
        if (++tries > 100) { clearInterval(poll); }
    }, 50);
}

// Customer config used to be ONE metafield (customer.configLegacy below).
// It's now split into four independent metafields — core/transactions/
// rewards/prizeClaims (see syncCustomerConfig.js's module-level comment for
// why) — read separately in loyalty.liquid as customer.configCore /
// configTransactions / configRewards / configPrizeClaims.
//
// This stitches whichever pieces exist back into the single `config` shape
// (`{ id, shopifyId, points, referralCode, transactions, rewards,
// prizeClaims }`) the rest of the widget (App.jsx's needsJoin check,
// customerConfig.* below, useConfigResync's onSynced, etc.) already expects
// — so nothing downstream needs to know the metafield is split at all.
//
// Per-field fallback to configLegacy (the old single-blob metafield) covers
// a customer who hasn't had any event — or a resync — fire since this
// rollout shipped: they still have the old metafield and nothing in the new
// ones yet. No bulk migration job needed; the first qualifying event (or
// the periodic resync) for that customer will populate the new metafields,
// and this fallback becomes a no-op for them from then on.
function mergeCustomerConfig(customer) {
    if (!customer) return {};
    var legacy = customer.configLegacy || {};
    var core = customer.configCore || {};
    var tx = customer.configTransactions || {};
    var rw = customer.configRewards || {};
    var pc = customer.configPrizeClaims || {};

    return {
        appName: core.appName || legacy.appName || 'North Borders Loyalty App',
        id: core.id != null ? core.id : legacy.id,
        shopifyId: core.shopifyId || legacy.shopifyId,
        points: core.points != null ? core.points : (legacy.points || 0),
        referralCode: core.referralCode || legacy.referralCode || '',
        transactions: tx.transactions || legacy.transactions || [],
        rewards: rw.rewards || legacy.rewards || [],
        prizeClaims: pc.prizeClaims || legacy.prizeClaims || [],
        // Only ever set by the "core" domain (see syncCustomerConfig.js) —
        // legacy has no equivalent, so no fallback needed: a customer who's
        // never had a "core" sync under this scheme naturally reads as null
        // here, which correctly means "behind" if the shop has an active
        // update version (see computeUpdateStatus below).
        lastSyncedVersionKey: core.lastSyncedVersionKey || null,
    };
}

// Update handling — three modes (widgetConfig.resync.updateMode, Customize >
// Update Notifications):
//   "off"    - nothing.
//   "banner" - show the "update available" banner (customer clicks Update).
//   "auto"   - no banner; the widget silently resyncs + reloads on its own
//              (see App.jsx's useAutoUpdateSync.js).
//
// Either non-"off" mode requires ALL of:
//   1. Mode isn't "off" (Customize > Update Notifications).
//   2. The shop actually has an active ConfigUpdateVersion (appConfig.updateVersion —
//      admin has announced at least one; without this, every customer would
//      wrongly be flagged the moment a mode is picked, with nothing to compare against).
//   3. This customer's own lastSyncedVersionKey doesn't match it.
//
// Zero extra network calls — appConfig (shop metafield) and customerConfig
// (customer's own core metafield) are both already on the page from liquid.
function computeUpdateStatus(widgetConfig, appConfig, customerConfig) {
    var mode = (widgetConfig.resync && widgetConfig.resync.updateMode) || 'off';
    var activeVersion = appConfig.updateVersion;
    if (mode === 'off' || !activeVersion || !activeVersion.key) return { mode: 'off', mismatched: false };
    var mismatched = customerConfig.lastSyncedVersionKey !== activeVersion.key;
    return { mode: mode, mismatched: mismatched };
}

// The banner's TEXT deliberately does NOT come from activeVersion.title/
// description — those are the admin's own internal notes (Version Tracking
// page), shown only in the admin dashboard's history table, never to
// customers. What customers see is the same fixed, generic
// labels.updateBannerTitle/updateBannerDesc every single time, regardless
// of which version is active or what actually changed — see cssVarsConfig.js.
function buildUpdateBanner(widgetConfig) {
    var labels = widgetConfig.labels || {};
    return {
        title: labels.updateBannerTitle || 'Update available',
        description: labels.updateBannerDesc || "We've made a few improvements to your account. Tap Update to see the latest.",
    };
}

function boot() {
    var loyaltyApp = window.NBL_v1;
    var liquidData = loyaltyApp.liquidData || {};
    var appConfig = loyaltyApp.appConfig || {};
    var customer = loyaltyApp.customer || null;
    var customerConfig = mergeCustomerConfig(customer);
    // App.jsx's needsJoin check (and anything else that might read
    // customer.config directly off the customer object rather than through
    // the customerConfig local above) needs this attached — see the
    // mergeCustomerConfig() comment above.
    if (customer) customer.config = customerConfig;

    var savedCssVars = (appConfig.styles && appConfig.styles.cssVars) || {};
    var widgetConfig = (appConfig.styles && appConfig.styles.widgetConfig) || {};
    var updateStatus = (customer && customer.id) ? computeUpdateStatus(widgetConfig, appConfig, customerConfig) : { mode: 'off', mismatched: false };
    var updateBanner = (updateStatus.mode === 'banner' && updateStatus.mismatched) ? buildUpdateBanner(widgetConfig) : null;
    // Consumed by App.jsx's useAutoUpdateSync.js — true only in "auto" mode
    // with a real mismatch, so that hook can fire the silent resync+reload
    // without duplicating any of the mode/version logic above.
    var updateSyncNeeded = updateStatus.mode === 'auto' && updateStatus.mismatched;

    var posFromCssVars = (savedCssVars['--nbl-launcher-position'] || '').toLowerCase();
    var posFromLiquid = (liquidData.buttonPosition || '').toLowerCase();
    var buttonPosition = (posFromCssVars === 'left' || posFromCssVars === 'right')
        ? posFromCssVars
        : (posFromLiquid === 'right' ? 'right' : 'left');

    var isLoggedIn = !!(liquidData.isLoggedIn || (customer && customer.id));
    // customerConfig.points (mergeCustomerConfig() above) is the single
    // source of truth — it already correctly distinguishes "genuinely 0
    // points" from "not synced yet" via a `!= null` check. This used to
    // prefer loyaltyApp.points (NBL_v1.points, computed separately in
    // loyalty.liquid) first, but that duplicate computation had the
    // opposite bug — a truthy check that treated a real 0 as "not synced",
    // silently falling back to the stale legacy metafield instead. Keeping
    // only one computation removes the whole class of "two sources can
    // disagree" bug, not just this one instance of it.
    var points = customerConfig.points || 0;

    var referralConfig = widgetConfig.referral || {};
    var referralLink = buildReferralLink(liquidData.shopUrl, referralConfig.linkPath, liquidData.referralCode);

    // ── Guest auth links — purono html.js guestBodyHTML()-er loginUrl/signupUrl
    //    derivation-er shathe match kore (shop-er account routes, fallback shadharon path).
    var routes = loyaltyApp.routes || {};
    var loginUrl = routes.login_url || '/account/login';
    var signupUrl = routes.register_url || '/account/register';

    var initialData = {
        isLoggedIn: isLoggedIn,
        customerName: (customer && customer.name) || liquidData.customerName || '',
        points: points,
        buttonPosition: buttonPosition,
        launcherIconName: (savedCssVars['--nbl-launcher-icon'] || '').replace(/^'|'$/g, ''),
        cssVars: savedCssVars,
        appConfig: appConfig,
        customer: customer,
        widgetConfig: widgetConfig,
        referralLink: referralLink,
        shopUrl: liquidData.shopUrl || '',
        loginUrl: loginUrl,
        signupUrl: signupUrl,
        rewardRules: appConfig.rewardRules || [],
        physicalPrizes: appConfig.physicalPrizes || [],
        pointRules: appConfig.pointRules || [],
        customerRewards: customerConfig.rewards || [],
        prizeClaims: customerConfig.prizeClaims || [],
        transactions: customerConfig.transactions || [],
        updateBanner: updateBanner,
        updateSyncNeeded: updateSyncNeeded,
        // App Proxy path — used for the toast-notification fetch/mark-seen
        // calls in addition to anything else that needs a live server call.
        proxyPath: loyaltyApp.proxyPath || '/apps/widget',
    };

    // ── Bridge ref — preview-bridge.js / customize panel-er sathe communicate korbe.
    // App.jsx mount-er pore ekhane setScene/setCssVars/setWidgetConfig inject hobe.
    var bridgeRef = {};
    window.NBL_v1.__bridge = bridgeRef;

    // ── Shadow DOM host — bahirer theme CSS vitore ashbe na, ar amader
    //    ui.css bahire leak korbe na. `host`-i ekmatro element jeta light
    //    DOM-e thake; baki shob shadow tree-r vitore.
    var host = document.createElement('div');
    document.body.appendChild(host);
    var shadowRoot = host.attachShadow({ mode: 'open' });

    var styleEl = document.createElement('style');
    // __NBL_CSS_TEXT__ — build.js-e esbuild `define` diye inject kora
    // minified ui.css string (dekho build.js). :root ui.css-e :host-e
    // convert kora hoyeche, karon :root shadow tree-r bhitor match kore na.
    styleEl.textContent = __NBL_CSS_TEXT__;
    shadowRoot.appendChild(styleEl);

    var mountPoint = document.createElement('div');
    shadowRoot.appendChild(mountPoint);

    try {
        render(<App initialData={initialData} bridgeRef={bridgeRef} hostEl={host} />, mountPoint);
    } catch (err) {
        // Deliberately NOT silent — an exception here means the widget
        // fails to render entirely (shadow root + stylesheet still get
        // attached above, so it can look like "nothing's wrong" in the DOM
        // inspector while the actual component tree never mounts). Logging
        // this is what makes that kind of failure visible instead of
        // silently invisible.
        // eslint-disable-next-line no-console
        console.error('[NBL] boot(): render() threw an exception:', err);
    }
}

onReady(boot);
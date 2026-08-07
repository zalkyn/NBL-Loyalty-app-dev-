// =============================================================================
// main.preact.jsx — Entry point for the FULLY Preact NBL Loyalty Widget.
// =============================================================================

import { h, render } from 'preact';
import { App } from './App.jsx';
import { buildReferralLink } from './utils.js';
import { applyLauncherModeAttrs } from './launcherMode.js';

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

// ── Dedicated-page mount discovery ──────────────────────────────────────────
// blocks/loyalty-page.liquid (the theme app BLOCK, added to a merchant's own
// page in the theme editor) renders an empty target element and registers it
// on NBL_v1.pageMount from an inline script. That inline script runs during
// HTML parsing, i.e. always before this deferred bundle executes, so by the
// time boot() calls this the registration is guaranteed to be there if the
// block is on the page at all.
//
// The bundle itself is still loaded by the app EMBED block (loyalty.liquid)
// exactly as before — that's also what supplies appConfig/customer/routes.
// The page block deliberately loads no script of its own: two <script
// src="...same-file"> tags would execute the bundle twice, and everything
// downstream (shadow host, event listeners, resync timers) would be
// duplicated. One bundle, one boot, two possible mount targets.
//
// The attribute lookup is a fallback for the same reason findPageMount()
// exists at all rather than being inlined: if a merchant hand-places the
// target element (documented as the escape hatch for themes whose page
// template doesn't accept @app blocks), there's no inline registration to
// read, just the element.
// ── Page mode: pin the block to the theme's own content width ───────────────
// The CSS-only approach was tried at length and is recorded in ui.css and
// loyalty-page.liquid so it isn't retried: `width: 100%`, a definite length,
// `100vw`, `stretch`, `align-self: stretch`, a container query. Each depends
// on how a particular theme sizes the element it puts our block into, and
// section layouts vary more than any of those assumptions survive. The
// symptom is always the same — the block sizes to its own contents, so the
// merchant's Width setting does nothing, Alignment has no free space to work
// in, and on a phone it either overflows or disappears.
//
// So stop inferring the available width and read it off the element the theme
// itself uses to bound content. Every Shopify theme has one within a few
// levels: Horizon's `.section-content-wrapper`, or failing that the enclosing
// `.shopify-section`, `<section>` or `<main>`.
//
// NARROWEST match wins, not nearest. A page has several of these nested, and
// the full-bleed `.shopify-section` is as much a match as the padded content
// column inside it — taking the smallest is what picks the column, and it's
// what an earlier "first ancestor wider than us" version got wrong (on a
// full-bleed grid that ancestor IS the full-bleed grid, so the widget
// rendered at viewport width).
var CONTENT_ANCESTORS = '.section-content-wrapper, .shopify-section, section, main';
var MIN_SENSIBLE_PX = 200;

function measureThemeContentWidth(mountEl) {
    var el = mountEl.parentElement;
    var hops = 0;
    var best = null;
    while (el && hops < 30) {
        if (el.matches && el.matches(CONTENT_ANCESTORS)) {
            var cs = window.getComputedStyle(el);
            var inner = el.clientWidth
                - (parseFloat(cs.paddingLeft) || 0)
                - (parseFloat(cs.paddingRight) || 0);
            // Ignore anything implausibly small: that ancestor has collapsed
            // for the same reason we did and would only propagate the fault.
            if (inner >= MIN_SENSIBLE_PX && (best === null || inner < best.width)) {
                best = { el: el, width: inner };
            }
        }
        el = el.parentElement;
        hops++;
    }
    return best;
}

function installPageWidthSync(host, mountEl) {
    var announced = false;
    var teardown = null;

    function sync() {
        // Release first. A pinned pixel width makes every ancestor that sizes
        // to its contents report OUR number back to us, so without this the
        // measurement latches onto its own previous answer and can never
        // shrink again when the window does.
        host.style.width = '';
        var found = measureThemeContentWidth(mountEl);
        if (!found) return; // nothing recognisable to measure — leave the CSS to it
        host.style.width = found.width + 'px';

        if (!announced) {
            announced = true;
            if (window.NBL_v1.debug) {
                // eslint-disable-next-line no-console
                console.log('[NBL] page width ' + Math.round(found.width) + 'px from '
                    + (found.el.className || found.el.tagName));
            }
        }
        return found.el;
    }

    var target = sync();
    // Once more after paint: web fonts and lazily-applied theme CSS can change
    // the column's width, and a first measurement taken before that settles
    // would be stale for the rest of the page's life.
    window.requestAnimationFrame(sync);

    if (typeof ResizeObserver !== 'undefined' && target) {
        var scheduled = false;
        var observer = new ResizeObserver(function () {
            if (scheduled) return;
            // One measurement per frame. sync() writes to host.style.width,
            // which the observer would otherwise see as a fresh resize and
            // re-enter on.
            scheduled = true;
            window.requestAnimationFrame(function () {
                scheduled = false;
                sync();
            });
        });
        observer.observe(target);
        teardown = function () { observer.disconnect(); };
    } else {
        window.addEventListener('resize', sync);
        teardown = function () { window.removeEventListener('resize', sync); };
    }

    // __remount (theme editor) throws this host away and boots a fresh one on
    // every setting change. Without a teardown the observer outlives it —
    // still firing, still writing a width onto a node that is no longer in the
    // document — and a merchant nudging a slider accumulates one per edit.
    window.NBL_v1.__pageWidthCleanup = teardown;

    // One command for a merchant or developer to run when the block still
    // doesn't line up: prints the full ancestor chain with widths, so the next
    // report contains the measurement instead of a screenshot to reason from.
    window.NBL_v1.__debugPageWidth = function () {
        var rows = [];
        var el = mountEl.parentElement;
        var hops = 0;
        while (el && el !== document.documentElement && hops < 30) {
            var cs = window.getComputedStyle(el);
            rows.push({
                tag: el.tagName.toLowerCase(),
                classes: String(el.className || '').slice(0, 80),
                clientWidth: el.clientWidth,
                paddingX: (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0),
                display: cs.display,
                flexDirection: cs.flexDirection,
                alignItems: cs.alignItems,
                justifyItems: cs.justifyItems,
                matchesContentAncestor: !!(el.matches && el.matches(CONTENT_ANCESTORS)),
            });
            el = el.parentElement;
            hops++;
        }
        // eslint-disable-next-line no-console
        console.table(rows);
        return rows;
    };
}

function findPageMount() {
    var registered = window.NBL_v1 && window.NBL_v1.pageMount;
    var el = null;
    if (registered && registered.selector) {
        try {
            el = document.querySelector(registered.selector);
        } catch (e) {
            el = null; // malformed selector — fall through to the attribute lookup
        }
    }
    if (!el) el = document.querySelector('[data-nbl-page-mount]');
    return el;
}

function boot() {
    // A second boot would mount a second full widget — its own shadow root,
    // its own resync timers, its own toast stack. Cheap to guard, and the
    // guard is what makes it safe for the page block to exist on a page that
    // also has the app embed enabled (which it always does).
    if (window.NBL_v1.__booted) return;
    window.NBL_v1.__booted = true;

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

    // Non-null only on the merchant's dedicated loyalty page. Resolved once,
    // before render, because it decides both the mount target below AND the
    // widget's whole mode — deferring it would mean a first paint in the
    // wrong mode, i.e. a visible flash of the floating launcher on a page
    // that's about to render the widget inline instead.
    var pageMountEl = findPageMount();

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
        // 'floating' (launcher + panel, every storefront page) or 'page'
        // (rendered inline inside the merchant's own page). Decided once,
        // here, by which DOM node the widget mounted into — App.jsx treats it
        // as immutable for the lifetime of the page, which it is.
        mode: pageMountEl ? 'page' : 'floating',
        // True only inside the admin's Live Preview iframe, which sets this
        // flag from public/widget/preview-moc-config.js. It cannot be derived
        // from bridgeRef: that object is created unconditionally a few lines
        // below, in BOTH builds, because the storefront bundle and the
        // preview bundle are the same file (build.js emits one source twice).
        // Anything testing `!!bridgeRef` is therefore always true and is a bug.
        isPreview: !!loyaltyApp.__isPreview,
    };

    // ── Bridge ref — preview-bridge.js / customize panel-er sathe communicate korbe.
    // App.jsx mount-er pore ekhane setScene/setCssVars/setWidgetConfig inject hobe.
    var bridgeRef = {};
    window.NBL_v1.__bridge = bridgeRef;

    // ── Shadow DOM host — bahirer theme CSS vitore ashbe na, ar amader
    //    ui.css bahire leak korbe na. `host`-i ekmatro element jeta light
    //    DOM-e thake; baki shob shadow tree-r vitore.
    var host = document.createElement('div');
    // Light-DOM id only — purely a liquid/CSS hook (e.g. hiding the widget
    // on specific pages via page/page_suffix conditions). Setting an id on
    // `host` never touches anything inside the shadow tree below it.
    host.id = 'nbl-widget-host';
    if (pageMountEl) {
        // In page mode the host is a normal in-flow block inside the
        // merchant's page, so it needs real layout properties — the floating
        // host never did, since everything inside it was position:fixed.
        // Set inline rather than in ui.css: ui.css lives INSIDE the shadow
        // root and can't reach its own host element from there.
        host.style.display = 'block';
        // Plain 100%. The host establishes no width of its own — it passes
        // through whatever the block wrapper gives it, and the wrapper is
        // stretched to the section's content column by loyalty-page.liquid's
        // align-self/justify-self. The widget container inside then fills the
        // host and caps at the merchant's setting.
        //
        // Two things were tried here and are recorded so they aren't tried
        // again: `100vw` (starves fr-track gutters to zero, so the block went
        // edge-to-edge past the theme's margins) and `stretch` /
        // -webkit-fill-available (fills the containing block's available
        // space, which in a chain that has already collapsed is nothing — the
        // widget rendered as a 0px sliver). Neither was addressing the actual
        // cause, which was one level up in the light DOM.
        host.style.width = '100%';
        pageMountEl.appendChild(host);
    } else {
        document.body.appendChild(host);
    }
    var shadowRoot = host.attachShadow({ mode: 'open' });

    // ── Theme vars — apply SYNCHRONOUSLY, before render() ───────────────────
    // savedCssVars is already available here (came straight off the shop
    // metafield via liquid, no network call). Previously these were only
    // applied inside App.jsx's useApplyTheme() useEffect — which Preact/React
    // always runs AFTER the first paint. That gap is normally sub-frame and
    // invisible, but on a cold/hard reload (JS bundle download+parse, the
    // onReady() 50ms poll, etc. all competing for the main thread) it stretches
    // into a visible flash: launcher button renders once with ui.css's
    // hardcoded :host defaults, then visibly snaps to the merchant's actual
    // theme a moment later. Setting the vars on `host` here — before `render()`
    // is ever called — means the very first paint already has the correct
    // theme, so there's nothing to flash. useApplyTheme()'s effect still runs
    // afterwards too; that's now just a harmless no-op re-application for the
    // initial load, and remains the mechanism for any future non-boot call site.
    if (savedCssVars && typeof savedCssVars === 'object') {
        Object.keys(savedCssVars).forEach(function (prop) {
            if (prop.indexOf('--') === 0) {
                host.style.setProperty(prop, savedCssVars[prop]);
            }
        });
    }

    // Same reasoning as the loop above, for the launcher's compact/badge mode
    // (see launcherMode.js). These decide the launcher's whole shape, so
    // applying them late would be the most visible flash of the lot: a full
    // pill painting first and collapsing to an icon a frame later. Set before
    // the stylesheet is even attached, so the first paint is already correct.
    applyLauncherModeAttrs(host, savedCssVars);

    var styleEl = document.createElement('style');
    // __NBL_CSS_TEXT__ — build.js-e esbuild `define` diye inject kora
    // minified ui.css string (dekho build.js). :root ui.css-e :host-e
    // convert kora hoyeche, karon :root shadow tree-r bhitor match kore na.
    styleEl.textContent = __NBL_CSS_TEXT__;
    shadowRoot.appendChild(styleEl);

    var mountPoint = document.createElement('div');
    shadowRoot.appendChild(mountPoint);

    // ── Theme-editor remount hook ───────────────────────────────────────────
    // When a merchant adds/moves/edits this app block, Shopify re-renders
    // just that section via the Section Rendering API — no page reload, so
    // this bundle never runs again. Without a way back in, the merchant adds
    // the block, sees an empty box where the widget should be, and has no
    // reason to suspect that refreshing the preview would fix it. That's the
    // first thing they'd hit, and it looks exactly like a broken app.
    //
    // loyalty-page.liquid calls this from its own inline script (which DOES
    // re-execute on section re-render), design-mode only. Storefront visitors
    // never touch it.
    //
    // render(null, ...) first, not just removing the node: unmounting is what
    // runs the effect cleanups, and those own the resync interval, the scroll
    // and wheel listeners and the toast timers. Detaching the host alone
    // would leave every one of them running against a dead tree, once per
    // edit, for as long as the editor session lasts.
    window.NBL_v1.__host = host;
    window.NBL_v1.__mountPoint = mountPoint;
    window.NBL_v1.__remount = function () {
        var prevMount = window.NBL_v1.__mountPoint;
        var prevHost = window.NBL_v1.__host;
        // Before anything else — see installPageWidthSync.
        if (typeof window.NBL_v1.__pageWidthCleanup === 'function') {
            window.NBL_v1.__pageWidthCleanup();
            window.NBL_v1.__pageWidthCleanup = null;
        }
        try {
            if (prevMount) render(null, prevMount);
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[NBL] remount: unmount failed, continuing', err);
        }
        if (prevHost && prevHost.parentNode) prevHost.parentNode.removeChild(prevHost);
        window.NBL_v1.__booted = false;
        boot();
    };

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

    // Page mode only. See installPageWidthSync's note for why this is measured
    // rather than left to CSS.
    if (pageMountEl) installPageWidthSync(host, pageMountEl);
}

onReady(boot);
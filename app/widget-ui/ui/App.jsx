// =============================================================================
// app/widget-ui/ui/App.jsx
// Root component — sob state ekhane. Purono widget.js + html.js + store.js +
// bus.js + notifications.js + click-router.js (claim/prize-detail part)-er
// shared replacement.
// =============================================================================

import { h, Fragment } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { icon } from './icons.js';
import { formatNumber, buildReferralLink } from './utils.js';
import { LauncherButton } from './components/LauncherButton.jsx';
import { WidgetShell } from './components/WidgetShell.jsx';
import { UpdateBanner } from './components/UpdateBanner.jsx';
import { GuestPanel } from './components/GuestPanel.jsx';
import { JoinProgramPanel } from './components/JoinProgramPanel.jsx';
import { NotificationPanel } from './components/NotificationPanel.jsx';
import { ImagePreviewOverlay } from './components/ImagePreviewOverlay.jsx';
import { ReferralModal } from './components/ReferralModal.jsx';
import { ToastStack } from './components/ToastStack.jsx';
import { useReferralModal } from './hooks/useReferralModal.js';
import { useCustomerProvision } from './hooks/useCustomerProvision.js';
import { useJoinProgram } from './hooks/useJoinProgram.js';
import { useConfigResync } from './hooks/useConfigResync.js';
import { useApplyTheme } from './hooks/useApplyTheme.js';
import { useToastNotifications } from './hooks/useToastNotifications.js';
import { useUpdateBanner } from './hooks/useUpdateBanner.js';
import { useAutoUpdateSync } from './hooks/useAutoUpdateSync.js';
import { HomeTab } from './tabs/HomeTab.jsx';
import { EarnTab } from './tabs/EarnTab.jsx';
import { RewardsTab } from './tabs/RewardsTab.jsx';
import { PrizesTab } from './tabs/PrizesTab.jsx';
import { ReferralTab } from './tabs/ReferralTab.jsx';
import { ActivitiesTab } from './tabs/ActivitiesTab.jsx';
import { ActiveRewardsTab } from './tabs/ActiveRewardsTab.jsx';
import { MyPrizesTab } from './tabs/MyPrizesTab.jsx';
import { requestRewardVoucher, requestClaimPrize } from './api.js';

function TabPanel({ tabKey, activeTab, children }) {
    return (
        <div class={`nbl-tab-panel${activeTab === tabKey ? ' active' : ''}`} data-tab={tabKey}>
            {activeTab === tabKey ? children : null}
        </div>
    );
}

function fmtDate(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
        return '';
    }
}

export function App({ initialData, bridgeRef, hostEl }) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('home');
    const [points, setPoints] = useState(Number(initialData.points) || 0);

    // ── Data state — purono appConfig/customer.config-er jaiga ───────────────
    const [rewardRules] = useState(initialData.rewardRules || []);
    const [physicalPrizes] = useState(initialData.physicalPrizes || []);
    const [pointRules] = useState(initialData.pointRules || []);
    const [customerRewards, setCustomerRewards] = useState(initialData.customerRewards || []);
    const [prizeClaims, setPrizeClaims] = useState(initialData.prizeClaims || []);
    const [transactions, setTransactions] = useState(initialData.transactions || []);

    // ── Notification (reward panel / info panel) state ───────────────────────
    const [notification, setNotification] = useState(null);
    const [claimState, setClaimState] = useState('idle');
    const [claimErrorMsg, setClaimErrorMsg] = useState('');
    // True when the last claim attempt was blocked specifically because the
    // customer has a pending update (backend returned code
    // 'UPDATE_REQUIRED' — see checkUpdateRequired.js). Changes the action
    // button in NotificationPanel from "Try again" (retry the same claim,
    // which would just fail again the same way) to "Update" (run the same
    // sync-then-reload flow as the top banner's button — see
    // handleUpdateClick below).
    const [claimNeedsUpdate, setClaimNeedsUpdate] = useState(false);

    // ── Image preview (full-size view from any viewable Image) state ─────────
    const [previewImage, setPreviewImage] = useState(null);

    const isLoggedIn = !!initialData.isLoggedIn;
    const customerName = initialData.customerName || '';
    // useState (not const) — the preview bridge needs to update these live as
    // the merchant tweaks position/icon in the dashboard, before saving.
    // Production never calls the bridge (bridgeRef is undefined there), so
    // these just keep their initial value for the lifetime of the page,
    // exactly as before.
    const [position, setPosition] = useState(initialData.buttonPosition === 'right' ? 'right' : 'left');
    const [launcherIconName, setLauncherIconName] = useState(initialData.launcherIconName || '');
    const appConfig = initialData.appConfig || {};
    const customer = initialData.customer || null;
    // widgetConfig state-e rakha hoycе — bridge setWidgetConfig() call korle
    // re-render trigger hobe, label/show*Section/perPage sob live update pabe.
    const [widgetConfig, setWidgetConfig] = useState(initialData.widgetConfig || {});
    const prizeConfig = widgetConfig.prize || {};
    const currencySymbol = (appConfig.shop && appConfig.shop.currencySymbol) || '$';
    const [referralLink, setReferralLink] = useState(initialData.referralLink || '');
    const shopUrl = initialData.shopUrl || '';
    const loginUrl = initialData.loginUrl || '/account/login';
    const signupUrl = initialData.signupUrl || '/account/register';
    const paginationMode = widgetConfig.paginationMode === 'pagination' ? 'pagination' : 'loadmore';

    // lbl() — widgetConfig.labels theke key lookup kore.
    // Prop hisebe pass kora lbl() ta window.NBL_v1 direct read korto — state
    // change-e re-derive hoto na. Ekhon widgetConfig state theke derive kori.
    function lbl(key) {
        var labels = widgetConfig && widgetConfig.labels;
        return (labels && labels[key]) || '';
    }

    // App Proxy base path (e.g. "/apps/widget") — every widget API call goes
    // through this, never the app's own backend domain. Declared before the
    // hooks below since both now call the backend exclusively via this path.
    const proxyPath = initialData.proxyPath || '/apps/widget';

    // ── "Update available" banner — see useUpdateBanner.js for the full
    //    state/logic (extracted out of this file, same pattern as
    //    useReferralModal.js) and main.preact.jsx's computeUpdateStatus()
    //    for the (admin flag + active version + customer mismatch)
    //    condition that decides whether initialData.updateBanner is
    //    non-null in the first place.
    const {
        updateBanner, effectiveUpdateBanner, updateDismissed, updateLoading, updateErrorMsg,
        handleUpdateClick, dismiss: dismissUpdateBanner, resetDismiss: resetUpdateBannerDismiss, setPreviewUpdateBanner,
    } = useUpdateBanner({ initialUpdateBanner: initialData.updateBanner, proxyPath, onSynced: applySyncedConfig });

    // Shopify customer id — needed by useCustomerProvision (below) and now
    // also useReferralModal (to scope its localStorage cache per-account,
    // see referralCache.js), so it's derived before both instead of down
    // near needsJoin where it used to live.
    const shopifyCustomerId = customer && customer.id;

    const { provisioning, provisionNeeded, inFlight, failed: provisionFailed } = useCustomerProvision({ isLoggedIn, customer, widgetConfig, proxyPath });
    const referralConfig = widgetConfig.referral || {};
    const refModal = useReferralModal({ isLoggedIn, proxyPath, provisioning: inFlight, provisionNeeded, customerId: shopifyCustomerId, redirectUrl: referralConfig.redirectUrl, redirectEnabled: referralConfig.redirectEnabled });

    // ── Explicit "Join our program" step ──────────────────────────────────────
    // Two distinct ways to land here:
    //   1. autoProvisionCustomer is OFF (default) — merchant wants an
    //      explicit opt-in click instead of a silent background join.
    //      needsJoin is true from the very first render in this case.
    //   2. autoProvisionCustomer is explicitly turned ON but the silent
    //      attempt failed (backend unreachable, timeout, error response) —
    //      useCustomerProvision never shows an alarming error itself, it
    //      just exposes `failed`; this becomes true only after that attempt
    //      settles, so the customer sees the provisioning spinner first and
    //      this panel only appears if that genuinely didn't work out —
    //      instead of silently landing on a broken widget (0 points, empty
    //      referral link) with no explanation or way to retry.
    //
    // hasConfig is real React state (not derived straight from `customer`,
    // which is a plain const from initialData and never reassigned) purely
    // so a successful explicit Join (below) can flip it after the fact —
    // that's what lets needsJoin/isMember switch the widget straight to
    // the normal member view without a page reload.
    const [hasConfig, setHasConfig] = useState(!!(customer && customer.config && customer.config.id));
    const autoProvisionEnabled = widgetConfig.autoProvisionCustomer === true;
    const needsJoin = !!(
        isLoggedIn
        && shopifyCustomerId
        && !hasConfig
        && (!autoProvisionEnabled || provisionFailed)
    );
    // Only meaningful when needsJoin is true via path 2 above — lets
    // JoinProgramPanel soften its copy ("we couldn't set this up
    // automatically") instead of the generic first-time wording.
    const joinFromAutoFailure = autoProvisionEnabled && provisionFailed;
    // No page reload on success — join-program.jsx now returns the fresh
    // config, so onJoined patches state (applySyncedConfig, defined below —
    // safe to reference here since it's hoisted, see App.jsx's own comment
    // on applySyncedConfig) and flips hasConfig, same "resync response
    // already has everything" reasoning as the update-sync hooks above.
    const joinProgram = useJoinProgram({
        proxyPath,
        onJoined: function (config) {
            applySyncedConfig(config);
            setHasConfig(true);
        },
    });
    useApplyTheme(initialData.cssVars, hostEl);

    // Admin Customize > Widget Config > New Customer Onboarding live
    // preview override — see bridgeRef.setScene's 'join-program' case
    // below. null means "no override, use the real needsJoin computed
    // above"; true/false force the panel on/off regardless of the mock
    // preview customer's real config state, same override pattern
    // useUpdateBanner.js uses for the update banner (setPreviewUpdateBanner).
    const [previewJoinProgram, setPreviewJoinProgram] = useState(null);
    const effectiveNeedsJoin = previewJoinProgram !== null ? previewJoinProgram : needsJoin;

    // isLoggedIn means "authenticated with Shopify" — true even before the
    // customer has actually joined the loyalty program (needsJoin state).
    // isMember additionally requires NOT needing the join step, and is
    // what the chrome around the tab content (nav, "Welcome {name}" +
    // points header, launcher subtitle) should key off — otherwise a
    // customer sees a personalized nav/points header while the widget
    // body itself is still asking them to join, which doesn't make sense.
    // JoinProgramPanel intentionally shares GuestPanel's full-bleed layout
    // (see WidgetShell below), so treating needsJoin like the guest case
    // here is consistent, not a special case.
    const isMember = isLoggedIn && !effectiveNeedsJoin;

    // ── Tiny non-blocking sync indicator (Header.jsx's .nbl-header__sync-
    //    indicator) — shared by both background sync paths below. Kept as
    //    plain boolean state, not tied to which specific path is running,
    //    since the customer-facing cue is the same either way ("something
    //    is quietly updating"), not which mechanism triggered it.
    // Ref-counted, not a plain boolean — useConfigResync and useAutoUpdateSync
    // both drive this via onSyncingChange(true/false), and in the (rare but
    // real) case both are in flight at once — a version-mismatch sync AND
    // the periodic hygiene sync both due on the same mount — a plain shared
    // boolean would go false the moment EITHER one finishes, hiding the
    // indicator while the other is still genuinely syncing. Counting active
    // callers instead means it only clears once both have settled.
    const [syncCount, setSyncCount] = useState(0);
    const syncing = syncCount > 0;
    function trackSyncing(active) {
        setSyncCount((c) => Math.max(0, c + (active ? 1 : -1)));
    }
    const showSyncIndicator = (widgetConfig.resync && widgetConfig.resync.showSyncIndicator) !== false;

    // ── Shared "apply a freshly-synced customer config to local state"
    //    helper — used by all three resync paths (periodic hygiene sync
    //    below, the manual Update-banner click, and auto-sync mode) so
    //    they patch state identically instead of three near-duplicate
    //    inline callbacks. None of these reload the page anymore — see
    //    useUpdateBanner.js / useAutoUpdateSync.js for why: the resync
    //    endpoint only ever returns this customer's OWN config (points/
    //    rewards/transactions/prizeClaims/referralCode/lastSyncedVersionKey),
    //    never shop-level data (reward rules, styles, labels) — so patching
    //    exactly these fields is already complete, not a partial shortcut.
    //    Shop-level data staying fresh is normal storefront/liquid
    //    behavior (next navigation or reload), unrelated to this sync path.
    function applySyncedConfig(config) {
        if (typeof config.points === 'number') setPoints(config.points);
        if (Array.isArray(config.rewards)) setCustomerRewards(config.rewards);
        if (Array.isArray(config.prizeClaims)) setPrizeClaims(config.prizeClaims);
        if (Array.isArray(config.transactions)) setTransactions(config.transactions);
        if (config.referralCode) {
            setReferralLink(buildReferralLink(shopUrl, referralConfig.linkPath, config.referralCode));
        }
    }

    // ── Periodic background config resync ──────────────────────────────────────
    // Only for customers who are actually fully set up (isMember) — nothing
    // to resync for a guest or a customer still on the join step. See
    // useConfigResync.js for the throttling/circuit-breaker rationale.
    useConfigResync({
        isMember,
        proxyPath,
        customerId: shopifyCustomerId,
        onSynced: applySyncedConfig,
        onSyncingChange: trackSyncing,
    });

    // ── Auto-sync mode for the update-version feature — see
    //    useAutoUpdateSync.js. Only ever fires when Customize > Update
    //    Notifications is set to "Auto-sync" AND this customer's own
    //    config is actually behind (initialData.updateSyncNeeded, computed
    //    server/liquid-side in main.preact.jsx's computeUpdateStatus()).
    //    In "banner" mode this is always false and the hook is a no-op —
    //    the banner (useUpdateBanner above) handles it via manual click
    //    instead.
    useAutoUpdateSync({
        isMember,
        needed: initialData.updateSyncNeeded,
        proxyPath,
        customerId: shopifyCustomerId,
        onSynced: applySyncedConfig,
        onSyncingChange: trackSyncing,
    });

    // ── Toast notifications (unseen transactions from since the customer's
    //    last visit) — derived client-side from `transactions` (already on
    //    the page via the customer metafield), hidden while widget is open.
    //    See hooks/useToastNotifications.js for why this isn't a fetch().
    const {
        toasts,
        moreCount: toastsMoreCount,
        dismissToast,
        expandToasts,
        clearAll: clearToasts,
    } = useToastNotifications({
        isLoggedIn,
        enabled: widgetConfig.enableToastNotifications,
        transactions,
        customerId: customer && customer.id,
        proxyPath,
        isPreview: !!bridgeRef,
    });

    // ── Preview-only dummy toasts (admin "Toast Notifications" customize
    //    section). Real toasts derive from unseen transactions, which a
    //    merchant won't have on the preview — so the bridge injects a fixed
    //    sample set and forces the stack visible regardless of isOpen.
    const [previewToasts, setPreviewToasts] = useState(null);
    const isPreviewToast = previewToasts !== null;
    const effectiveToasts = isPreviewToast ? previewToasts : toasts;
    const effectiveToastsMore = isPreviewToast ? 0 : toastsMoreCount;

    // ── Bridge injection — preview only, production-e bridgeRef undefined ─────
    // App mount-er pore window.NBL_v1.__bridge-e imperative API inject kori.
    // preview-bridge.js whenBridgeReady() polling diye wait kore, then call kore.
    useEffect(function () {
        if (!bridgeRef) return;

        // Scene switch: launcher(close) / home / earn->points / rewards /
        //               prizes / referral / activities / modal / notification-*
        bridgeRef.setScene = function (scene) {
            // Any non-toast scene clears the dummy toast preview.
            if (scene !== 'notification-toast') setPreviewToasts(null);
            // Any non-banner scene clears the dummy update-banner preview.
            if (scene !== 'notification-update-banner') setPreviewUpdateBanner(null);
            // Any non-join scene clears the join-panel override, so
            // switching to a different Customize section always falls back
            // to the real needsJoin computed from the mock preview
            // customer (which has a full config, so normally shows the
            // regular member dashboard) — see previewJoinProgram above.
            if (scene !== 'join-program') setPreviewJoinProgram(null);
            // Referral modal opened via the 'modal' scene (see below) stays
            // open otherwise — nothing else in this function closes it, so
            // switching to any other Customize/Labels section would leave
            // it stuck overlaying whatever's selected next. Called
            // unconditionally (no .isOpen check) because this closure is
            // defined once at mount (see the empty deps array below) and
            // would otherwise only ever see refModal's stale, mount-time
            // isOpen value — closeModal() is a harmless no-op when already
            // closed.
            if (scene !== 'modal') refModal.closeModal();

            if (scene === 'notification-toast') {
                setIsOpen(false);
                setPreviewToasts([
                    { id: 'preview-1', type: 'EARN', activity: 'You earned 150 points' },
                    { id: 'preview-2', type: 'REDEEM', activity: 'Reward unlocked: $10 off' },
                    { id: 'preview-3', type: 'REFERRAL', activity: 'Your friend joined — +200 points' },
                ]);
                return;
            }
            if (scene === 'notification-update-banner') {
                setIsOpen(true);
                setActiveTab('home');
                resetUpdateBannerDismiss();
                // Fixed demo text — deliberately NOT the real
                // labels.updateBannerTitle/Desc lookup (widgetConfig here IS
                // live-updated from the Advanced tab's OTHER color fields, but
                // the actual customer-facing text lives on the separate Labels
                // & Text tab and isn't necessarily loaded/relevant in this
                // preview context) or any real version data. Same demo-data
                // principle as the toast preview above.
                setPreviewUpdateBanner({
                    title: 'Update available',
                    description: "We've made a few improvements to your account. Tap Update to see the latest.",
                });
                return;
            }
            if (scene === 'join-program') {
                // Admin Customize > Widget Config > New Customer Onboarding
                // preview — forces the Join panel on regardless of the mock
                // customer's real config, so a merchant can see what it
                // looks like without needing an actual not-yet-joined test
                // customer. Cleared automatically the moment any other
                // section/scene is selected (see the top of this function).
                setIsOpen(true);
                setActiveTab('home');
                setPreviewJoinProgram(true);
                return;
            }
            if (scene === 'launcher') {
                setIsOpen(false);
                setActiveTab('home');
                return;
            }
            if (scene === 'modal') {
                refModal.openModal();
                return;
            }
            if (scene === 'notification-reward') {
                openReward('PREVIEW15OFF');
                return;
            }
            if (scene === 'notification-info') {
                openInfo({
                    text: 'Earn 100 points when your friend places their first order. Your friend gets 10% off their first purchase.',
                    claim: true,
                    claimLabel: 'Claim',
                    data: null,
                });
                return;
            }
            // Customize panel-er scene name -> data-tab value map
            var TAB_MAP = {
                home: 'home',
                earn: 'points',
                rewards: 'rewards',
                prizes: 'prizes',
                referral: 'referral',
                activities: 'activities',
            };
            setIsOpen(true);
            setActiveTab(TAB_MAP[scene] || 'home');
        };

        // CSS vars live update — dashboard customize panel color/position changes
        bridgeRef.setCssVars = function (vars) {
            if (!vars || typeof vars !== 'object') return;
            // document.documentElement age global page-e set hoto — eta
            // shadow host-e set kora dorkar, nahole widget-er theme var
            // bahirer page-e leak kore jabe.
            var root = hostEl || document.documentElement;
            Object.keys(vars).forEach(function (k) {
                if (k.indexOf('--') === 0) root.style.setProperty(k, vars[k]);
            });
            // launcher position — '--nbl-launcher-position' isn't a real CSS
            // custom property (nothing in ui.css reads it), it's a plain
            // config value riding on the cssVars payload for convenience.
            // Drive it through state so both LauncherButton and WidgetShell
            // re-render with the new pos-left/pos-right class — a direct
            // classList hack here would get silently overwritten on the
            // next unrelated re-render (e.g. a points update).
            var pos = (vars['--nbl-launcher-position'] || '').toLowerCase();
            if (pos === 'left' || pos === 'right') {
                setPosition(pos);
            }
            // launcher icon — same story: '--nbl-launcher-icon' only ever
            // existed as a config value (quoted, e.g. "'gift'"), never a CSS
            // property. Previously this was written to :root via
            // setProperty above and nothing consumed it, so picking a new
            // icon in the dashboard never showed up here. Route it into
            // state instead so LauncherButton re-renders with the new icon.
            if (typeof vars['--nbl-launcher-icon'] === 'string') {
                setLauncherIconName(vars['--nbl-launcher-icon'].replace(/^'|'$/g, ''));
            }
        };

        // widgetConfig update — labels, show*Section flags, perPage etc.
        // setWidgetConfig() -> Preact re-render, lbl() automatically nতুন labels pabe.
        bridgeRef.setWidgetConfig = function (cfg) {
            if (!cfg) return;
            setWidgetConfig(cfg);
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // ── End bridge injection ──────────────────────────────────────────────────

    function closeWidget() {
        setIsOpen(false);
        setActiveTab('home');
    }
    function toggleWidget() {
        setIsOpen((prev) => {
            const next = !prev;
            if (!next) setActiveTab('home');
            if (next && toasts.length) {
                // Clear the toast stack immediately — previously these only
                // hid while isOpen was true (via ToastStack's `hidden` prop)
                // and reappeared as soon as the widget closed again, since
                // the toast state itself was never cleared.
                clearToasts();
            }
            return next;
        });
    }
    function setActiveNavigation(tabKey) {
        setActiveTab(tabKey || 'home');
    }

    // ── Notification panel control ────────────────────────────────────────────

    // Both flows produce the SAME flat notification object — the unified
    // NotificationPanel renders whatever slots are present.
    function openInfo(content) {
        // Gate claim-INITIATING panels only (content.claim === true — the
        // "Spend X points for this reward?"/prize-claim confirm dialogs from
        // RewardsTab.jsx / PrizesTab.jsx). Purely informational openInfo
        // calls (EarnTab's rule explainer, ReferralTab's "link copied"
        // toast, viewing an existing prize claim's details) have no
        // `claim: true` and are never touched by this — nothing to block,
        // they don't call the API. This is what "need update true hole
        // notification dekhabena" is about — don't even let the customer
        // get to the normal claim confirmation while behind; show the
        // update message right away instead. Server-side checkUpdateRequired.js
        // still enforces this independently either way (defense in depth —
        // this client-side check is just a nicer UX shortcut, not the
        // actual guarantee).
        if (content.claim && updateBanner) {
            setClaimState('idle');
            setClaimErrorMsg('');
            setClaimNeedsUpdate(true);
            setNotification({
                heading: updateBanner.title,
                text: updateBanner.description || '',
                claim: true,
                data: null,
            });
            return;
        }
        setClaimState('idle');
        setClaimErrorMsg('');
        setClaimNeedsUpdate(false);
        setNotification({ ...content });
    }
    function openReward(code) {
        setClaimState('idle');
        setClaimErrorMsg('');
        setClaimNeedsUpdate(false);
        setNotification({
            heading: lbl('notifyRewardHeading') || 'Success! Use this code at checkout',
            code: code || '',
        });
    }
    function closeNotification() {
        if (claimState === 'loading') return;
        setNotification(null);
    }

    // Opt-in auto-close — only notifications that explicitly set
    // `autoCloseMs` (e.g. the referral "Link copied!" toast, see
    // ReferralTab.jsx) get dismissed automatically. Every other
    // notification (rewards, claims, errors) has no such field and stays
    // open until the customer closes it themselves, exactly as before.
    useEffect(() => {
        if (!notification || !notification.autoCloseMs) return;
        const timer = setTimeout(() => {
            // Re-check claimState at fire time, not just at schedule time —
            // a claim could start loading during the window and closing out
            // from under it would be jarring.
            setClaimState((cs) => {
                if (cs !== 'loading') setNotification(null);
                return cs;
            });
        }, notification.autoCloseMs);
        return () => clearTimeout(timer);
    }, [notification]);

    // ── Image preview control ─────────────────────────────────────────────────

    function openImagePreview(src, alt) {
        if (!src) return;
        setPreviewImage({ src, alt });
    }
    function closeImagePreview() {
        setPreviewImage(null);
    }

    // ── Prize claim detail dialog — purono click-router.js myPrizeItem block ──

    function openPrizeClaim(claim) {
        const status = claim.status || 'PENDING';
        const prize = physicalPrizes.find((p) => Number(p.id) === Number(claim.physicalPrizeId));
        const title = prize ? prize.title : claim.title || 'Prize';

        const statusMessages = {
            PENDING: `<span class="nbl-notify-panel__text-icon">${icon('clock')}</span>Your request is being reviewed. We'll reach out to you soon to arrange delivery.`,
            FULFILLED: `<span class="nbl-notify-panel__text-icon">${icon('package')}</span>Your prize is on its way! We've dispatched your order and will follow up shortly.`,
            COMPLETED: `<span class="nbl-notify-panel__text-icon">${icon('check-circle')}</span>Your prize has been delivered. Thank you for being a loyal customer!`,
            CANCELLED: `<span class="nbl-notify-panel__text-icon">${icon('x-circle')}</span>This request was cancelled.`,
        };

        const detailRows = [];
        if (claim.productValue || (prize && prize.productValue)) {
            detailRows.push({ key: 'Prize value', val: `$${Number(claim.productValue || (prize && prize.productValue)).toLocaleString()}` });
        }
        if (claim.pointsCost) detailRows.push({ key: 'Points spent', val: `${formatNumber(claim.pointsCost)} pts` });
        if (prizeConfig.showRequestDate && claim.createdAt) detailRows.push({ key: 'Requested on', val: fmtDate(claim.createdAt) });
        if (prizeConfig.showFulfilledDate) {
            if (status === 'FULFILLED' && claim.fulfilledAt) detailRows.push({ key: 'Dispatched on', val: fmtDate(claim.fulfilledAt) });
            if (status === 'COMPLETED' && claim.completedAt) detailRows.push({ key: 'Completed on', val: fmtDate(claim.completedAt) });
        }

        let tUrl = '', tText = '', tLabel = lbl('prizeTrackingLabel') || 'Track your order';
        if (prizeConfig.showTrackingInfo && claim.trackingInfo && (status === 'FULFILLED' || status === 'COMPLETED')) {
            if (/^https?:\/\//i.test(claim.trackingInfo)) tUrl = claim.trackingInfo;
            else { tText = claim.trackingInfo; tLabel = claim.trackingInfo; }
        }

        let noteStr = '';
        if (prizeConfig.showAdminNote && claim.adminNote) {
            noteStr = (status === 'CANCELLED' ? 'Reason: ' : 'Note: ') + claim.adminNote;
        }

        openInfo({
            heading: title,
            rows: detailRows,
            text: statusMessages[status] || statusMessages.PENDING,
            isHtml: true,
            note: noteStr,
            trackingUrl: tUrl,
            trackingLabel: tLabel,
            trackingText: tText,
            contactUrl: (status === 'PENDING' || status === 'CANCELLED') ? (prizeConfig.contactUrl || '') : '',
            contactText: lbl('prizeContactUsText') || 'Contact us',
            claim: false,
        });
    }

    // ── Claim flow — purono notifications.js claimBtn + click-router.js
    //    notify:info:claim:start/success-er replacement ────────────────────────

    async function handleClaim(data) {
        if (!data) return;
        setClaimState('loading');
        setClaimErrorMsg('');
        setClaimNeedsUpdate(false);

        try {
            if (data.isPrize) {
                const prize = data.prize;
                const response = await requestClaimPrize({ prizeId: prize.id, proxyPath });

                const newPoints = Number(response.points);
                if (!isNaN(newPoints)) setPoints(newPoints);

                const createdAt = response.createdAt ? new Date(response.createdAt).toISOString() : new Date().toISOString();
                setPrizeClaims((prev) => [{ id: response.claimId || Date.now(), physicalPrizeId: prize.id, pointsCost: prize.pointsCost, status: 'PENDING', createdAt }, ...prev]);
                setTransactions((prev) => [{ activity: response.activity || 'Prize Claimed', points: -Math.abs(Number(prize.pointsCost) || 0), createdAt }, ...prev]);

                setClaimState('idle');
                openInfo({
                    text: lbl('prizeClaimSuccessMsg') || "Your request has been submitted! We'll contact you soon to arrange delivery.",
                    isHtml: false,
                    claim: false,
                });
            } else {
                const rule = data.rewardRule;
                const response = await requestRewardVoucher({ rewardRuleId: rule.id, title: data.title, proxyPath });

                const newPoints = Number(response.points);
                if (!isNaN(newPoints)) setPoints(newPoints);

                const createdAt = response.createdAt ? new Date(response.createdAt).toISOString() : new Date().toISOString();
                if (response.voucherCode) {
                    setCustomerRewards((prev) => [{ code: response.voucherCode, title: data.title || 'Voucher', status: 'ACTIVE', discountUsed: false, createdAt }, ...prev]);
                }
                setTransactions((prev) => [{ activity: response.activity || 'Reward Redeemed', points: -Math.abs(Number(rule.pointsCost) || 0), createdAt }, ...prev]);

                setClaimState('idle');
                openReward(response.voucherCode);
            }
        } catch (err) {
            setClaimState('error');
            setClaimErrorMsg(err.message || 'Something went wrong. Please try again.');
            setClaimNeedsUpdate(err.code === 'UPDATE_REQUIRED');
        }
    }

    return (
        <div id="nbl-loyalty-root">
            <LauncherButton
                isLoggedIn={isMember}
                points={points}
                position={position}
                launcherIconName={launcherIconName}
                onClick={toggleWidget}
                lbl={lbl}
            />
            <ToastStack
                toasts={effectiveToasts}
                moreCount={effectiveToastsMore}
                hidden={isPreviewToast ? false : isOpen}
                position={position}
                onOpenWidget={isPreviewToast ? function () { } : toggleWidget}
                onDismissToast={isPreviewToast ? function () { } : dismissToast}
                onExpand={isPreviewToast ? function () { } : expandToasts}
            />
            <WidgetShell
                isOpen={isOpen}
                isLoggedIn={isMember}
                customerName={customerName}
                points={points}
                position={position}
                activeTab={activeTab}
                onNavChange={setActiveNavigation}
                onClose={closeWidget}
                lbl={lbl}
                syncing={syncing && showSyncIndicator}
                notificationSlot={
                    <NotificationPanel
                        notification={notification}
                        claimState={claimState}
                        claimErrorMsg={claimErrorMsg}
                        claimNeedsUpdate={claimNeedsUpdate}
                        updateLoading={updateLoading}
                        onClose={closeNotification}
                        onClaim={handleClaim}
                        onUpdateClick={handleUpdateClick}
                        lbl={lbl}
                    />
                }
                previewSlot={
                    <ImagePreviewOverlay preview={previewImage} onClose={closeImagePreview} />
                }
                provisionSlot={
                    provisioning ? (
                        <div class="nbl-provision-overlay" role="status" aria-live="polite">
                            <span class="nbl-spinner nbl-spinner--provision" />
                        </div>
                    ) : null
                }
                updateBannerSlot={
                    <UpdateBanner
                        banner={effectiveUpdateBanner}
                        loading={updateLoading}
                        dismissed={updateDismissed}
                        errorMsg={updateErrorMsg}
                        onUpdate={handleUpdateClick}
                        onDismiss={dismissUpdateBanner}
                    />
                }
            >
                {isLoggedIn ? (
                    effectiveNeedsJoin ? (
                        <JoinProgramPanel
                            joining={joinProgram.joining}
                            error={joinProgram.error}
                            onJoin={joinProgram.join}
                            fromAutoFailure={joinFromAutoFailure}
                            lbl={lbl}
                        />
                    ) : (
                        <>
                            <TabPanel tabKey="home" activeTab={activeTab}>
                                <HomeTab
                                    showRewardsSection={widgetConfig.showHomeRewardsSection !== false}
                                    showPrizeRequestsSection={widgetConfig.showHomePrizeRequestsSection !== false}
                                    showActivitiesSection={widgetConfig.showHomeActivitiesSection !== false}
                                    customerRewards={customerRewards}
                                    prizeClaims={prizeClaims}
                                    physicalPrizes={physicalPrizes}
                                    transactions={transactions}
                                    homeRewardsPerPage={widgetConfig.homeRewardsPerPage || 5}
                                    homePrizeRequestsPerPage={widgetConfig.homePrizeRequestsPerPage || 5}
                                    homeActivitiesPerPage={widgetConfig.homeActivitiesPerPage || 5}
                                    paginationMode={paginationMode}
                                    onNavigate={setActiveNavigation}
                                    onOpenVoucher={openReward}
                                    onOpenClaim={openPrizeClaim}
                                    onViewImage={openImagePreview}
                                    lbl={lbl}
                                />
                            </TabPanel>
                            <TabPanel tabKey="points" activeTab={activeTab}>
                                <EarnTab pointRules={pointRules} currencySymbol={currencySymbol} onOpenInfo={openInfo} />
                            </TabPanel>
                            <TabPanel tabKey="rewards" activeTab={activeTab}>
                                <RewardsTab
                                    rewardRules={rewardRules}
                                    points={points}
                                    customerRewards={customerRewards}
                                    perPage={widgetConfig.homeRewardsPerPage || 5}
                                    paginationMode={paginationMode}
                                    lbl={lbl}
                                    onOpenInfo={openInfo}
                                    onOpenVoucher={openReward}
                                />
                            </TabPanel>
                            <TabPanel tabKey="prizes" activeTab={activeTab}>
                                <PrizesTab
                                    physicalPrizes={physicalPrizes}
                                    points={points}
                                    prizeClaims={prizeClaims}
                                    perPage={widgetConfig.homePrizeRequestsPerPage || 5}
                                    paginationMode={paginationMode}
                                    lbl={lbl}
                                    onOpenInfo={openInfo}
                                    onOpenClaim={openPrizeClaim}
                                    onViewImage={openImagePreview}
                                />
                            </TabPanel>
                            <TabPanel tabKey="referral" activeTab={activeTab}>
                                <ReferralTab pointRules={pointRules} referralLink={referralLink} currencySymbol={currencySymbol} onOpenInfo={openInfo} />
                            </TabPanel>
                            <TabPanel tabKey="activities" activeTab={activeTab}>
                                <ActivitiesTab transactions={transactions} perPage={10} paginationMode={paginationMode} lbl={lbl} />
                            </TabPanel>
                            <TabPanel tabKey="active-rewards" activeTab={activeTab}>
                                <ActiveRewardsTab customerRewards={customerRewards} perPage={8} paginationMode={paginationMode} lbl={lbl} onOpenVoucher={openReward} />
                            </TabPanel>
                            <TabPanel tabKey="my-prizes" activeTab={activeTab}>
                                <MyPrizesTab
                                    prizeClaims={prizeClaims}
                                    physicalPrizes={physicalPrizes}
                                    perPage={widgetConfig.myPrizesPerPage || 5}
                                    paginationMode={paginationMode}
                                    lbl={lbl}
                                    onOpenClaim={openPrizeClaim}
                                    onViewImage={openImagePreview}
                                />
                            </TabPanel>
                        </>
                    )
                ) : (
                    <GuestPanel loginUrl={loginUrl} signupUrl={signupUrl} lbl={lbl} />
                )}
            </WidgetShell>

            <ReferralModal refModal={refModal} pointRules={pointRules} currencySymbol={currencySymbol} onUpdateClick={handleUpdateClick} updateLoading={updateLoading} lbl={lbl} />
        </div>
    );
}
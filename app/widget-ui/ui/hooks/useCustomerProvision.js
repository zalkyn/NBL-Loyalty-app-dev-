// =============================================================================
// app/widget-ui/ui/hooks/useCustomerProvision.js
// Silent customer auto-provisioning — kichu logged-in customer Shopify-te
// ache kintu app DB-te nai (e.g. install-er age customer ছিল, ba webhook
// miss hoyeche). Eta detect kore background-e provision kore, then reload.
//
// Controlled by widgetConfig.autoProvisionCustomer — a real Customize >
// New Customer Onboarding toggle (see cssVarsConfig.js), ON by default:
// such customers are silently joined in the background. A merchant who
// turns it OFF instead makes every such customer see the explicit "Join
// Our Program" button.
//
// On failure (backend unreachable, timeout, non-success response), this
// never shows an alarming error itself — instead it exposes `failed`, and
// App.jsx falls back to the explicit JoinProgramPanel (same UI merchants
// see when autoProvisionCustomer is off) so the customer always has a
// clear, actionable next step instead of silently landing on a broken
// widget (0 points, empty referral link, etc. with no explanation).
// =============================================================================

import { useState, useEffect, useRef } from 'preact/hooks';
import { requestProvisionCustomer } from '../api.js';

const SESSION_FAILED_KEY = 'NBL_ProvisionFailed';

// Hard cutoff — customer ke kokhono lomba shomoy dhore overlay-te lock kore
// rakha jabe na. Eita ekta circuit breaker: backend slow/unreachable hole,
// silently give up, overlay hide kore daw, widget normal state-e render
// hote dao. Real loop-protection backend-e (idempotent upsert + shouldReload
// flag) — eta sudhu "customer ke besi shomoy spinner dekhano jabe na" ensure kore.
const HARD_CUTOFF_MS = 7000;

// NOTE: there used to ALSO be an unconditional "attempted once ever, success
// or failure" sessionStorage gate here (NBL_ProvisionAttempted). Removed —
// it was setting itself the instant ANY attempt started, so a customer
// whose FIRST silent provision succeeded, but whose config later went
// missing again in the SAME browser tab (e.g. another "Empty config" admin
// action, or any real backend issue clearing their metafields mid-session),
// could never get auto-healed again for the rest of that tab's life — only
// a brand-new tab/session would retry. That's not what this circuit
// breaker was meant to prevent. Per-mount dedup is already handled by
// ranRef below (at most one attempt per component mount); the ONLY
// cross-mount case worth blocking is repeatedly hammering a backend that
// just failed — which hasFailedThisSession()/markFailedThisSession() below
// already covers on its own, without also blocking legitimate later
// successes.
function hasFailedThisSession() {
    try { return sessionStorage.getItem(SESSION_FAILED_KEY) === '1'; } catch (e) { return false; }
}
function markFailedThisSession() {
    try { sessionStorage.setItem(SESSION_FAILED_KEY, '1'); } catch (e) { /* ignore */ }
}

/**
 * @param {Object} params
 * @param {boolean} params.isLoggedIn
 * @param {Object|null} params.customer  - widget-er customer data. customer.id
 *                                          ekhane Shopify customer GID (referralModal/api.js
 *                                          eki convention follow kore) — even if
 *                                          customer.config missing thake, customer.id thakte pare.
 * @param {Object} params.widgetConfig   - widgetConfig.autoProvisionCustomer
 *                                          (default true/on — real Customize page toggle;
 *                                          only an explicit false turns it off), widgetConfig.showProvisionLoadingOverlay
 * @param {string} params.proxyPath      - App Proxy base path (e.g. "/apps/widget"),
 *                                          same one every other widget API call uses.
 * @param {(config: Object) => void} params.onSynced - Called with the fresh
 *                                          config when the backend found an
 *                                          EXISTING record and silently
 *                                          re-synced it (shouldReload false —
 *                                          nothing was actually created, so a
 *                                          reload was never warranted for
 *                                          this case in the first place; see
 *                                          the shouldReload:true branch below
 *                                          for why THAT case still reloads).
 *                                          Same App.jsx's applySyncedConfig
 *                                          used by the other sync hooks.
 * @param {(syncing: boolean) => void} [params.onSyncingChange] - Called
 *                                          true right before the provision
 *                                          request fires and false once it
 *                                          settles — drives the same
 *                                          pointsPending/spinner signal
 *                                          useConfigResync.js and
 *                                          useAutoUpdateSync.js already
 *                                          use. Optional; safe to omit.
 * @returns {{ provisioning: boolean, provisionNeeded: boolean, inFlight: boolean, failed: boolean }}
 *          provisioning     - true jokhon OVERLAY dekhano dorkar (in-flight AND showOverlay on).
 *                              UI render-er jonno — ReferralModal-er overlay slot eta use kore.
 *          provisionNeeded  - synchronous, render-time true/false — "ei customer-er
 *                              provisioning lagbe naki lagbe na" — sibling hooks (jemon
 *                              useReferralModal) eta diye nijeder boot-time API call defer korte pare.
 *          inFlight         - true jotokkhon call ta actually pending, showOverlay flag
 *                              nirbishese. Sibling hooks-er deferral logic-er jonno EI flag
 *                              use kora uchit, `provisioning` na — karon showOverlay false
 *                              thakle `provisioning` kokhono true hobei na, kintu call tobu
 *                              pending thakte pare.
 *          failed           - true jokhon eই session-e ekbar attempt hoyeche ebong seta fail
 *                              koreche (timeout / network error / non-success response) —
 *                              persisted in sessionStorage, tai circuit-breaker-er karone
 *                              re-attempt na hoyeo, page reload-er pore-o eই flag thik thake.
 *                              App.jsx eta diye JoinProgramPanel fallback dekhay.
 */
export function useCustomerProvision({ isLoggedIn, customer, widgetConfig, proxyPath, onSynced, onSyncingChange }) {
    const [provisioning, setProvisioning] = useState(false); // overlay visibility only
    const [inFlight, setInFlight] = useState(false); // true whenever a provision call is outstanding, regardless of overlay setting
    // Lazy init reads sessionStorage once on first mount — so a customer who
    // reloads after a failed attempt (circuit breaker blocks re-attempting)
    // still sees the fallback panel immediately, instead of the failure
    // being "forgotten" because this is a fresh hook instance.
    const [failed, setFailed] = useState(hasFailedThisSession);
    const ranRef = useRef(false);

    const cfg = widgetConfig || {};
    // A real Customize > New Customer Onboarding toggle, ON by default:
    // buildInitialWidgetConfig() (see cssVarsConfig.js) bakes
    // autoProvisionCustomer:true into the saved widgetConfig, so any shop
    // that has saved Customize even once ships true here and silent
    // auto-join is on unless the merchant deliberately turned it off.
    // The one case where this is false despite the default: a shop that
    // has NEVER saved Customize at all — its stored widgetConfig is null,
    // so the storefront receives {} and this key is simply absent. The
    // strict === true check treats that absent value as off (explicit
    // Join button shown) rather than guessing — a safe fallback, and it
    // resolves itself the moment that shop saves Customize once.
    const featureEnabled = cfg.autoProvisionCustomer === true;

    // ── Synchronous, render-time derived flag ─────────────────────────────────
    // Available immediately on first render (no useEffect delay), so sibling
    // hooks like useReferralModal can check "is this customer mid-provision?"
    // and defer their own boot-time API calls instead of racing ahead and
    // hitting the backend before the DB record even exists.
    const shopifyCustomerId = customer && customer.id;
    const provisionNeeded = !!(
        featureEnabled
        && isLoggedIn
        && shopifyCustomerId
        && (!customer.config || !customer.config.id)
    );

    useEffect(() => {
        if (!provisionNeeded) return;
        if (ranRef.current) return;
        // Cross-mount guard: skip only if the LAST attempt in this tab
        // failed (backend was unreachable, etc.) — don't hammer it again
        // on every subsequent page load. Does NOT block retrying after a
        // prior SUCCESS — see this file's module comment above for why
        // that distinction matters (a customer whose config goes missing
        // again later in the same tab should still get auto-healed).
        if (hasFailedThisSession()) return;
        ranRef.current = true;

        const showOverlay = cfg.showProvisionLoadingOverlay !== false;
        setInFlight(true);
        // Same shared "points are known-stale" signal useConfigResync.js
        // and useAutoUpdateSync.js already drive (App.jsx's syncCount ->
        // pointsPending) — without this, a silent auto-provision (this
        // path) left the points number sitting at whatever the empty/
        // default merge produced (often 0) with no visual indication
        // anything was happening, instead of the spinner every other
        // sync path already shows.
        if (onSyncingChange) onSyncingChange(true);
        if (showOverlay) setProvisioning(true);

        let settled = false;
        const cutoff = setTimeout(() => {
            if (settled) return;
            settled = true;
            // eslint-disable-next-line no-console
            console.error('[NBL Provision] hard cutoff reached — giving up silently');
            markFailedThisSession();
            setFailed(true);
            setProvisioning(false);
            setInFlight(false);
            if (onSyncingChange) onSyncingChange(false);
        }, HARD_CUTOFF_MS);

        let signal;
        if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
            signal = AbortSignal.timeout(HARD_CUTOFF_MS);
        }

        requestProvisionCustomer({ proxyPath, signal })
            .then((data) => {
                if (settled) return;
                settled = true;
                clearTimeout(cutoff);

                if (data && data.success && data.shouldReload) {
                    // Don't bother hiding the overlay first — a reload is coming
                    // immediately, and leaving it up avoids a one-frame flash of
                    // the stale/guest state right before the page reloads.
                    window.location.reload();
                    return;
                }

                // success:true + shouldReload:false means a record already
                // existed and was silently re-synced (not created, not a
                // failure) — e.g. this exact customer's metafields were
                // cleared/stale but their DB row was intact (the "Empty
                // config" testing tool's scenario — see
                // deleteCustomerRecord.js's module comment). Previously
                // NOTHING happened here — the widget kept showing whatever
                // it rendered initially (often 0 points, since that's what
                // an empty metafield merges to) even though the metafield
                // was already correctly restored in the background,
                // leaving the customer stuck looking at stale data until
                // an unrelated page reload. Patching state via onSynced
                // here closes that gap the same way the other sync hooks
                // already do.
                if (data && data.success && data.config && onSynced) {
                    onSynced(data.config);
                }

                // success:true + shouldReload:false means a record already
                // existed (not a failure) — anything else (missing/falsy
                // success) is a real failure the fallback panel should
                // catch, e.g. the backend was unreachable or returned an
                // error body.
                if (!data || !data.success) {
                    markFailedThisSession();
                    setFailed(true);
                }

                setProvisioning(false);
                setInFlight(false);
                if (onSyncingChange) onSyncingChange(false);
            })
            .catch((err) => {
                if (settled) return;
                settled = true;
                clearTimeout(cutoff);
                // eslint-disable-next-line no-console
                console.error('[NBL Provision] failed:', err);
                markFailedThisSession();
                setFailed(true);
                setProvisioning(false);
                setInFlight(false);
                if (onSyncingChange) onSyncingChange(false);
            });

        return () => {
            settled = true;
            clearTimeout(cutoff);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [provisionNeeded]);

    return { provisioning, provisionNeeded, inFlight, failed };
}
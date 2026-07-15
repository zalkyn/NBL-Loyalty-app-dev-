// =============================================================================
// app/widget-ui/ui/hooks/useUpdateBanner.js
// "Update available" banner state + logic — extracted out of App.jsx (which
// was growing large) into its own hook, same pattern as useReferralModal.js /
// useConfigResync.js. See main.preact.jsx's computeUpdateStatus() for the
// (admin flag + active version + customer mismatch) condition that decides
// whether initialUpdateBanner is non-null in the first place, and
// checkUpdateRequired.js for the matching server-side guard that blocks
// reward/prize/referral claims under the same condition.
// =============================================================================

import { useState } from 'preact/hooks';
import { requestConfigResync } from '../api.js';

export function useUpdateBanner({ initialUpdateBanner, proxyPath, onSynced }) {
    const [updateBanner, setUpdateBanner] = useState(initialUpdateBanner || null);
    const [updateDismissed, setUpdateDismissed] = useState(false);
    const [updateLoading, setUpdateLoading] = useState(false);
    const [updateErrorMsg, setUpdateErrorMsg] = useState('');

    // Admin Customize > Advanced > Update Banner live preview override — see
    // App.jsx's bridgeRef.setScene 'notification-update-banner' case, which
    // calls setPreviewUpdateBanner (exposed below) with fixed demo data.
    // Real updateBanner is null/false in the preview session (no real
    // customer data there), so without this override the section would
    // show nothing at all when selected — this always shows the SAME fixed
    // demo text regardless of any real version/customer state, exactly
    // like the widget's toast-preview override does for toast notifications.
    const [previewUpdateBanner, setPreviewUpdateBanner] = useState(null);
    const effectiveUpdateBanner = previewUpdateBanner !== null ? previewUpdateBanner : updateBanner;

    function handleUpdateClick() {
        if (updateLoading) return;
        setUpdateLoading(true);
        setUpdateErrorMsg('');
        // Deliberately calls requestConfigResync directly rather than going
        // through useConfigResync's hook — that hook throttles to once every
        // 4 hours via localStorage, which is right for silent background
        // hygiene but wrong here: the customer explicitly asked for this,
        // right now, and the whole point of the button is to not make them
        // wait out that window. The backend call itself (syncCustomerConfig)
        // is unthrottled — it's meant to be called directly like this.
        requestConfigResync({ proxyPath })
            .then(function (data) {
                // requestConfigResync never throws (see api.js) — it can
                // resolve a response with no usable config (network hiccup,
                // an unauthenticated/expired session, a genuine backend
                // error caught server-side) just as easily as a real one.
                // Checking data.config first is what makes a real failure
                // visible instead of silently looking successful.
                if (data && data.config) {
                    // No page reload — the resync endpoint only ever
                    // returns THIS customer's own config (points/rewards/
                    // transactions/prizeClaims/referralCode), never
                    // shop-level data (reward rules, styles, labels), so
                    // patching exactly these fields via onSynced (App.jsx's
                    // applySyncedConfig) is already a complete update, not
                    // a partial one — a full reload bought no additional
                    // freshness here, only a flicker/delay. Shop-level
                    // data staying current is ordinary storefront/liquid
                    // behavior on the customer's next navigation, entirely
                    // unrelated to this resync path.
                    onSynced(data.config);
                    // Clear the banner immediately — the customer's
                    // lastSyncedVersionKey now matches the active version
                    // server-side (syncCustomerConfig only stamps this
                    // AFTER the metafield write succeeds), so there's
                    // nothing left to show. Without this, the banner would
                    // otherwise stay visible until state resets, since
                    // nothing else in this session ever recomputes it.
                    setUpdateBanner(null);
                    setUpdateLoading(false);
                    return;
                }
                setUpdateLoading(false);
                setUpdateErrorMsg("Couldn't update right now — please try again.");
            })
            .catch(function () {
                setUpdateLoading(false);
                setUpdateErrorMsg("Couldn't update right now — please try again.");
            });
    }

    function dismiss() {
        setUpdateDismissed(true);
    }

    // Only ever called from App.jsx's bridgeRef.setScene when (re-)entering
    // the admin preview scene for this section — so re-selecting "Update
    // Banner" in Customize always shows it fresh, even if a previous
    // preview interaction dismissed it.
    function resetDismiss() {
        setUpdateDismissed(false);
    }

    return {
        // Real value — used by the claim-blocking gate (App.jsx's openInfo)
        // and the claim-confirmation flow, which must never act on preview
        // demo data.
        updateBanner,
        // Preview-aware value — used by the actual rendered banner
        // (UpdateBanner component), so the admin preview override works.
        effectiveUpdateBanner,
        updateDismissed,
        updateLoading,
        updateErrorMsg,
        handleUpdateClick,
        dismiss,
        resetDismiss,
        // Exposed so App.jsx's bridgeRef.setScene can drive the preview
        // override, and clear it when switching to any other scene.
        setPreviewUpdateBanner,
    };
}
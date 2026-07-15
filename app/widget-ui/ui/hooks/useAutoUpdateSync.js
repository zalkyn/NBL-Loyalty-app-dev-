// =============================================================================
// app/widget-ui/ui/hooks/useAutoUpdateSync.js
// Auto-sync counterpart to the "update available" banner — see
// useUpdateBanner.js's handleUpdateClick for the manual, click-triggered
// version of this exact same resync. When Customize > Update Notifications'
// mode is "auto" instead of "banner", main.preact.jsx's computeUpdateStatus()
// sets initialData.updateSyncNeeded true instead of building a banner — this
// hook is what actually acts on that, firing the resync silently on mount
// (no banner, no click) and patching local state once it lands.
//
// Deliberately NOT a replacement for useConfigResync.js's periodic (4-hour
// throttled) hygiene sync — that one catches generic metafield drift
// (missed webhook, schema change) completely independent of whether the
// admin has ever published a version. This hook only ever fires because of
// a specific, admin-announced version mismatch. Both can be relevant to
// the same customer at different times, so both stay — see
// useConfigResync.js's own module comment for the fuller rationale.
// =============================================================================

import { useEffect, useRef } from 'preact/hooks';
import { requestConfigResync } from '../api.js';
import { markSyncedNow } from './useConfigResync.js';

/**
 * @param {Object} params
 * @param {boolean} params.isMember   - logged in AND already joined — same
 *                                      guard useConfigResync uses; nothing
 *                                      to sync for a guest or a customer
 *                                      still on the join step.
 * @param {boolean} params.needed     - initialData.updateSyncNeeded from
 *                                      main.preact.jsx's computeUpdateStatus()
 *                                      — true only in "auto" mode with an
 *                                      actual version mismatch.
 * @param {string} params.proxyPath   - App Proxy base path (e.g. "/apps/widget").
 * @param {string|number} [params.customerId] - Same per-customer scoping
 *                                      useConfigResync uses for its own
 *                                      throttle key — passed through here
 *                                      only so a successful auto-sync can
 *                                      reset that timer too (see below).
 * @param {(config: Object) => void} params.onSynced - Called with the fresh
 *                                      config object on a successful sync
 *                                      (App.jsx's applySyncedConfig), so the
 *                                      caller can patch its own state in
 *                                      place (points, rewards, etc.) — same
 *                                      shape/contract as useConfigResync's
 *                                      onSynced.
 * @param {(syncing: boolean) => void} [params.onSyncingChange] - Called
 *                                      true right before the request fires
 *                                      and false once it settles — drives
 *                                      Header.jsx's tiny, non-blocking sync
 *                                      indicator. Optional; safe to omit.
 */
export function useAutoUpdateSync({ isMember, needed, proxyPath, customerId, onSynced, onSyncingChange }) {
    const ranRef = useRef(false);

    useEffect(() => {
        if (!isMember || !needed) return;
        if (ranRef.current) return; // at most one attempt per mount
        ranRef.current = true;
        if (onSyncingChange) onSyncingChange(true);

        requestConfigResync({ proxyPath })
            .then((data) => {
                if (data && data.config) {
                    // Reset the periodic hygiene-sync timer too — this
                    // customer was just freshly synced a moment ago for a
                    // different reason (version mismatch, not the 4-hour
                    // interval), no need for that timer to also fire again
                    // right away. Safe no-op if customerId is missing.
                    if (customerId) markSyncedNow(customerId);
                    // No page reload — see useUpdateBanner.js's matching
                    // comment: the resync endpoint only ever returns this
                    // customer's own config, never shop-level data, so
                    // patching via onSynced is already complete. The
                    // customer's lastSyncedVersionKey is stamped
                    // server-side the moment the metafield write succeeds
                    // (syncCustomerConfig), independent of anything
                    // client-side — so there's nothing left pending here
                    // once onSynced runs.
                    onSynced(data.config);
                    if (onSyncingChange) onSyncingChange(false);
                    return;
                }
                if (onSyncingChange) onSyncingChange(false);
                // requestConfigResync never throws (see api.js) — a
                // response with no usable config (network hiccup, expired
                // session, backend error caught server-side) is a
                // best-effort miss, not something to surface to the
                // customer. They'll get another chance on their next visit.
                // eslint-disable-next-line no-console
                console.error('[NBL AutoUpdateSync] resync returned no config');
            })
            .catch((err) => {
                if (onSyncingChange) onSyncingChange(false);
                // eslint-disable-next-line no-console
                console.error('[NBL AutoUpdateSync] failed:', err);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMember, needed, customerId]);
}
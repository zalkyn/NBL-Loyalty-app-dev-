// =============================================================================
// modules/module-preact/hooks/useConfigResync.js
// Periodic, silent background resync of an already-joined customer's app
// config — heals a customer's Shopify metafield (and the widget's own
// in-memory state) that's gone stale from a backend schema change or old
// test data, WITHOUT a page reload (unlike useCustomerProvision.js, which
// reloads because a brand-new record needs the full SSR-injected payload
// anyway — here the customer is already fully set up, so a live patch of
// existing state is enough and far less disruptive mid-visit).
//
// Throttled via localStorage (not sessionStorage — this needs to persist
// across visits over hours, not just within one tab session) with a plain
// last-synced timestamp, scoped per customerId — see note on STORAGE_PREFIX
// below for why. An empty/missing timestamp (first-ever visit for this
// customer, or storage cleared) naturally computes as "long overdue" and
// syncs immediately — no separate first-visit special case needed.
// =============================================================================

import { useEffect, useRef } from 'preact/hooks';
import { requestConfigResync } from '../api.js';

// Scoped per customerId (shared/family devices, or the same browser used by
// different customers over time, would otherwise let one customer's
// last-synced timestamp throttle a completely different customer's resync —
// e.g. customer A visits and syncs, customer B logs in on the same browser
// minutes later and silently gets NO resync for up to 4 hours, because the
// unscoped key made it look like B had already synced recently too).
const STORAGE_PREFIX = 'NBL_LastConfigSync_';

// How often to silently refresh an already-joined customer's config.
// Deliberately a background-hygiene interval, not a real-time sync —
// order/reward/referral events already push fresh data through their own
// dedicated flows the moment they happen; this only catches drift between
// those events (schema changes, stale test-era metafields).
const SYNC_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

function getLastSyncedAt(customerId) {
    try {
        return Number(localStorage.getItem(STORAGE_PREFIX + customerId)) || 0;
    } catch (e) {
        return 0;
    }
}

function markSyncedNow(customerId) {
    try {
        localStorage.setItem(STORAGE_PREFIX + customerId, String(Date.now()));
    } catch (e) { /* ignore — storage unavailable/blocked, just skip caching */ }
}

/**
 * @param {Object} params
 * @param {boolean} params.isMember  - logged in AND already joined (has a
 *                                     working customer.config) — see
 *                                     App.jsx. Never fires for guests or
 *                                     customers still on the join step;
 *                                     there's nothing to resync for them.
 * @param {string} params.proxyPath  - App Proxy base path (e.g. "/apps/widget").
 * @param {string|number} [params.customerId] - Scopes the throttle timestamp
 *                                     to this customer (see STORAGE_PREFIX
 *                                     above). Required for the throttle to
 *                                     actually run — see guard below.
 * @param {(config: Object) => void} params.onSynced - Called with the fresh
 *                                     config object on a successful resync,
 *                                     so the caller can patch its own state
 *                                     in place (points, rewards, etc.).
 */
export function useConfigResync({ isMember, proxyPath, customerId, onSynced }) {
    const ranRef = useRef(false);

    useEffect(() => {
        if (!isMember) return;
        // isMember should always imply a resolved customerId in practice
        // (see App.jsx — isMember requires a logged-in, fully-joined
        // customer). This guard exists purely so a missing id can never
        // fall through to an unscoped/`"undefined"`-suffixed storage key —
        // safer to just skip this cycle's resync than risk that.
        if (!customerId) return;
        if (ranRef.current) return; // at most one attempt per mount

        const dueSince = Date.now() - getLastSyncedAt(customerId);
        if (dueSince < SYNC_INTERVAL_MS) return; // not due yet

        ranRef.current = true;

        requestConfigResync({ proxyPath })
            .then((data) => {
                // Mark synced regardless of outcome — a persistently failing
                // backend (e.g. temporarily down) shouldn't turn into a
                // resync attempt on every single page load; the customer
                // just waits for the next interval, same circuit-breaker
                // philosophy as useCustomerProvision.js.
                markSyncedNow(customerId);
                if (data && data.config) {
                    onSynced(data.config);
                }
            })
            .catch((err) => {
                markSyncedNow(customerId);
                // eslint-disable-next-line no-console
                console.error('[NBL ConfigResync] failed:', err);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMember, customerId]);
}

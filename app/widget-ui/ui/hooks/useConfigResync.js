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
// last-synced timestamp. An empty/missing timestamp (first-ever visit, or
// storage cleared) naturally computes as "long overdue" and syncs
// immediately — no separate first-visit special case needed.
// =============================================================================

import { useEffect, useRef } from 'preact/hooks';
import { requestConfigResync } from '../api.js';

const STORAGE_KEY = 'NBL_LastConfigSync';

// How often to silently refresh an already-joined customer's config.
// Deliberately a background-hygiene interval, not a real-time sync —
// order/reward/referral events already push fresh data through their own
// dedicated flows the moment they happen; this only catches drift between
// those events (schema changes, stale test-era metafields).
const SYNC_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

function getLastSyncedAt() {
    try {
        return Number(localStorage.getItem(STORAGE_KEY)) || 0;
    } catch (e) {
        return 0;
    }
}

function markSyncedNow() {
    try {
        localStorage.setItem(STORAGE_KEY, String(Date.now()));
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
 * @param {(config: Object) => void} params.onSynced - Called with the fresh
 *                                     config object on a successful resync,
 *                                     so the caller can patch its own state
 *                                     in place (points, rewards, etc.).
 */
export function useConfigResync({ isMember, proxyPath, onSynced }) {
    const ranRef = useRef(false);

    useEffect(() => {
        if (!isMember) return;
        if (ranRef.current) return; // at most one attempt per mount

        const dueSince = Date.now() - getLastSyncedAt();
        if (dueSince < SYNC_INTERVAL_MS) return; // not due yet

        ranRef.current = true;

        requestConfigResync({ proxyPath })
            .then((data) => {
                // Mark synced regardless of outcome — a persistently failing
                // backend (e.g. temporarily down) shouldn't turn into a
                // resync attempt on every single page load; the customer
                // just waits for the next interval, same circuit-breaker
                // philosophy as useCustomerProvision.js.
                markSyncedNow();
                if (data && data.config) {
                    onSynced(data.config);
                }
            })
            .catch((err) => {
                markSyncedNow();
                // eslint-disable-next-line no-console
                console.error('[NBL ConfigResync] failed:', err);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMember]);
}

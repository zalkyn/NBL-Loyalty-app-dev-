// =============================================================================
// app/widget-ui/ui/hooks/useJoinProgram.js
// Explicit "Join our program" button flow — logged-in customer chore Shopify-e
// ache kintu app DB-te nai (install-er age-kar customer, ba webhook miss).
// useCustomerProvision.js-er silent/auto version-er opposite: eta shudhu
// customer nijei button click korle fire hoy.
//
// No page reload on success — join-program.jsx now returns the freshly
// synced `config` (same shape syncCustomerConfig.js writes to metafields),
// so the caller (App.jsx) can patch local state AND flip the join-complete
// flag in place, same "resync response already has everything, reload buys
// nothing extra" reasoning as useUpdateBanner.js / useAutoUpdateSync.js.
// =============================================================================

import { useState } from 'preact/hooks';
import { requestJoinProgram } from '../api.js';

/**
 * @param {Object} params
 * @param {string} params.proxyPath - App Proxy base path (e.g. "/apps/widget")
 * @param {(config: Object) => void} params.onJoined - Called with the fresh
 *   config object on success, so the caller can patch its own state in
 *   place (points, rewards, referralCode, etc. — via App.jsx's
 *   applySyncedConfig) AND flip whatever flag drives needsJoin/isMember,
 *   so the widget switches straight from JoinProgramPanel to the normal
 *   member view without a reload.
 * @returns {{ joining: boolean, error: string, join: () => Promise<void> }}
 *   joining - true while the request is in flight (drives the button's
 *             built-in `loading` state).
 *   error   - customer-safe message from the last failed attempt, or ''.
 *             Cleared automatically at the start of the next attempt.
 *   join    - call on button click.
 */
export function useJoinProgram({ proxyPath, onJoined }) {
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState('');

    async function join() {
        if (joining) return; // guard against double-click while in flight
        setJoining(true);
        setError('');

        try {
            const data = await requestJoinProgram({ proxyPath });

            if (data && data.success && data.config) {
                onJoined(data.config);
                setJoining(false);
                return;
            }

            setError('Something went wrong. Please try again.');
            setJoining(false);
        } catch (err) {
            // err.message is already customer-safe — see api.js's
            // postJson error-message policy.
            setError((err && err.message) || 'Something went wrong. Please try again.');
            setJoining(false);
        }
    }

    return { joining, error, join };
}
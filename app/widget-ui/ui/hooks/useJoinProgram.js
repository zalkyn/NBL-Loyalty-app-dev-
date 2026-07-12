// =============================================================================
// modules/module-preact/hooks/useJoinProgram.js
// Explicit "Join our program" button flow — logged-in customer chore Shopify-e
// ache kintu app DB-te nai (install-er age-kar customer, ba webhook miss).
// useCustomerProvision.js-er silent/auto version-er opposite: eta shudhu
// customer nijei button click korle fire hoy, success hole page reload.
// =============================================================================

import { useState } from 'preact/hooks';
import { requestJoinProgram } from '../api.js';

/**
 * @param {Object} params
 * @param {string} params.proxyPath - App Proxy base path (e.g. "/apps/widget")
 * @returns {{ joining: boolean, error: string, join: () => Promise<void> }}
 *   joining - true while the request is in flight (drives the button's
 *             built-in `loading` state).
 *   error   - customer-safe message from the last failed attempt, or ''.
 *             Cleared automatically at the start of the next attempt.
 *   join    - call on button click. On success, reloads the page so the
 *             widget re-fetches with the now-existing customer record —
 *             mirrors the reload useCustomerProvision does on shouldReload.
 */
export function useJoinProgram({ proxyPath }) {
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState('');

    async function join() {
        if (joining) return; // guard against double-click while in flight
        setJoining(true);
        setError('');

        try {
            const data = await requestJoinProgram({ proxyPath });

            if (data && data.success) {
                // Don't bother resetting `joining` first — a reload is
                // coming immediately, same rationale as useCustomerProvision.
                window.location.reload();
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

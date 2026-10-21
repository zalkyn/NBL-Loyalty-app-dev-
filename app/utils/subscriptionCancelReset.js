// =============================================================================
// app/utils/subscriptionCancelReset.js
//
// The one rule for how many points a subscription-cancel reset removes.
// Pure and client-safe: used inside createTransaction (the authoritative
// figure, read in the same DB transaction as the write), by the manual
// reset action (to resolve rows with nothing to remove), and by the
// cancellations page loader (the number shown in the confirm modal).
// =============================================================================

/**
 * How a MANUAL reset (Reset Now / bulk reset on the Subscription
 * Cancellations page) treats points the customer received after cancelling.
 * The automatic reset runs at cancel time, before anything new can be
 * earned, so it always removes the whole balance and ignores this.
 *
 * FULL_BALANCE         - reset the whole current balance to 0 (default; the
 *                        original behaviour)
 * KEEP_EARNED_AFTER    - remove only what was left from before the
 *                        cancellation; points added since are kept
 */
export const MANUAL_RESET_MODES = ["FULL_BALANCE", "KEEP_EARNED_AFTER"];
export const DEFAULT_MANUAL_RESET_MODE = "FULL_BALANCE";

/**
 * @param {number} balance     - The customer's live balance.
 * @param {number} addedAfter  - Sum of every positive transaction since the
 *                               cancellation (earning, referrals, adjustments,
 *                               restores). Ignored for FULL_BALANCE.
 * @param {string} mode        - One of MANUAL_RESET_MODES.
 * @returns {number} Points to remove — never negative, never more than the balance.
 *
 * KEEP_EARNED_AFTER keeps up to `addedAfter` points and removes the rest.
 * If the customer has spent since cancelling, spending comes out of the
 * pre-cancellation points first, so they keep everything they earned after
 * (as long as the balance covers it).
 */
export function cancelResetDeduction(balance, addedAfter, mode) {
    const bal = Math.max(0, Number(balance) || 0);
    if (mode !== "KEEP_EARNED_AFTER") return bal;
    const kept = Math.max(0, Number(addedAfter) || 0);
    return Math.max(0, bal - kept);
}

// ─────────────────────────────────────────────────────────────────────────────
// WHEN the automatic reset happens
// ─────────────────────────────────────────────────────────────────────────────

/**
 * immediate   - reset the moment Appstle reports the cancellation (the
 *               original behaviour, and the default)
 * period_end  - keep the points until the date the customer has paid up to,
 *               then reset. A yearly member who cancels after one month keeps
 *               their points for the remaining eleven.
 */
export const RESET_TIMINGS = ["immediate", "period_end"];
export const DEFAULT_RESET_TIMING = "immediate";

/**
 * Decides, for one cancellation, whether to reset now or wait.
 *
 * "Paid up to" is the contract's nextBillingDate on the cancellation event —
 * the date the next payment would have been taken. Appstle sent it on every
 * real cancellation we have seen (about a month ahead for monthly plans, a
 * year ahead for a 12-month plan). If it is missing or already past, waiting
 * has no meaning, so the reset happens now — the same as before this option
 * existed — rather than leaving a balance unreset by accident.
 *
 * @param {Object} args
 * @param {string} args.timing           - One of RESET_TIMINGS.
 * @param {string|Date|null} [args.nextBillingDate]
 * @param {Date} [args.now]
 * @returns {{ action: "reset_now" } | { action: "defer", dueAt: Date }}
 */
export function planCancelReset({ timing, nextBillingDate, now = new Date() }) {
    if (timing !== "period_end") return { action: "reset_now" };

    const dueAt = nextBillingDate ? new Date(nextBillingDate) : null;
    if (!dueAt || Number.isNaN(dueAt.getTime())) return { action: "reset_now" };
    if (dueAt.getTime() <= now.getTime()) return { action: "reset_now" };

    return { action: "defer", dueAt };
}

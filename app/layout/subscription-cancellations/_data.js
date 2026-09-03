/**
 * Client-safe constants + pure helpers — imported by both the loader
 * (server) and client code (_hooks.js / components). Never import prisma or
 * anything server-only here — see _data.server.js for that.
 */

export const VALID_STATUSES = ["ALL", "NEEDS_ACTION", "APPLIED"];

export const FILTER_TABS = [
    { value: "ALL", label: "All" },
    { value: "NEEDS_ACTION", label: "Needs Action" },
    { value: "APPLIED", label: "Reset Applied" },
];

export const DEFAULT_PER_PAGE = 20;
export const MAX_PER_PAGE = 100;

/**
 * Human label for why a reset was skipped.
 */
export const SKIP_REASON_LABEL = {
    FEATURE_DISABLED: "Auto-reset was off",
    CUSTOMER_NOT_ENROLLED: "Not enrolled in loyalty program",
    ALREADY_ZERO: "Balance was already 0",
    // Deliberately NOT the same bucket as ALREADY_ZERO, even though both are
    // "nothing to reset" today — a negative balance is a real REVERSAL debt
    // (see createTransaction.js), not an empty balance, and resetting it to
    // 0 would forgive that debt through a side door subscription-cancel was
    // never meant to open. Labeled distinctly so the audit trail says what
    // actually happened instead of the factually wrong "balance was 0".
    NEGATIVE_BALANCE: "Balance is negative (existing debt) — left untouched",
};

/**
 * skipReason values that mean "genuinely nothing for an admin to act on" —
 * as opposed to FEATURE_DISABLED/CUSTOMER_NOT_ENROLLED, where a reset is
 * still possible/desired once the blocker is resolved. Centralized here
 * because this exact "is this row actionable" question is asked from
 * several places (the events list filter, the dashboard stats, the
 * customer-profile stat card, row selection for bulk actions) — duplicating
 * the check risked one of them drifting out of sync with the others.
 */
export const NON_ACTIONABLE_SKIP_REASONS = ["ALREADY_ZERO", "NEGATIVE_BALANCE"];

/**
 * @param {{ resetApplied: boolean, skipReason: string|null }} event
 * @returns {boolean}
 */
export function isActionable(event) {
    return !event.resetApplied && !NON_ACTIONABLE_SKIP_REASONS.includes(event.skipReason);
}

/**
 * @param {string} value
 * @param {number} fallback
 * @param {number} [min]
 * @param {number} [max]
 * @returns {number}
 */
export function parseIntParam(value, fallback, min = -Infinity, max = Infinity) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

/**
 * Builds the Prisma `where` clause for the events list query from the
 * current status tab. NEEDS_ACTION excludes NON_ACTIONABLE_SKIP_REASONS —
 * see that constant for why those skip reasons mean there's genuinely
 * nothing for an admin to act on.
 *
 * @param {string} sessionId
 * @param {string} status - One of VALID_STATUSES
 * @returns {Object}
 */
export function buildWhere(sessionId, status) {
    const where = { sessionId };
    if (status === "APPLIED") where.resetApplied = true;
    if (status === "NEEDS_ACTION") {
        where.resetApplied = false;
        where.skipReason = { notIn: NON_ACTIONABLE_SKIP_REASONS };
    }
    return where;
}

/**
 * @param {string|Date|null} d
 * @returns {string}
 */
export function formatDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    });
}

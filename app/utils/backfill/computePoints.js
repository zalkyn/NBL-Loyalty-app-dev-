/**
 * @file utils/backfill/computePoints.js
 * @description Pure calculation functions for POINTS_BACKFILL — turning a
 * ShadowRule + a customer's Shopify amountSpent into an actual points
 * award. No I/O, no Prisma, no Shopify client — fully synchronous and
 * deterministic on purpose, so the exact same inputs always produce the
 * exact same result (a completed backfill run must stay reproducible —
 * see PointsBackfillEntry.amountSpent's schema comment).
 */

/**
 * Computes the BACKFILL points a customer should receive under a
 * ShadowRule, from their Shopify lifetime amountSpent.
 *
 * Mirrors calcPoints()'s floor()-based integer math in
 * server/jobs/orderPaidJob.js (see that file's own comment for the
 * per-order-line-item version this is modeled on) — applied once to a
 * lifetime total instead of per order line item.
 *
 * FIXED is deliberately spend-independent: a customer's amountSpent is
 * NOT checked against zero for that branch, because a flat "welcome
 * back" grant is meant to apply to every audience-matched customer
 * regardless of how much (or how little) they've spent — that's the
 * whole point of offering FIXED as an option instead of always requiring
 * PER_AMOUNT. Only PER_AMOUNT's floor() division actually depends on a
 * positive amountSpent.
 *
 * @param {Object} shadowRule
 * @param {"FIXED"|"PER_AMOUNT"} shadowRule.rateType
 * @param {number|null} shadowRule.fixedPoints   - Used when rateType = "FIXED"
 * @param {number|null} shadowRule.perAmount     - Used when rateType = "PER_AMOUNT"
 * @param {number|null} shadowRule.pointsPerUnit - Used when rateType = "PER_AMOUNT"
 * @param {number|null} [shadowRule.maxPoints]   - Optional ceiling, applied after the rate calculation
 * @param {number|string} amountSpent - Customer's lifetime spend, in the
 *   SAME currency as shadowRule.currencyCode. Caller must have already
 *   verified this for PER_AMOUNT rules — see currencyMatches() below.
 * @returns {number} Points to award. Always a non-negative integer.
 * @throws {Error} If shadowRule.rateType isn't a recognized value — same
 *   "unknown type must throw, never silently no-op" philosophy as
 *   createTransaction.js's own `default: throw` for an unknown
 *   Transaction.type. A silent 0 here would look identical to a
 *   legitimately-computed zero award, hiding a real rule-configuration bug
 *   behind an entry that looks like it succeeded.
 */
export function computePoints(shadowRule, amountSpent) {
    const spent = Number(amountSpent) || 0;

    let points;
    switch (shadowRule.rateType) {
        case "FIXED":
            points = Number(shadowRule.fixedPoints) || 0;
            break;

        case "PER_AMOUNT": {
            const perAmount = Number(shadowRule.perAmount);
            const pointsPerUnit = Number(shadowRule.pointsPerUnit) || 0;
            // Guard mirrors calcPoints()'s own amount<=0 guard in
            // orderPaidJob.js — a zero/negative perAmount would otherwise
            // divide by zero (Infinity) or flip the sign unexpectedly, and
            // zero/negative spend should simply earn nothing rather than
            // erroring.
            points = spent > 0 && perAmount > 0 ? Math.floor(spent / perAmount) * pointsPerUnit : 0;
            break;
        }

        default:
            throw new Error(`Unknown ShadowRule rateType: ${shadowRule.rateType}`);
    }

    if (shadowRule.maxPoints != null) {
        points = Math.min(points, shadowRule.maxPoints);
    }

    return Math.max(0, Math.floor(points));
}

/**
 * Verifies a Shopify customer's amountSpent currency matches the
 * ShadowRule's currencyCode.
 *
 * Checked PER CUSTOMER, not once per shop — Shopify Markets can present a
 * customer's amountSpent in a different currency depending on their
 * market, so a single shop-level currency check (e.g. shopCurrency.js)
 * isn't precise enough to catch every mismatch. See
 * ShadowRule.currencyCode's schema comment.
 *
 * Only meaningful for PER_AMOUNT rules — a FIXED rule's award doesn't
 * depend on amountSpent at all (see computePoints above), so a currency
 * mismatch has nothing to misprice. Callers should skip this check
 * entirely for rateType === "FIXED" rather than incorrectly SKIPPING an
 * otherwise-valid FIXED award over a currency field that was never used.
 *
 * @param {Object} shadowRule
 * @param {string} shadowRule.currencyCode
 * @param {{ amount: string|number, currencyCode: string }|null|undefined} amountSpent
 *   Customer.amountSpent from Shopify (see CUSTOMER_FIELDS in
 *   graphql/query/customers.js).
 * @returns {boolean}
 */
export function currencyMatches(shadowRule, amountSpent) {
    return amountSpent?.currencyCode === shadowRule.currencyCode;
}

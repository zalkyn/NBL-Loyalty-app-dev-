/**
 * @file utils/backfill/normalizeSegmentMemberGid.js
 * @description Converts a CustomerSegmentMember GID into the Customer GID
 * the rest of this app uses — and is deliberately paranoid about it.
 *
 * ── The problem ──────────────────────────────────────────────────────────
 * customerSegmentMembers returns members whose `id` looks like:
 *
 *     gid://shopify/CustomerSegmentMember/8675309
 *
 * NOT `gid://shopify/Customer/8675309`. The trailing integer is (as far as
 * anyone outside Shopify can tell) the same integer as the Customer id, so
 * the conversion is a plain string rewrite. Two independent confirmations:
 *
 *   - Shopify's own customer-segments guide shows the example response
 *     literally as `"gid://shopify/CustomerSegmentMember/CUSTOMER_ID"`.
 *   - A Shopify staff member confirmed it on the developer forum in July
 *     2025 ("the customerID and customerSegmentMember are currently 1:1
 *     using same ID, just as it was back in 2022"), on a thread opened
 *     specifically because a developer was unwilling to assume it.
 *
 * ── Why that isn't good enough on its own ────────────────────────────────
 * Note the word "currently" in that confirmation, and note that the API
 * reference for CustomerSegmentMember.id says only "The member's ID" — it
 * documents no relationship to Customer at all. The same staff reply
 * mentions the feedback was passed on to change the behaviour (to expose
 * the Customer GID directly), which is exactly the kind of change that
 * would silently break a rewrite like this one.
 *
 * This module is used to decide WHO GETS POINTS. If the assumption ever
 * stops holding, the failure mode is not "an error" — it's real points
 * awarded to the wrong real customers, with nothing in any response
 * indicating anything went wrong. That is unacceptable, so the rewrite
 * below is never used on its own: buildSnapshot.js verifies a sample of
 * rewritten GIDs against live Customer records before any snapshot is
 * marked READY, and aborts the whole snapshot if they don't line up.
 *
 * Keep the rewrite and the verification together. If someone later reuses
 * this helper somewhere new, they need to reuse the check with it.
 */

/** @constant {string} Prefix Shopify returns from customerSegmentMembers. */
const MEMBER_PREFIX = "gid://shopify/CustomerSegmentMember/";

/** @constant {string} Prefix everything else in this app expects. */
const CUSTOMER_PREFIX = "gid://shopify/Customer/";

/**
 * Rewrites a CustomerSegmentMember GID to a Customer GID.
 *
 * Strict by design — anything that isn't a well-formed member GID with a
 * purely numeric suffix returns null rather than being coerced. A member
 * this can't parse is a member the snapshot must drop and report, not one
 * to guess at.
 *
 * Already-normalised Customer GIDs pass through unchanged, so this is safe
 * to call twice (e.g. if Shopify does eventually start returning Customer
 * GIDs directly, this keeps working with no code change — the verification
 * in buildSnapshot.js would keep passing too).
 *
 * @param {string} memberGid - e.g. "gid://shopify/CustomerSegmentMember/8675309"
 * @returns {string|null} e.g. "gid://shopify/Customer/8675309", or null if
 *   the input isn't a shape this understands.
 *
 * @example
 * normalizeSegmentMemberGid("gid://shopify/CustomerSegmentMember/8675309");
 * // -> "gid://shopify/Customer/8675309"
 *
 * @example
 * normalizeSegmentMemberGid("gid://shopify/Customer/8675309");
 * // -> "gid://shopify/Customer/8675309"  (idempotent)
 *
 * @example
 * normalizeSegmentMemberGid("gid://shopify/Order/123");
 * // -> null
 */
export function normalizeSegmentMemberGid(memberGid) {
    if (typeof memberGid !== "string" || !memberGid) return null;

    if (memberGid.startsWith(CUSTOMER_PREFIX)) {
        return /^\d+$/.test(memberGid.slice(CUSTOMER_PREFIX.length)) ? memberGid : null;
    }

    if (!memberGid.startsWith(MEMBER_PREFIX)) return null;

    const numericId = memberGid.slice(MEMBER_PREFIX.length);

    // Purely numeric only. Shopify GIDs can carry a `?key=` query suffix on
    // some resource types; if that ever appears here the safe response is
    // to refuse, not to strip and hope.
    if (!/^\d+$/.test(numericId)) return null;

    return `${CUSTOMER_PREFIX}${numericId}`;
}

/**
 * Extracts just the numeric portion — for the places that need a bare id
 * rather than a GID (e.g. ordersCount's `customer_id:` search filter, see
 * customerOrderCount in graphql/query/customers.js).
 *
 * @param {string} gid
 * @returns {string|null}
 */
export function segmentMemberNumericId(gid) {
    const normalized = normalizeSegmentMemberGid(gid);
    return normalized ? normalized.slice(CUSTOMER_PREFIX.length) : null;
}

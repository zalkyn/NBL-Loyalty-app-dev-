// Manual approval of referral claims. Pure functions — no DB, no network.
//
// Why this exists: fraudulent accounts were claiming referral discount codes
// (and so, later, referral points) automatically. With this on, a claim does
// NOT create the Shopify discount code. It waits as PENDING_APPROVAL until the
// merchant approves it on the Referral Reviews page; only then is the code
// created and shown to the customer.
//
// Referral.status values added by this feature (status is a plain string, so
// no migration):
//   PENDING_APPROVAL — claimed, waiting for the merchant. No discount code yet.
//   ACTIVATING       — a merchant approval is in progress (guards double clicks).
//   REJECTED         — when discountCode is null this is a rejected CLAIM; when it
//                      has a code it is the older "reward rejected after the order".

export const CLAIM_STATUS = {
    PENDING_APPROVAL: "PENDING_APPROVAL",
    ACTIVATING: "ACTIVATING",
    REJECTED: "REJECTED",
};

/**
 * Whether the shop requires manual approval of every new referral claim.
 * Off unless the referral rule explicitly says so, so a shop that never
 * touched this behaves exactly as before.
 *
 * @param {{ referral?: { requireApproval?: boolean } }|null|undefined} conditions - the referral rule's conditions
 * @returns {boolean}
 */
export const requiresClaimApproval = (conditions) => conditions?.referral?.requireApproval === true;

/** A claim that is still waiting for the merchant's decision. */
export const isClaimPending = (referral) => referral?.status === CLAIM_STATUS.PENDING_APPROVAL;

/** A claim the merchant turned down (as opposed to a reward rejected after an order). */
export const isClaimRejected = (referral) =>
    referral?.status === CLAIM_STATUS.REJECTED && !referral?.discountCode;

/**
 * A claim can only be approved while the referred customer is still a new
 * customer. If they have placed an order since claiming, a "first order"
 * discount code would be useless to them, so the merchant must reject instead.
 *
 * @param {number|null|undefined} orderCount - the referred customer's orders in Shopify right now
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function canApproveClaim(orderCount) {
    const count = Number(orderCount);
    if (!Number.isFinite(count)) return { ok: false, reason: "could not check the customer's orders" };
    if (count > 0) return { ok: false, reason: "customer has placed an order since claiming" };
    return { ok: true };
}

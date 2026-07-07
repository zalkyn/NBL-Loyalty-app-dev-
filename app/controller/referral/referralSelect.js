/**
 * Default fields selected for all referral queries across
 * createReferral.js, getReferral.js, and updateReferral.js.
 *
 * Shared in one place so adding/removing a Referral field only needs one
 * edit instead of staying in sync across three files.
 *
 * Override per-call by passing a custom `select` object.
 */
export const DEFAULT_REFERRAL_SELECT = {
    id: true,
    referrerId: true,
    referredId: true,
    orderId: true,
    status: true,
    discountCode: true,
    discountInfo: true,
    discountUsed: true,
    rewardGiven: true,
    metadata: true,
    createdAt: true,
    updatedAt: true,
    subscriptionContractId: true,
};

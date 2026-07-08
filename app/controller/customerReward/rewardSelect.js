/**
 * Default fields selected for all reward queries across
 * createCustomerReward.js and getCustomerReward.js.
 *
 * Shared in one place so adding/removing a Reward field only needs one edit
 * instead of staying in sync across both files.
 *
 * Override per-call by passing a custom `select` object.
 */
export const DEFAULT_REWARD_SELECT = {
    id: true,
    title: true,
    event: true,
    type: true,
    code: true,
    rewardKey: true,
    orderId: true,
    pointsCost: true,
    status: true,
    discountUsed: true,
    usedAt: true,
    expiresAt: true,
    metadata: true,
    description: true,
    createdAt: true,
    updatedAt: true,
    rewardRuleId: true,
    customerId: true,
};

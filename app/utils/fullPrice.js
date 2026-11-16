// When a referral reward is due. Pure functions — no DB, no network.
//
// Why this exists: the first month of the membership is a promo (about A$1),
// and the referral reward used to be paid on that promo order. It should only
// be paid after the referred member's first payment at the full product price,
// which is usually their first renewal.
//
// "Full price" means the money actually paid reached the regular price, not
// that a certain payment number was reached.
//
// Two different questions, because the promo can be built two ways (a discount
// code taking money off the list price, or a cheaper selling-plan price):
//   isFullPriceOrder   — is THIS order already full price? Asked on the first
//                        order. Compares what was paid with the larger of the
//                        list price and the product's regular variant price, so a
//                        promo built into the plan price is still seen as a promo.
//   isReleasingPayment — is this later payment the one that releases the reward?
//                        Paid in full for what the order listed (no discount on
//                        it) AND more than the first order paid, so a promo that
//                        simply carries on is not mistaken for full price.

import { lineItemAmount } from "./paidAmount.js";

export const REWARD_TIMINGS = ["afterFullPrice", "firstOrder"];
export const DEFAULT_REWARD_TIMING = "afterFullPrice";
// 0 = a waiting reward never expires. Kept at 0 until we know how long the promo can run: a
// promo longer than a month (or a long gap before the first full payment) would otherwise
// close rewards that are still going to be earned. The merchant can set a number of days.
export const DEFAULT_EXPIRY_DAYS = 0;

// What the payment that releases a waiting reward pays.
//   "referralOnly" (default): the referral reward only; renewal points start from the next payment.
//   "referralAndRenewal":     the referral reward AND that payment's renewal points.
export const RELEASE_PAYS = ["referralOnly", "referralAndRenewal"];
export const DEFAULT_RELEASE_PAYS = "referralOnly";

const EPSILON = 0.005;
const money = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const round2 = (value) => Math.round(value * 100) / 100;
// Tax is counted the same way on both sides of every comparison here.
const COUNT_ALL = { discounts: "after", tax: "include" };

/** When the reward is given. Anything missing or unknown means the new default. */
export function readRewardTiming(referralConditions) {
    const value = referralConditions?.rewardTiming;
    return REWARD_TIMINGS.includes(value) ? value : DEFAULT_REWARD_TIMING;
}

/** What the releasing payment pays. Anything missing or unknown means referral reward only. */
export function readReleasePays(referralConditions) {
    const value = referralConditions?.releasePays;
    return RELEASE_PAYS.includes(value) ? value : DEFAULT_RELEASE_PAYS;
}

/** Days a waiting reward is kept. 0 = never expires. Missing or invalid = the default (0). */
export function readExpiryDays(referralConditions) {
    const raw = referralConditions?.rewardExpiryDays;
    if (raw === undefined || raw === null || raw === "") return DEFAULT_EXPIRY_DAYS;
    const days = Math.floor(Number(raw));
    return Number.isFinite(days) && days >= 0 ? days : DEFAULT_EXPIRY_DAYS;
}

/**
 * Totals for an order's lines.
 * @param {Array<{ price?: any, paid_price?: any, variant_price?: any, quantity?: number }>} items
 * @returns {{ paid: number, list: number, regular: number }}
 */
export function orderAmounts(items) {
    let paid = 0;
    let list = 0;
    let regular = 0;
    for (const item of items ?? []) {
        const quantity = item?.quantity || 1;
        const listLine = money(item?.price) * quantity;
        const variantLine = item?.variant_price == null ? 0 : money(item.variant_price) * quantity;
        paid += lineItemAmount(item, COUNT_ALL);
        list += listLine;
        regular += Math.max(listLine, variantLine);
    }
    return { paid: round2(paid), list: round2(list), regular: round2(regular) };
}

/** What was paid on the first order — remembered so the releasing payment must beat it. */
export const amountPaid = (items) => orderAmounts(items).paid;

/** True when this order was paid at the regular price, so a reward can be given straight away. */
export function isFullPriceOrder(items) {
    const { paid, regular } = orderAmounts(items);
    return paid > 0 && paid + EPSILON >= regular;
}

/**
 * True when this later payment is the first at full price.
 * @param {Array} items
 * @param {number|string|null|undefined} firstPaid - what the first (promo) order paid
 */
export function isReleasingPayment(items, firstPaid) {
    const { paid, list } = orderAmounts(items);
    if (!(paid > 0)) return false;
    if (paid + EPSILON < list) return false;
    return paid > money(firstPaid) + EPSILON;
}

/**
 * Whether a waiting reward has passed its expiry.
 * @param {string|Date|null|undefined} since - when it started waiting
 * @param {number} days - 0 = never
 * @param {number} [now]
 */
export function isExpired(since, days, now = Date.now()) {
    if (!(days > 0)) return false;
    const start = new Date(since).getTime();
    if (!Number.isFinite(start)) return false;
    return now - start >= days * 24 * 60 * 60 * 1000;
}

/**
 * @file scripts/test/fullPrice.test.js
 * @description Unit tests for deciding when a referral reward is due (utils/fullPrice.js). Pure, no DB.
 */

import {
    readRewardTiming, readExpiryDays, isFullPriceOrder, isReleasingPayment, amountPaid, isExpired,
} from "../../app/utils/fullPrice.js";
import { suite, checkEqual } from "./lib/assert.js";

const line = (o) => ({ quantity: 1, ...o });
const DAY = 24 * 60 * 60 * 1000;

export async function run() {
    await suite("fullPrice", async () => {
        await checkEqual("timing defaults to after full price", readRewardTiming(undefined), "afterFullPrice");
        await checkEqual("timing keeps the old option", readRewardTiming({ rewardTiming: "firstOrder" }), "firstOrder");
        await checkEqual("timing ignores junk", readRewardTiming({ rewardTiming: "later" }), "afterFullPrice");
        await checkEqual("expiry defaults to 60 days", readExpiryDays(undefined), 60);
        await checkEqual("expiry 0 means never", readExpiryDays({ rewardExpiryDays: 0 }), 0);
        await checkEqual("expiry accepts a number", readExpiryDays({ rewardExpiryDays: "30" }), 30);
        await checkEqual("expiry ignores a negative", readExpiryDays({ rewardExpiryDays: -5 }), 60);

        // First order
        await checkEqual("A$1 promo via discount code is NOT full price", isFullPriceOrder([line({ price: "49", paid_price: "1", variant_price: "49" })]), false);
        await checkEqual("A$1 promo built into the plan price is NOT full price", isFullPriceOrder([line({ price: "1", paid_price: "1", variant_price: "49" })]), false);
        await checkEqual("a normal full-price first order is full price", isFullPriceOrder([line({ price: "49", paid_price: "49", variant_price: "49" })]), true);
        await checkEqual("free order is never full price", isFullPriceOrder([line({ price: "49", paid_price: "0", variant_price: "49" })]), false);
        await checkEqual("without variant info the list price is the reference", isFullPriceOrder([line({ price: "49", paid_price: "49" })]), true);
        await checkEqual("quantity is counted", isFullPriceOrder([line({ price: "49", paid_price: "49", variant_price: "49", quantity: 2 })]), true);
        await checkEqual("amountPaid sums the paid lines", amountPaid([line({ price: "49", paid_price: "1" }), line({ price: "10", paid_price: "10" })]), 11);

        // Later payment
        const full = [line({ price: "49", paid_price: "49", variant_price: "49" })];
        await checkEqual("first renewal at full price after a A$1 promo releases", isReleasingPayment(full, 1), true);
        await checkEqual("a renewal that is still A$1 does not release", isReleasingPayment([line({ price: "1", paid_price: "1", variant_price: "49" })], 1), false);
        await checkEqual("a renewal still discounted does not release", isReleasingPayment([line({ price: "49", paid_price: "30" })], 1), false);
        await checkEqual("plan price below the variant price still releases (subscribe & save)", isReleasingPayment([line({ price: "44", paid_price: "44", variant_price: "49" })], 1), true);
        await checkEqual("a free renewal does not release", isReleasingPayment([line({ price: "49", paid_price: "0" })], 1), false);
        await checkEqual("must pay more than the first order did", isReleasingPayment(full, 49), false);

        // Expiry
        const now = Date.UTC(2026, 10, 16);
        await checkEqual("not expired before the limit", isExpired(new Date(now - 59 * DAY), 60, now), false);
        await checkEqual("expired at the limit", isExpired(new Date(now - 60 * DAY), 60, now), true);
        await checkEqual("0 days never expires", isExpired(new Date(now - 900 * DAY), 0, now), false);
        await checkEqual("a missing start date never expires", isExpired(undefined, 60, now), false);
    });
}

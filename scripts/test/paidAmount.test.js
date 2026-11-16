/**
 * @file scripts/test/paidAmount.test.js
 * @description Unit tests for the amount a line item earns points on (utils/paidAmount.js). Pure, no DB.
 */

import { lineItemAmount, readBasis, DEFAULT_BASIS } from "../../app/utils/paidAmount.js";
import { suite, checkEqual } from "./lib/assert.js";

const after = { discounts: "after", tax: "include" };
const before = { discounts: "before", tax: "include" };

export async function run() {
    await suite("paidAmount", async () => {
        await checkEqual("defaults: after discounts, tax counted", DEFAULT_BASIS, { discounts: "after", tax: "include" });
        await checkEqual("readBasis with nothing saved gives the defaults", readBasis(undefined), DEFAULT_BASIS);
        await checkEqual("readBasis ignores unknown values", readBasis({ basis: { discounts: "x", tax: "y" } }), DEFAULT_BASIS);
        await checkEqual("readBasis keeps valid values", readBasis({ basis: { discounts: "before", tax: "exclude" } }), { discounts: "before", tax: "exclude" });

        // The reported bug: a 100% discount code, paid A$0.00
        await checkEqual("fully discounted line earns on 0", lineItemAmount({ price: "233", paid_price: "0", quantity: 1 }, after), 0);
        await checkEqual("old behaviour (before discounts) still counts the list price", lineItemAmount({ price: "233", paid_price: "0", quantity: 1 }, before), 233);

        await checkEqual("normal order unchanged", lineItemAmount({ price: "40", paid_price: "40", quantity: 1 }, after), 40);
        await checkEqual("discount of 25% reduces the amount", lineItemAmount({ price: "40", paid_price: "30", quantity: 1 }, after), 30);
        await checkEqual("quantity multiplies the paid unit price", lineItemAmount({ price: "40", paid_price: "30", quantity: 3 }, after), 90);
        await checkEqual("A$1 promo line counts as 1", lineItemAmount({ price: "49", paid_price: "1", quantity: 1 }, after), 1);
        await checkEqual("no discount info falls back to the list price", lineItemAmount({ price: "40", quantity: 2 }, after), 80);
        await checkEqual("junk price is 0, not NaN", lineItemAmount({ price: "abc", paid_price: "abc" }, after), 0);

        const gst = { price: "110", paid_price: "110", quantity: 1, tax: "10", taxes_included: true };
        await checkEqual("tax counted by default", lineItemAmount(gst, after), 110);
        await checkEqual("tax excluded when prices include tax", lineItemAmount(gst, { discounts: "after", tax: "exclude" }), 100);
        await checkEqual("tax exclude does nothing when prices exclude tax", lineItemAmount({ ...gst, taxes_included: false }, { discounts: "after", tax: "exclude" }), 110);
        await checkEqual("tax exclude never goes below 0", lineItemAmount({ price: "5", paid_price: "5", tax: "9", taxes_included: true }, { discounts: "after", tax: "exclude" }), 0);
        await checkEqual("rounds to cents", lineItemAmount({ price: "10", paid_price: "3.333", quantity: 1 }, after), 3.33);
    });
}

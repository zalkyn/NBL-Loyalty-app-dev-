/**
 * @file scripts/test/minOrderAmount.test.js
 * @description Unit tests for the minimum-purchase validation shared by the
 * reward-rule and referral forms and their server handlers. Pure, no DB.
 */

import { minOrderAmountError } from "../../app/utils/minOrderAmount.js";
import { suite, checkEqual } from "./lib/assert.js";

const isError = (v) => typeof v === "string" && v.length > 0;

export async function run() {
    await suite("minOrderAmount", async () => {
        await checkEqual("null = no minimum, always valid", minOrderAmountError(null, "fixed", 20), null);
        await checkEqual("undefined = no minimum", minOrderAmountError(undefined, "fixed", 20), null);
        await checkEqual("0 is rejected", isError(minOrderAmountError(0, "fixed", 20)), true);
        await checkEqual("negative is rejected", isError(minOrderAmountError(-5, "percentage", 10)), true);
        await checkEqual("NaN is rejected", isError(minOrderAmountError("abc", "fixed", 20)), true);
        await checkEqual("fixed $20 with $5 minimum is rejected", isError(minOrderAmountError(5, "fixed", 20)), true);
        await checkEqual("fixed $20 with $20 minimum is rejected (order is still free)", isError(minOrderAmountError(20, "fixed", 20)), true);
        await checkEqual("fixed $20 with $50 minimum is fine", minOrderAmountError(50, "fixed", 20), null);
        await checkEqual("fixed with the amount as a string", minOrderAmountError("50", "fixed", "20"), null);
        await checkEqual("percentage with any positive minimum is fine", minOrderAmountError(5, "percentage", 100), null);
    });
}

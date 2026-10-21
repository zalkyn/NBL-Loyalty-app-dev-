/**
 * @file scripts/test/currency.test.js
 * @description Unit tests for utils/currency.js — the single place the store
 * currency becomes a display symbol. Pure, no DB/network.
 */

import { currencySymbol, formatMoney } from "../../app/utils/currency.js";
import { suite, checkEqual } from "./lib/assert.js";

export async function run() {
    await suite("currency", async () => {
        await checkEqual("USD → $", currencySymbol("USD"), "$");
        await checkEqual("AUD → A$ (distinguishable from USD)", currencySymbol("AUD"), "A$");
        await checkEqual("lowercase code is accepted", currencySymbol("aud"), "A$");
        await checkEqual("missing code → empty, never a guessed $", currencySymbol(null), "");
        await checkEqual("invalid code → empty, never a guessed $", currencySymbol("NOPE!"), "");
        await checkEqual("formatMoney", formatMoney(20, "AUD"), "A$20");
        await checkEqual("formatMoney with unknown currency keeps the bare number", formatMoney(20, null), "20");
    });
}

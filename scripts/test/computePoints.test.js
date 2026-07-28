/**
 * @file scripts/test/computePoints.test.js
 * @description Unit tests for utils/backfill/computePoints.js. Pure
 * functions, no DB/network — safe to run anywhere, anytime.
 */

import { computePoints, currencyMatches } from "../../app/utils/backfill/computePoints.js";
import { suite, check, checkEqual, checkThrows } from "./lib/assert.js";

export async function run() {
    await suite("computePoints — FIXED", async () => {
        await checkEqual("normal spend", computePoints({ rateType: "FIXED", fixedPoints: 200 }, 500), 200);
        await checkEqual(
            "zero spend still awards — FIXED is spend-independent",
            computePoints({ rateType: "FIXED", fixedPoints: 200 }, 0),
            200
        );
        await checkEqual(
            "maxPoints caps it",
            computePoints({ rateType: "FIXED", fixedPoints: 200, maxPoints: 100 }, 500),
            100
        );
        await checkEqual(
            "missing fixedPoints defaults to 0, not NaN/undefined",
            computePoints({ rateType: "FIXED" }, 500),
            0
        );
    });

    await suite("computePoints — PER_AMOUNT", async () => {
        await checkEqual(
            "floor division — 1pt per $10, spent $505 -> 50",
            computePoints({ rateType: "PER_AMOUNT", perAmount: 10, pointsPerUnit: 1 }, 505),
            50
        );
        await checkEqual(
            "exact multiple",
            computePoints({ rateType: "PER_AMOUNT", perAmount: 10, pointsPerUnit: 1 }, 500),
            50
        );
        await checkEqual(
            "zero spend -> 0, no throw/Infinity",
            computePoints({ rateType: "PER_AMOUNT", perAmount: 10, pointsPerUnit: 1 }, 0),
            0
        );
        await checkEqual(
            "perAmount=0 guard — no divide-by-zero Infinity",
            computePoints({ rateType: "PER_AMOUNT", perAmount: 0, pointsPerUnit: 5 }, 500),
            0
        );
        await checkEqual(
            "negative spend -> 0",
            computePoints({ rateType: "PER_AMOUNT", perAmount: 10, pointsPerUnit: 1 }, -50),
            0
        );
        await checkEqual(
            "maxPoints caps it",
            computePoints({ rateType: "PER_AMOUNT", perAmount: 1, pointsPerUnit: 1, maxPoints: 100 }, 500),
            100
        );
    });

    await suite("computePoints — invalid input", async () => {
        await checkThrows("unknown rateType throws (never silently returns 0)", () => {
            computePoints({ rateType: "BOGUS" }, 100);
        });
    });

    await suite("currencyMatches", async () => {
        await checkEqual("same currency", currencyMatches({ currencyCode: "USD" }, { amount: "10", currencyCode: "USD" }), true);
        await checkEqual("different currency", currencyMatches({ currencyCode: "USD" }, { amount: "10", currencyCode: "BDT" }), false);
        await checkEqual("null amountSpent", currencyMatches({ currencyCode: "USD" }, null), false);
        await checkEqual("undefined amountSpent", currencyMatches({ currencyCode: "USD" }, undefined), false);
    });
}

// Allow running this file directly: node scripts/test/computePoints.test.js
if (import.meta.url === `file://${process.argv[1]}`) {
    const { report } = await import("./lib/assert.js");
    await run();
    process.exit(report() ? 0 : 1);
}

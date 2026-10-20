/**
 * @file scripts/test/cancelResetTiming.test.js
 * @description Unit tests for planCancelReset in utils/subscriptionCancelReset.js
 * — the rule for resetting points now versus when the paid period ends.
 */

import { planCancelReset } from "../../app/utils/subscriptionCancelReset.js";
import { suite, checkEqual } from "./lib/assert.js";

const now = new Date("2026-10-20T00:00:00Z");

export async function run() {
    await suite("planCancelReset", async () => {
        await checkEqual("immediate timing always resets now",
            planCancelReset({ timing: "immediate", nextBillingDate: "2027-10-20T00:00:00Z", now }), { action: "reset_now" });

        await checkEqual("period_end with a future billing date waits for it (yearly plan)",
            planCancelReset({ timing: "period_end", nextBillingDate: "2027-10-20T00:00:00Z", now }),
            { action: "defer", dueAt: new Date("2027-10-20T00:00:00Z") });

        await checkEqual("period_end with a billing date next month waits (monthly plan)",
            planCancelReset({ timing: "period_end", nextBillingDate: "2026-11-04T18:00:00Z", now }),
            { action: "defer", dueAt: new Date("2026-11-04T18:00:00Z") });

        await checkEqual("period_end with a missing billing date resets now, never leaves it unreset",
            planCancelReset({ timing: "period_end", nextBillingDate: null, now }), { action: "reset_now" });

        await checkEqual("period_end with an unreadable billing date resets now",
            planCancelReset({ timing: "period_end", nextBillingDate: "not a date", now }), { action: "reset_now" });

        await checkEqual("period_end with a billing date already past resets now",
            planCancelReset({ timing: "period_end", nextBillingDate: "2026-10-19T00:00:00Z", now }), { action: "reset_now" });

        await checkEqual("an unknown timing falls back to resetting now",
            planCancelReset({ timing: "whenever", nextBillingDate: "2027-10-20T00:00:00Z", now }), { action: "reset_now" });
    });
}

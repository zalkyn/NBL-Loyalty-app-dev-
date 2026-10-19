// ─────────────────────────────────────────────────────────────────────────────
// Pure, client-safe. Turns the numbers from _health.server.js into the list of
// things a merchant should know about. Used by the Program Health page (full
// banners) and the dashboard (one short summary), so both always agree.
//
// tone: critical → points/rewards are not flowing, warning → a decision or
// check is waiting, info → nothing to do. Only critical and warning count as
// "needs attention".
// ─────────────────────────────────────────────────────────────────────────────

export function buildAttentionItems(health, shopCurrency) {
    const { referral, jobs, ruleCurrencies } = health;
    const mismatched = shopCurrency ? (ruleCurrencies ?? []).filter((c) => c !== shopCurrency) : [];
    const items = [];

    if (jobs.failed > 0) {
        items.push({
            key: "failed-jobs", tone: "critical",
            heading: "Some orders could not be processed",
            text: `${jobs.failed.toLocaleString()} order${jobs.failed > 1 ? "s" : ""} could not be processed in the last 30 days, so ${jobs.failed > 1 ? "their" : "its"} points or reversals were not applied. Try again now — it is safe, nothing is paid twice. If ${jobs.failed > 1 ? "they fail" : "it fails"} again, contact support${jobs.failedOrders?.length ? ` and quote ${jobs.failedOrders.length > 1 ? "these order IDs" : "this order ID"}: ${jobs.failedOrders.join(", ")}` : ""}.`,
            retry: true,
        });
    }
    if (referral.stuck > 0) {
        items.push({
            key: "stuck-referrals", tone: "critical",
            heading: "Referral rewards that were never recorded",
            text: `${referral.stuck.toLocaleString()} referred customer${referral.stuck > 1 ? "s" : ""} used the referral discount, but the referrer didn't receive points. You can add the points manually from the customer's page (Adjust points).`,
            action: { label: "Open Referral Reviews", href: "/app/referral-reviews" },
        });
    }
    if (referral.held > 0) {
        items.push({
            key: "held-referrals", tone: "warning",
            heading: "Referral rewards are waiting for your decision",
            text: `${referral.held.toLocaleString()} referral reward${referral.held > 1 ? "s were" : " was"} held because the two accounts look like the same person or household. Approve to award the points, or reject.`,
            action: { label: "Review", href: "/app/referral-reviews" },
        });
    }
    if (mismatched.length) {
        items.push({
            key: "currency", tone: "warning",
            heading: "A points backfill rule is in a different currency",
            text: `Your store currency is ${shopCurrency}, but a backfill rule is saved in ${mismatched.join(", ")}. Customers whose spend is in ${shopCurrency} would be skipped. Open the rule and save it again to switch it, or create a new one if it has already been used.`,
            action: { label: "Open backfill rules", href: "/app/points-backfill-rules" },
        });
    }
    if (referral.ruleActive === false) {
        items.push({
            key: "rule-off", tone: "warning",
            heading: "Referral rewards are switched off",
            text: "The referral rule is inactive, so referred customers' orders earn nobody points. Customers are told when this happens.",
            action: { label: "Open referral rule", href: "/app/points-rules/referral" },
        });
    }
    if (jobs.waiting > 0) {
        items.push({
            key: "waiting", tone: "info",
            heading: "Some orders are being retried",
            text: `${jobs.waiting.toLocaleString()} order${jobs.waiting > 1 ? "s are" : " is"} being retried — usually because subscription details from Appstle hadn't arrived yet, or you just pressed Retry. You don't need to do anything; this notice disappears when they finish.`,
        });
    }
    return items;
}

/** The items that need the merchant to do something. */
export const needsAttention = (items) => items.filter((i) => i.tone === "critical" || i.tone === "warning");

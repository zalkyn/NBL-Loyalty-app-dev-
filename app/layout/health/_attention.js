// ─────────────────────────────────────────────────────────────────────────────
// Pure, client-safe. Turns the numbers from _health.server.js into the list of
// things a merchant should know about. Used by the Program Health page (full
// banners) and the dashboard (one short summary), so both always agree.
//
// tone: critical → points/rewards are not flowing, warning → a decision or
// check is waiting, info → nothing to do. Only critical and warning count as
// "needs attention".
//
// Every item can be hidden for a week ("snoozed") when the merchant can't deal
// with it right now. A hidden item leaves the banners, the status and the
// dashboard, and comes back on its own when the week ends or when the problem
// gets bigger than it was when it was hidden.
// ─────────────────────────────────────────────────────────────────────────────

export const SNOOZE_DAYS = 7;
export const SNOOZE_KEYS = ["failed-jobs", "stuck-referrals", "held-referrals", "currency", "rule-off"];

function allItems(health, shopCurrency) {
    const { referral, jobs, ruleCurrencies } = health;
    const mismatched = shopCurrency ? (ruleCurrencies ?? []).filter((c) => c !== shopCurrency) : [];
    const items = [];

    if (jobs.failed > 0) {
        const many = jobs.failed > 1;
        items.push({
            key: "failed-jobs", tone: "critical", count: jobs.failed,
            heading: "Some orders could not be processed",
            text: `${jobs.failed.toLocaleString()} order${many ? "s" : ""} could not be processed in the last 30 days, so ${many ? "their" : "its"} points (or the points taken back after a refund) were not applied. Customers on ${many ? "these orders" : "this order"} may be missing points.`,
            steps: [
                "Press Retry failed orders. It is safe: nothing is ever paid twice.",
                "Wait a few minutes, then press Check again near the top of this page.",
                `If ${many ? "they fail" : "it fails"} again, send support ${jobs.failedOrders?.length ? `${jobs.failedOrders.length > 1 ? "these order IDs" : "this order ID"} (${jobs.failedOrders.join(", ")})` : "the order IDs from the table below"}.`,
            ],
            retry: true,
            anchor: { label: "See the orders", id: "failed-orders" },
        });
    }
    if (referral.stuck > 0) {
        const many = referral.stuck > 1;
        items.push({
            key: "stuck-referrals", tone: "critical", count: referral.stuck,
            heading: "Some referral rewards were not paid",
            text: `${referral.stuck.toLocaleString()} referred customer${many ? "s" : ""} used the referral discount, but the person who shared the code did not receive points. The friend's discount worked normally; only the referrer's reward is missing.`,
            steps: [
                "Press Show who. It jumps to the list further down this page.",
                "In the list, press Open referrer next to the person who should be paid.",
                "On their page, press Adjust Points and add the referral points from your referral rule. Add a short note, for example \"Referral reward\".",
                "Come back here and press Mark as handled on that row. The row, and this notice, then disappear. (Only press it after you added the points, or decided not to pay.)",
            ],
            anchor: { label: "Show who", id: "stuck-referrals" },
        });
    }
    if (referral.held > 0) {
        const many = referral.held > 1;
        items.push({
            key: "held-referrals", tone: "warning", count: referral.held,
            heading: "Referral rewards are waiting for your decision",
            text: `${referral.held.toLocaleString()} referral reward${many ? "s were" : " was"} held back because the two accounts look like the same person or household. Nobody is accused of anything: the points simply wait until you decide.`,
            steps: [
                "Press Open Referral Reviews.",
                "Look at the two accounts side by side (name, address, email).",
                "Press Approve if they are really different people, so the points are paid. Press Reject if not.",
            ],
            action: { label: "Open Referral Reviews", href: "/app/referral-reviews" },
        });
    }
    if (mismatched.length) {
        items.push({
            key: "currency", tone: "warning", count: mismatched.length,
            heading: "A points backfill rule is in a different currency",
            text: `Your store currency is ${shopCurrency}, but a backfill rule is saved in ${mismatched.join(", ")}. Customers whose spend is in ${shopCurrency} would be skipped when it runs. Nothing is broken today; this only matters when you run that backfill.`,
            steps: [
                "Press Open backfill rules.",
                `If the rule has never been run: open it, then press Save again. It switches to ${shopCurrency}.`,
                "If it was already run: do not run it again (customers could get points twice). Create a new rule instead.",
                "Not planning a backfill? You can press Hide for 7 days.",
            ],
            action: { label: "Open backfill rules", href: "/app/points-backfill-rules" },
        });
    }
    if (referral.ruleActive === false) {
        items.push({
            key: "rule-off", tone: "warning", count: 1,
            heading: "Referral rewards are switched off",
            text: "The referral rule is inactive, so referred customers' orders earn nobody points. Customers are told when this happens.",
            steps: [
                "Press Open referral rule.",
                "Switch the rule on and save, if you want referral rewards running.",
                "If you switched it off on purpose, press Hide for 7 days.",
            ],
            action: { label: "Open referral rule", href: "/app/points-rules/referral" },
        });
    }
    if (jobs.waiting > 0) {
        items.push({
            key: "waiting", tone: "info", count: jobs.waiting,
            heading: "Some orders are being retried",
            text: `${jobs.waiting.toLocaleString()} order${jobs.waiting > 1 ? "s" : ""} could not be finished on the first try, so the app is trying again by itself. Nothing is lost and nobody is paid twice. The points are added as soon as an attempt works.`,
            stepsHeading: "What this means",
            steps: [
                "This is normal. It usually happens with subscription orders, because the subscription details from Appstle arrive a little after the order.",
                "You do not need to do anything. This notice goes away by itself when the orders finish.",
                "Press Check again in a few minutes to see if it is gone.",
                "If it is still here after a few hours, or it turns into a red \"Some orders could not be processed\" notice, press Retry failed orders there. If that does not help, send support the order IDs.",
            ],
        });
    }
    return items;
}

/** True while an item is hidden: inside its week, and not worse than when it was hidden. */
function isSnoozed(item, snoozes, now) {
    const s = snoozes?.[item.key];
    if (!s || !SNOOZE_KEYS.includes(item.key)) return false;
    return new Date(s.until).getTime() > now && item.count <= (s.count ?? 0);
}

/** The items to show now (hidden ones left out). */
export function buildAttentionItems(health, shopCurrency, now = Date.now()) {
    return allItems(health, shopCurrency).filter((i) => !isSnoozed(i, health.snoozes, now));
}

/** The items the merchant hid, with the date each comes back. */
export function buildHiddenItems(health, shopCurrency, now = Date.now()) {
    return allItems(health, shopCurrency)
        .filter((i) => isSnoozed(i, health.snoozes, now))
        .map((i) => ({ ...i, until: health.snoozes[i.key].until }));
}

/** The items that need the merchant to do something. */
export const needsAttention = (items) => items.filter((i) => i.tone === "critical" || i.tone === "warning");

import { count, timeAgo } from "../_format.js";

const TRIGGER_TEXT = {
    oneTime: "one-time orders only",
    subscription: "subscription orders only",
    both: "all orders",
};

/** A small label-over-number block. `tone` colours the number when it needs a look. */
function Stat({ label, value, tone }) {
    return (
        <s-stack direction="block" gap="small-500">
            <s-text color="subdued">{label}</s-text>
            <s-text type="strong" tone={tone}>{value}</s-text>
        </s-stack>
    );
}

function Card({ heading, status, text, stats, hint, linkLabel, href }) {
    return (
        <s-section heading={heading}>
            <s-stack direction="block" gap="base">
                {status && <s-badge tone={status.tone}>{status.label}</s-badge>}
                <s-text>{text}</s-text>
                {stats?.length > 0 && (
                    <s-grid gridTemplateColumns={`repeat(${Math.min(stats.length, 3)}, 1fr)`} gap="base">
                        {stats.map((s) => <Stat key={s.label} {...s} />)}
                    </s-grid>
                )}
                {hint && <s-text color="subdued">{hint}</s-text>}
                {href && <s-link href={href}>{linkLabel}</s-link>}
            </s-stack>
        </s-section>
    );
}

const bad = (value) => (value > 0 ? "critical" : undefined);
const watch = (value) => (value > 0 ? "info" : undefined);

/**
 * "How each feature works, and how it is doing". The explanations are static;
 * the numbers come from the loaders. `details` is null if its queries failed,
 * in which case the cards still show with what the base health data has.
 */
export function FeatureHealth({ health, details }) {
    const { referral, jobs } = health;
    const d = details;

    const referralStatus = referral.ruleActive === null
        ? { tone: "neutral", label: "Not set up" }
        : referral.ruleActive
            ? { tone: "success", label: "Active" }
            : { tone: "warning", label: "Switched off" };

    return (
        <s-box paddingBlockEnd="base">
            <s-grid gridTemplateColumns="repeat(auto-fit, minmax(300px, 1fr))" gap="base" alignItems="stretch">
                <Card
                    heading="Order processing"
                    status={jobs.failed > 0 ? { tone: "critical", label: `${jobs.failed} failed` } : { tone: "success", label: "Running" }}
                    text="Every paid order is processed in the background to award points. If something isn't ready yet (for example subscription details from Appstle) the order is retried automatically instead of being skipped."
                    stats={[
                        ...(d ? [
                            { label: "Orders processed (30 days)", value: count(d.orders.processed30d) },
                            { label: "Last processed", value: timeAgo(d.orders.lastProcessedAt) },
                        ] : []),
                        { label: "Failed (30 days)", value: count(jobs.failed), tone: bad(jobs.failed) },
                    ]}
                    hint={jobs.waiting > 0 ? `${count(jobs.waiting)} being retried right now.` : "Nothing is waiting to be retried."}
                />

                <Card
                    heading="Referrals"
                    status={referralStatus}
                    text={`A customer shares their code; when a friend uses it on their first order, both can earn points${referral.trigger ? ` (currently ${TRIGGER_TEXT[referral.trigger] ?? referral.trigger})` : ""}. Before paying, the app compares the two accounts: strong matches are held for your approval, weaker ones are paid and flagged.`}
                    stats={[
                        { label: "Waiting for you", value: count(referral.held), tone: watch(referral.held) },
                        { label: "Flagged (30 days)", value: count(referral.flagged30d) },
                        { label: "Skipped by rule (30 days)", value: count(referral.skipped30d) },
                    ]}
                    hint={referral.stuck > 0 ? `${count(referral.stuck)} used the discount but the referrer was never paid. See the banner above.` : undefined}
                    linkLabel="Open Referral Reviews"
                    href="/app/referral-reviews"
                />

                {d && (
                    <Card
                        heading="Rewards and vouchers"
                        status={d.checklist.rewardRules > 0 ? { tone: "success", label: `${d.checklist.rewardRules} active` } : { tone: "warning", label: "No rewards" }}
                        text="When a customer redeems points, the app takes the points and creates a one-time discount code in Shopify for that customer. The reward is marked used once the code is spent at checkout."
                        stats={[
                            { label: "Vouchers created (30 days)", value: count(d.vouchers.created30d) },
                            { label: "Vouchers used (30 days)", value: count(d.vouchers.used30d) },
                        ]}
                        linkLabel="Open reward rules"
                        href="/app/rewards-rules"
                    />
                )}

                {d && (
                    <Card
                        heading="Physical prizes"
                        status={d.prizes.pending > 0 ? { tone: "info", label: `${d.prizes.pending} to handle` } : d.checklist.prizes > 0 ? { tone: "success", label: "Up to date" } : { tone: "neutral", label: "Not used" }}
                        text="Customers claim real products with points. Each claim is a request for you to fulfil and deliver, moving it from Pending to Fulfilled to Completed."
                        stats={[
                            { label: "Pending requests", value: count(d.prizes.pending), tone: watch(d.prizes.pending) },
                            { label: "New, not yet opened", value: count(d.prizes.unseen), tone: watch(d.prizes.unseen) },
                        ]}
                        linkLabel="Open Physical Prize Claims"
                        href="/app/physical-prizes-claims-manage"
                    />
                )}

                {d && (
                    <Card
                        heading="Subscription cancellations"
                        status={d.subscriptions.needsAction > 0 ? { tone: "warning", label: `${d.subscriptions.needsAction} need action` } : { tone: "success", label: "Up to date" }}
                        text="When Appstle reports a cancellation, the app records it and resets the customer's points (immediately or when the paid period ends, as you chose). Cancellations that wait for you are listed under Needs Action."
                        stats={[
                            { label: "Need action", value: count(d.subscriptions.needsAction), tone: watch(d.subscriptions.needsAction) },
                            { label: "Scheduled resets", value: count(d.subscriptions.scheduled) },
                            { label: "Points reset (30 days)", value: count(d.subscriptions.reset30d) },
                        ]}
                        linkLabel="Open Subscription Cancellations"
                        href="/app/subscription-cancellations"
                    />
                )}

                {d && (
                    <Card
                        heading="Customer balances"
                        status={d.customers.negativeBalances > 0 ? { tone: "info", label: `${d.customers.negativeBalances} below zero` } : { tone: "success", label: "All fine" }}
                        text="A balance goes below zero when points from an order are taken back after the customer already spent them. They can't claim new rewards or prizes until it's back to zero or above."
                        stats={[{ label: "Customers below zero", value: count(d.customers.negativeBalances), tone: watch(d.customers.negativeBalances) }]}
                        hint="Open the customer and use Adjust Points to correct it, or leave it: future orders earn it back."
                        linkLabel="Open Customers"
                        href="/app/customers"
                    />
                )}

                <Card
                    heading="Customer messages"
                    text="Customers see a short message in the widget whenever points are added, removed, held, rejected or skipped. You can turn these pop-ups on or off in Widget Customize."
                    hint="Held and rejected referral rewards are explained to both customers in neutral wording, so nobody is accused of anything."
                    linkLabel="Customize the widget"
                    href="/app/customize"
                />
            </s-grid>
        </s-box>
    );
}

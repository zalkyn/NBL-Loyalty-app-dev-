import { isActionable } from "@app/layout/subscription-cancellations/_data";

/**
 * Four headline numbers. Everything else (rewards, prizes, cancellations,
 * referrals) is already shown in full in its own section below, so repeating
 * it as a dozen more boxes only buried these.
 */
function Kpi({ label, value, hint, tone }) {
    return (
        <s-section>
            <s-stack direction="block" gap="small-500">
                <s-text color="subdued">{label}</s-text>
                <s-heading>
                    <span style={tone === "critical" ? { color: "var(--p-color-text-critical, #d82c0d)" } : undefined}>{value}</span>
                </s-heading>
                {hint && <s-text color="subdued">{hint}</s-text>}
            </s-stack>
        </s-section>
    );
}

export function StatsGrid({ customer }) {
    const rewardStats = customer?.rewardStats ?? { total: 0, used: 0, active: 0, cancelled: 0 };
    const currentPoints = customer?.points ?? 0;

    return (
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
            <Kpi
                label="Current points"
                value={currentPoints.toLocaleString()}
                hint={currentPoints < 0 ? "Owes points" : "Available to spend"}
                tone={currentPoints < 0 ? "critical" : undefined}
            />
            <Kpi label="Lifetime points" value={(customer?.lifetimePoints ?? 0).toLocaleString()} hint="Earned in total" />
            <Kpi label="Orders" value={customer?.orderCount ?? "N/A"} hint="Total placed" />
            <Kpi
                label="Rewards"
                value={rewardStats.total}
                hint={`${rewardStats.active} active · ${rewardStats.used} used${rewardStats.cancelled ? ` · ${rewardStats.cancelled} cancelled` : ""}`}
            />
        </s-grid>
    );
}

/** Whether this customer has a cancelled subscription still waiting for its points reset. */
export const needsCancelReset = (customer) => (customer?.subscriptionCancelEvents ?? []).some(isActionable);

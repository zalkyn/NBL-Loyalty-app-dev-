function StatBox({ label, value, tone }) {
    return (
        <s-box padding="base" border="base" borderRadius="base" background="base">
            <s-heading>{label}</s-heading>
            <h3 style={{ marginBlock: "4px 0", color: tone === "critical" ? "var(--p-color-text-critical, #d82c0d)" : undefined }}>
                {value}
            </h3>
        </s-box>
    );
}

export function StatsGrid({ customer }) {
    const rewardStats = customer?.rewardStats ?? { total: 0, used: 0, active: 0, cancelled: 0 };
    const prizeClaimStats = customer?.prizeClaimStats ?? { total: 0, pending: 0, fulfilled: 0, completed: 0, cancelled: 0 };
    const currentPoints = customer?.points ?? 0;
    // Negative balance = a "debt" left over from a REVERSAL (order
    // cancelled/refunded after the customer already spent the points it
    // earned) — see createTransaction.js. Flagging it here so an admin
    // reviewing this customer notices immediately, since new reward/prize
    // claims are blocked until it's paid down but nothing else calls it out.
    const isInDebt = currentPoints < 0;

    return (
        <s-grid gridTemplateColumns="1fr 1fr" gap="base">
            <StatBox
                label="Current Points"
                value={currentPoints.toLocaleString() + (isInDebt ? " (owes points)" : "")}
                tone={isInDebt ? "critical" : undefined}
            />
            <StatBox label="Lifetime Points"      value={(customer?.lifetimePoints ?? 0).toLocaleString()} />
            <StatBox label="Activities Completed" value={customer?.transactions?.length ?? 0} />
            <StatBox label="Total Orders"         value={customer?.orderCount            ?? "N/A"} />

            <StatBox label="Rewards Claimed"      value={rewardStats.total} />
            <StatBox label="Rewards Used"         value={rewardStats.used} />
            <StatBox label="Rewards Active"       value={rewardStats.active} />
            <StatBox label="Rewards Cancelled"    value={rewardStats.cancelled} />

            <StatBox label="Prizes Claimed"       value={prizeClaimStats.total} />
            <StatBox label="Prizes Fulfilled"     value={prizeClaimStats.fulfilled + prizeClaimStats.completed} />

            <StatBox label="Referrals Used"       value={customer?.referralsUsed?.status ?? "N/A"} />
        </s-grid>
    );
}

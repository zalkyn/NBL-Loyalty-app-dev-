export function SummaryCard({ customer }) {
    const rewardStats = customer?.rewardStats ?? { total: 0, used: 0, active: 0 };
    return (
        <s-box padding="base" border="base" borderRadius="base" background="base">
            <h3 style={{ marginTop: 0 }}>Summary</h3>
            <p><strong>Email:</strong> {customer?.email ?? "N/A"}</p>
            <p><strong>Lifetime Points:</strong> {(customer?.lifetimePoints ?? 0).toLocaleString()}</p>
            <p><strong>Rewards claimed:</strong> {rewardStats.total} ({rewardStats.active} active, {rewardStats.used} used)</p>
            <p><strong>Referral Code:</strong> {customer?.referralCode ?? "N/A"}</p>
            <p><strong>Referrals Sent:</strong> {customer?.referralsSent?.length ?? 0}</p>
            <p><strong>Referral Used:</strong> {customer?.referralsUsed?.status ?? "N/A"}</p>
        </s-box>
    );
}

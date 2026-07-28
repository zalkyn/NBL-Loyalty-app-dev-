import { StatCardNew } from "./Cards";

const COLORS = {
    pointsEarned: "#1D9E75",
    pointsRedeemed: "#E24B4A",
    adjustmentsNet: "#8C6D1F",
    pointsBackfilled: "#7A4FBF",
    rewardsIssued: "#378ADD",
    activeRewards: "#BA7517",
    activeCustomers: "#534AB7",
};

export function OverviewSection({ stats }) {
    return (
        <s-section heading="Overview">
            <s-query-container>
                <s-grid
                    gridTemplateColumns="@container (inline-size > 500px) 1fr 1fr 1fr, 1fr"
                    gap="base"
                >
                    <s-grid-item><StatCardNew label="Points earned" value={stats.pointsEarned.toLocaleString()} color={COLORS.pointsEarned} /></s-grid-item>
                    <s-grid-item><StatCardNew label="Points redeemed" value={stats.pointsRedeemed.toLocaleString()} color={COLORS.pointsRedeemed} /></s-grid-item>
                    {/* Net of all manual admin balance corrections (ADJUST) in range —
                        signed, so a positive net shows "+" and a negative net shows "-"
                        via toLocaleString's own minus sign. Kept separate from Earned/
                        Redeemed since this isn't customer-driven activity. */}
                    <s-grid-item>
                        <StatCardNew
                            label="Adjustments"
                            value={`${stats.adjustmentsNet > 0 ? "+" : ""}${stats.adjustmentsNet.toLocaleString()}`}
                            color={COLORS.adjustmentsNet}
                            detail={`↑ ${stats.adjustmentsPositive.toLocaleString()}   ↓ ${stats.adjustmentsNegative.toLocaleString()}`}
                        />
                    </s-grid-item>
                    <s-grid-item><StatCardNew label="Rewards issued" value={stats.rewardsIssued.toLocaleString()} color={COLORS.rewardsIssued} /></s-grid-item>
                    <s-grid-item><StatCardNew label="Active rewards" value={stats.activeRewards.toLocaleString()} color={COLORS.activeRewards} /></s-grid-item>
                    <s-grid-item><StatCardNew label="Active customers" value={stats.activeCustomers.toLocaleString()} color={COLORS.activeCustomers} /></s-grid-item>
                    {/* One-time retroactive award for pre-install lifetime spend (see
                        ShadowRule/PointsBackfillEntry) — kept separate from "Points
                        earned" so a backfill run doesn't look like a spike in real,
                        order-driven earning. Always non-negative (createTransaction.js
                        throws on a negative BACKFILL), so no +/- sign needed here. */}
                    <s-grid-item><StatCardNew label="Points backfilled" value={stats.pointsBackfilled.toLocaleString()} color={COLORS.pointsBackfilled} /></s-grid-item>
                </s-grid>
            </s-query-container>
        </s-section>
    );
}
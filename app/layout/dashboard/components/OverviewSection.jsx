import { StatCardNew, periodBadge } from "./Cards";

const COLORS = {
    pointsEarned: "#1D9E75",
    pointsRedeemed: "#E24B4A",
    redemptionRate: "#0891B2",
    adjustmentsNet: "#8C6D1F",
    pointsBackfilled: "#7A4FBF",
    rewardsIssued: "#378ADD",
    activeRewards: "#BA7517",
    activeCustomers: "#534AB7",
    pointsLiability: "#B5179E",
    cancelTotal: "#6B7280",
    cancelAttention: "#DC2626",
    newEnrollments: "#16A34A",
    referralsSent: "#0D9488",
    referralConversionRate: "#CA8A04",
};

export function OverviewSection({ stats, chartData, rangeKey, periodComparison }) {
    return (
        <s-section heading="Overview">
            <s-query-container>
                {/* auto-fit, not a fixed column count — a fixed count crammed
                    labels like "Total claims" onto 2 lines when the container
                    was narrower than the count assumed (see PrizeStatsSection). */}
                <s-grid
                    gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))"
                    gap="base"
                >
                    <s-grid-item>
                        <StatCardNew
                            label="Points earned" value={stats.pointsEarned.toLocaleString()} color={COLORS.pointsEarned}
                            detail={periodBadge(periodComparison?.pointsEarned)}
                            sparkline={chartData?.earned} sparklineKey={rangeKey}
                        />
                    </s-grid-item>
                    <s-grid-item>
                        <StatCardNew
                            label="Points redeemed" value={stats.pointsRedeemed.toLocaleString()} color={COLORS.pointsRedeemed}
                            detail={periodBadge(periodComparison?.pointsRedeemed)}
                            sparkline={chartData?.redeemed} sparklineKey={rangeKey}
                        />
                    </s-grid-item>
                    {/* Share of points earned in range that have already come back as
                        a redemption — an in-range activity ratio, not a cohort
                        conversion rate (see overviewStats.redemptionRate's comment in
                        _hooks.js). No sparkline: a per-bucket ratio gets noisy/
                        misleading on buckets with little activity (dividing by a small
                        earned figure), unlike the other cards' plain per-bucket sums. */}
                    <s-grid-item>
                        <StatCardNew
                            label="Redemption rate" value={`${stats.redemptionRate.toFixed(1)}%`} color={COLORS.redemptionRate}
                        />
                    </s-grid-item>
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
                            sparkline={chartData?.adjustments} sparklineKey={rangeKey}
                        />
                    </s-grid-item>
                    <s-grid-item>
                        <StatCardNew
                            label="Rewards issued" value={stats.rewardsIssued.toLocaleString()} color={COLORS.rewardsIssued}
                            detail={periodBadge(periodComparison?.rewardsIssued)}
                            sparkline={chartData?.rewards} sparklineKey={rangeKey}
                        />
                    </s-grid-item>
                    {/* No sparkline — "Active" is a status filter on the same rewards
                        already charted above, not its own bucketed series. */}
                    <s-grid-item><StatCardNew label="Active rewards" value={stats.activeRewards.toLocaleString()} color={COLORS.activeRewards} /></s-grid-item>
                    {/* No sparkline — this is a live snapshot count (customer.count()
                        in _loader.server.js), not date-range/time-series data. */}
                    <s-grid-item><StatCardNew label="Active customers" value={stats.activeCustomers.toLocaleString()} color={COLORS.activeCustomers} /></s-grid-item>
                    {/* Total outstanding points across active customers right now —
                        also a live snapshot (prisma.customer.aggregate in
                        _loader.server.js), not date-range activity, so no sparkline
                        on the headline number itself. The detail line below IS
                        date-range activity though — net signed movement behind
                        that snapshot in the selected period (see
                        overviewStats.liabilityNetChange / dailyLiabilityAgg's
                        header comment in _loader.server.js) — same pattern as
                        Adjustments' ↑/↓ detail line above. */}
                    <s-grid-item>
                        <StatCardNew
                            label="Points liability" value={stats.pointsLiability.toLocaleString()} color={COLORS.pointsLiability}
                            detail={`${stats.liabilityNetChange > 0 ? "+" : ""}${stats.liabilityNetChange.toLocaleString()} this period`}
                        />
                    </s-grid-item>
                    {/* Live snapshot — all-time count from SubscriptionCancelEvent
                        (see _loader.server.js), not date-range filtered, so no
                        sparkline. Same numbers CancelNeedsActionBanner and the
                        dedicated Subscription Cancellations page use — turns red
                        when something needs the admin's attention, mirroring that
                        banner (this card is the ambient version, always visible;
                        the banner is the actionable callout). */}
                    <s-grid-item>
                        <StatCardNew
                            label="Subscription cancellations"
                            value={stats.cancelTotal.toLocaleString()}
                            color={stats.cancelNeedsAction > 0 ? COLORS.cancelAttention : COLORS.cancelTotal}
                            detail={stats.cancelNeedsAction > 0 ? `${stats.cancelNeedsAction.toLocaleString()} need action` : undefined}
                        />
                    </s-grid-item>
                    {/* One-time retroactive award for pre-install lifetime spend (see
                        ShadowRule/PointsBackfillEntry) — kept separate from "Points
                        earned" so a backfill run doesn't look like a spike in real,
                        order-driven earning. Always non-negative (createTransaction.js
                        throws on a negative BACKFILL), so no +/- sign needed here. */}
                    <s-grid-item>
                        <StatCardNew
                            label="Points backfilled" value={stats.pointsBackfilled.toLocaleString()} color={COLORS.pointsBackfilled}
                            sparkline={chartData?.backfilled} sparklineKey={rangeKey}
                        />
                    </s-grid-item>
                    {/* In-range count — how many customers enrolled DURING the
                        selected period (Customer.enrolledAt), not a live snapshot
                        like Active customers above. */}
                    <s-grid-item>
                        <StatCardNew
                            label="New enrollments" value={stats.newEnrollments.toLocaleString()} color={COLORS.newEnrollments}
                            detail={periodBadge(periodComparison?.newEnrollments)}
                            sparkline={chartData?.enrolled} sparklineKey={rangeKey}
                        />
                    </s-grid-item>
                    {/* In-range count of Referral rows created (a friend was invited),
                        not a live snapshot. */}
                    <s-grid-item>
                        <StatCardNew
                            label="Referrals sent" value={stats.referralsSent.toLocaleString()} color={COLORS.referralsSent}
                            detail={periodBadge(periodComparison?.referralsSent)}
                            sparkline={chartData?.referralsSent} sparklineKey={rangeKey}
                        />
                    </s-grid-item>
                    {/* Share of referrals sent in range that already converted
                        (status USED) — same in-range activity-ratio reasoning as
                        Redemption rate above, so no sparkline for the same reason. */}
                    <s-grid-item>
                        <StatCardNew
                            label="Referral conversion rate" value={`${stats.referralConversionRate.toFixed(1)}%`} color={COLORS.referralConversionRate}
                        />
                    </s-grid-item>
                </s-grid>
            </s-query-container>
        </s-section>
    );
}
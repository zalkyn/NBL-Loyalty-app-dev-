import { StatCardNew, periodBadge } from "./Cards";

const COLORS = {
    total:     "#534AB7",
    pending:   "#BA7517",
    fulfilled: "#378ADD",
    completed: "#1D9E75",
    cancelled: "#E24B4A",
    avgFulfillmentDays: "#0891B2",
};

export function PrizeStatsSection({ stats, chartData, rangeKey, periodComparison }) {
    // "Total" has no series of its own in chartData — it's the per-bucket
    // sum of the four status series below, computed here rather than
    // fabricated or left out.
    const totalSeries = chartData?.prizePending?.map(
        (v, i) => v + (chartData.prizeFulfilled?.[i] ?? 0) + (chartData.prizeCompleted?.[i] ?? 0) + (chartData.prizeCancelled?.[i] ?? 0)
    );

    return (
        <s-section heading="Physical Prizes">
            <s-query-container>
                <s-grid
                    gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))"
                    gap="base"
                >
                    <s-grid-item>
                        {/* "Total claims" (not just "Claims") wrapped to 2 lines and
                            unbalanced the card at 5-equal-columns width — shortened,
                            and the grid itself now reflows to fewer columns on narrower
                            containers instead of cramming 5 in regardless of space. */}
                        <StatCardNew label="Claims" value={stats.total.toLocaleString()} color={COLORS.total}
                            detail={periodBadge(periodComparison?.prizeClaimsTotal)}
                            sparkline={totalSeries} sparklineKey={rangeKey} />
                    </s-grid-item>
                    <s-grid-item>
                        <StatCardNew label="Pending" value={stats.pending.toLocaleString()} color={COLORS.pending}
                            sparkline={chartData?.prizePending} sparklineKey={rangeKey} />
                    </s-grid-item>
                    <s-grid-item>
                        <StatCardNew label="Fulfilled" value={stats.fulfilled.toLocaleString()} color={COLORS.fulfilled}
                            sparkline={chartData?.prizeFulfilled} sparklineKey={rangeKey} />
                    </s-grid-item>
                    <s-grid-item>
                        <StatCardNew label="Completed" value={stats.completed.toLocaleString()} color={COLORS.completed}
                            sparkline={chartData?.prizeCompleted} sparklineKey={rangeKey} />
                    </s-grid-item>
                    <s-grid-item>
                        <StatCardNew label="Cancelled" value={stats.cancelled.toLocaleString()} color={COLORS.cancelled}
                            sparkline={chartData?.prizeCancelled} sparklineKey={rangeKey} />
                    </s-grid-item>
                    {/* No sparkline — an average, not a per-bucket sum (same
                        reasoning as Redemption rate on the Overview section). */}
                    <s-grid-item>
                        <StatCardNew
                            label="Avg. fulfillment time"
                            value={stats.avgFulfillmentDays !== null ? `${stats.avgFulfillmentDays.toFixed(1)} days` : "—"}
                            color={COLORS.avgFulfillmentDays}
                        />
                    </s-grid-item>
                </s-grid>
            </s-query-container>
        </s-section>
    );
}

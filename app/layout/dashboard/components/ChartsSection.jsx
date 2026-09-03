import { ChartCard } from "./Cards";
import { RewardBreakdownChart } from "./RewardBreakdownChart";
import { TopCustomersChart } from "./TopCustomersChart";

export function ChartsSection({ chartData, rangeKey, chartOptions, rewardBreakdown, topCustomersChart }) {
    return (
        <>
            {/* Mixed bar + line — the four categories stay as bars (their
                relative sizes matter), with a "Net" line layered on top so
                a day dominated by one big category (e.g. a bulk admin
                adjustment) still visibly shows whether that day was a net
                gain or loss overall, not just "how tall is the brown bar".
                See pointsActivityNet's comment in _hooks.js for exactly
                what this line does and doesn't cover.

                Single shared axis, not dual — a dual-axis attempt (splitting
                Adjustments/Net onto their own right-side scale, to keep an
                occasional large Adjustments swing from flattening the other
                three bars) had to be reverted: ApexCharts groups the legend
                by axis when multiple yaxis are used, splitting it into
                separate per-axis columns instead of one inline row, with no
                simple override. Not worth that tradeoff for what's normally
                a rare spike (bulk admin corrections), not the everyday
                shape of this chart. */}
            <ChartCard
                heading="Points activity"
                chartKey={`points-${rangeKey}`}
                options={{
                    ...chartOptions(["#1D9E75", "#E24B4A", "#8C6D1F", "#7A4FBF", "#1F2937"]),
                    stroke: { curve: "smooth", width: [0, 0, 0, 0, 3] },
                }}
                series={[
                    { name: "Earned", type: "column", data: chartData.earned },
                    { name: "Redeemed", type: "column", data: chartData.redeemed },
                    { name: "Adjustments", type: "column", data: chartData.adjustments },
                    { name: "Backfilled", type: "column", data: chartData.backfilled },
                    { name: "Net", type: "line", data: chartData.pointsActivityNet },
                ]}
                type="line"
                height={320}
            />
            <ChartCard
                heading="Rewards issued"
                chartKey={`rewards-${rangeKey}`}
                options={chartOptions(["#378ADD"])}
                series={[{ name: "Rewards", data: chartData.rewards }]}
                type="area"
                height={280}
            />
            <ChartCard
                heading="New enrollments"
                chartKey={`enrollments-${rangeKey}`}
                options={chartOptions(["#16A34A"])}
                series={[{ name: "New customers", data: chartData.enrolled }]}
                type="area"
                height={280}
            />
            <ChartCard
                heading="Referral performance"
                chartKey={`referrals-${rangeKey}`}
                options={chartOptions(["#0D9488", "#CA8A04"])}
                series={[
                    { name: "Sent", data: chartData.referralsSent },
                    { name: "Converted", data: chartData.referralsConverted },
                ]}
                type="area"
                height={280}
            />
            {/* Cumulative running total within the selected range, not a
                reconstructed absolute history (see liabilityTrend's comment
                in _hooks.js) — shows the trajectory of outstanding points
                liability moving during this period. */}
            <ChartCard
                heading="Points liability trend"
                chartKey={`liability-${rangeKey}`}
                options={chartOptions(["#B5179E"])}
                series={[{ name: "Net liability change", data: chartData.liabilityTrend }]}
                type="line"
                height={280}
            />
            <RewardBreakdownChart rewardBreakdown={rewardBreakdown} rangeKey={rangeKey} />
            <TopCustomersChart topCustomersChart={topCustomersChart} />
        </>
    );
}
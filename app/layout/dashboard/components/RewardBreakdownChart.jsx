import { ChartCard } from "./Cards";

const DONUT_COLORS = ["#1D9E75", "#378ADD", "#7A4FBF", "#BA7517", "#E24B4A", "#0891B2", "#94A3B8"];

/**
 * Which specific rewards (by title — "Voucher $5" vs "Voucher $10", not the
 * shared rewardRule template) got redeemed in range. Deliberately a donut,
 * not another bar/area chart — every other chart on this page is a
 * time-series; this is the first "share of a whole" view, and reuses
 * `rewardBreakdown` (computed in _hooks.js from the SAME `rw` array the
 * "Rewards issued" chart and stat card already use) rather than a new fetch.
 */
export function RewardBreakdownChart({ rewardBreakdown, rangeKey }) {
    // Previously returned null here — silently rendering nothing reads as
    // "this chart is broken", not "no rewards were redeemed in this
    // period" (which is the far more common, entirely normal reason this
    // branch is hit — e.g. the "Today"/"Yesterday" presets on a quiet day).
    if (!rewardBreakdown?.series?.length) {
        return (
            <s-section heading="Reward redemption breakdown">
                <s-box padding="base">
                    <s-text tone="subdued">No rewards redeemed in this period.</s-text>
                </s-box>
            </s-section>
        );
    }

    const options = {
        chart: { fontFamily: "inherit" },
        labels: rewardBreakdown.labels,
        colors: DONUT_COLORS,
        legend: { position: "bottom", fontSize: "12px" },
        dataLabels: {
            enabled: true,
            formatter: (val) => `${val.toFixed(0)}%`,
        },
        tooltip: {
            y: { formatter: (val) => (typeof val === "number" ? val.toLocaleString() : val) },
        },
    };

    return (
        <ChartCard
            heading="Reward redemption breakdown"
            chartKey={`reward-breakdown-${rangeKey}`}
            options={options}
            series={rewardBreakdown.series}
            type="donut"
            height={320}
        />
    );
}

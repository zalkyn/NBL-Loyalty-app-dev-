import { ChartCard } from "./Cards";

// Gold / silver / bronze for the top 3 — every other chart on this page is
// a single flat color, but this one is a ranking, and rank is exactly the
// thing a leaderboard should read at a glance, not just the raw numbers.
const MEDAL_COLORS = ["#D4AF37", "#A8A8B3", "#C97F45"];
const BASE_COLOR = "#534AB7";

/** Mixes a hex color toward white by `amount` (0 = unchanged, 1 = white). */
function lighten(hex, amount) {
    const num = parseInt(hex.slice(1), 16);
    const mix = (c) => Math.round(c + (255 - c) * amount);
    const r = mix((num >> 16) & 0xff);
    const g = mix((num >> 8) & 0xff);
    const b = mix(num & 0xff);
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Top 10 active customers by current points balance — a live leaderboard
 * snapshot (topCustomersChart in _hooks.js, from a bounded `take: 10` query
 * in _loader.server.js), not date-range filtered like the activity charts
 * above it. Horizontal bars read customer names left-to-right more
 * comfortably than a vertical bar chart would at 10 categories.
 */
export function TopCustomersChart({ topCustomersChart }) {
    if (!topCustomersChart?.series?.length) return null;

    // Rank 1-3 get their medal color; the rest fade from the base purple
    // toward white the further down the list they are, so #4 and #10 are
    // visibly distinct from each other too, not just from the podium.
    const barColors = topCustomersChart.labels.map((_, i) => {
        if (i < MEDAL_COLORS.length) return MEDAL_COLORS[i];
        const tail = topCustomersChart.labels.length - MEDAL_COLORS.length;
        const t = tail > 1 ? (i - MEDAL_COLORS.length) / (tail - 1) : 0;
        return lighten(BASE_COLOR, 0.15 + t * 0.5);
    });
    // Medal tones are dark enough for white text; the faded tail needs dark
    // text past a certain lightness or the number disappears into the bar.
    const labelColors = barColors.map((_, i) => (i < MEDAL_COLORS.length ? "#fff" : "#3A3550"));

    const options = {
        chart: { fontFamily: "inherit", toolbar: { show: false } },
        plotOptions: {
            bar: { horizontal: true, borderRadius: 4, distributed: true },
        },
        colors: barColors,
        xaxis: {
            categories: topCustomersChart.labels,
            labels: { formatter: (val) => Number(val).toLocaleString() },
        },
        yaxis: { labels: { style: { fontSize: "12px" } } },
        legend: { show: false },
        dataLabels: {
            enabled: true,
            formatter: (val) => Number(val).toLocaleString(),
            style: { fontSize: "11px", colors: labelColors },
        },
        grid: { borderColor: "#e8e8e8", strokeDashArray: 4 },
        tooltip: {
            y: { formatter: (val) => `${Number(val).toLocaleString()} pts` },
        },
    };

    return (
        <ChartCard
            heading="Top customers by points"
            // Keyed only by data identity (not rangeKey, which tracks the
            // activity charts' date range) — this chart isn't affected by
            // the date range picker, so it shouldn't remount every time
            // that changes.
            chartKey={`top-customers-${topCustomersChart.labels.join("-")}`}
            options={options}
            series={[{ name: "Points", data: topCustomersChart.series }]}
            type="bar"
            height={Math.max(280, topCustomersChart.labels.length * 36)}
        />
    );
}

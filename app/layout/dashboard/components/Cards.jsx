import React, { Suspense } from "react";

const ReactApexChart = React.lazy(() => import("react-apexcharts"));

// ─── StatCard ─────────────────────────────────────────────────────────────────

export const StatCard = ({ label, value }) => (
    <s-box padding="base" background="base" border-width="base" border-color="base" border-radius="base">
        <s-stack direction="block" gap="small-200">
            <s-heading tone="subdued">{label}</s-heading>
            <s-text type="strong">
                <s-badge tone="success">{value}</s-badge>
            </s-text>
        </s-stack>
    </s-box>
);

// ─── Sparkline ────────────────────────────────────────────────────────────────
// Small, fixed-size trend badge — sits beside the number, not stretched
// across the card. Deliberately fed the SAME bucketed arrays already
// computed for the full charts below (chartData in _hooks.js) — no extra
// data fetch, just a compact rendering of numbers that already exist.

const SPARKLINE_WIDTH = 72;
const SPARKLINE_HEIGHT = 32;

function Sparkline({ data, color, chartKey }) {
    // Need at least 2 points for a line to mean anything, and at least one
    // non-zero point — otherwise (the common case for a metric with little
    // activity in range) it's a flat line at the bottom of the box, which
    // reads as a rendering glitch more than "no change".
    if (!data || data.length < 2 || !data.some((v) => v !== 0)) return null;

    const options = {
        chart: { sparkline: { enabled: true }, animations: { enabled: false } },
        colors: [color],
        stroke: { curve: "smooth", width: 1.5 },
        fill: { type: "solid", opacity: 0.15 },
        tooltip: {
            fixed: { enabled: false },
            y: { formatter: (val) => (typeof val === "number" ? val.toLocaleString() : val), title: { formatter: () => "" } },
            marker: { show: false },
        },
    };

    return (
        <Suspense fallback={null}>
            <ReactApexChart
                key={chartKey}
                options={options}
                series={[{ data }]}
                type="area"
                width={SPARKLINE_WIDTH}
                height={SPARKLINE_HEIGHT}
            />
        </Suspense>
    );
}

// ─── StatCardNew ──────────────────────────────────────────────────────────────
// A real bordered card, not just a colored top-rule floating in the section's
// own background — the two were nearly the same shade, so cards read as one
// continuous block instead of separate stats. `overflow: hidden` clips the
// accent bar to the card's own rounded corners instead of squaring them off.
// The content row reserves SPARKLINE_HEIGHT regardless of whether a
// sparkline is actually present, so cards with and without one still align.

export const StatCardNew = ({ label, value, color, detail, sparkline, sparklineKey }) => (
    <div style={{
        background: "var(--p-color-bg-surface, #fff)",
        border: "1px solid var(--p-color-border, #c9cccf)",
        borderRadius: "var(--p-border-radius-200, 8px)",
        overflow: "hidden",
    }}>
        <div style={{ height: "3px", background: color }} />
        <div style={{ padding: "0.875rem 1rem 1rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", minHeight: SPARKLINE_HEIGHT }}>
                <div style={{ minWidth: 0 }}>
                    <s-heading tone="subdued">{label}</s-heading>
                    <s-box paddingBlockEnd="small-200" />
                    <p style={{ fontSize: "22px", fontWeight: 500, margin: 0, color }}>
                        {value}
                    </p>
                    {detail && (
                        <p style={{ fontSize: "12px", margin: "4px 0 0", opacity: 0.65 }}>
                            {detail}
                        </p>
                    )}
                </div>
                {sparkline && (
                    <div style={{ flexShrink: 0, width: SPARKLINE_WIDTH, height: SPARKLINE_HEIGHT }}>
                        <Sparkline data={sparkline} color={color} chartKey={sparklineKey} />
                    </div>
                )}
            </div>
        </div>
    </div>
);

// ─── Period comparison badge ────────────────────────────────────────────────
// Rendered into StatCardNew's `detail` slot — see periodComparison in
// _hooks.js for how `comparison` is computed. Returns undefined (not an
// empty element) when there's nothing worth showing, so callers can pass
// the result straight through to `detail` and rely on its existing
// `detail && (...)` truthiness check.

export function periodBadge(comparison) {
    if (!comparison) return undefined;
    if (comparison.isNew) return <span style={{ opacity: 0.65 }}>New</span>;
    if (comparison.pct === null) return undefined;

    const up = comparison.pct >= 0;
    return (
        <span style={{ color: up ? "#16A34A" : "#DC2626" }}>
            {up ? "↑" : "↓"} {Math.abs(comparison.pct).toFixed(1)}% vs previous period
        </span>
    );
}

// ─── ChartCard ────────────────────────────────────────────────────────────────

export const ChartCard = ({ heading, chartKey, options, series, type = "bar", height = 300 }) => (
    <s-section heading={heading}>
        <Suspense fallback={
            <s-stack direction="inline" justify-content="center">
                <s-text>Loading chart...</s-text>
                <s-spinner access-label="Loading chart" />
            </s-stack>
        }>
            <ReactApexChart key={chartKey} options={options} series={series} type={type} height={height} />
        </Suspense>
    </s-section>
);
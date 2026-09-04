/**
 * @file app.dashboard/route.jsx
 *
 * Thin composition layer — loader + page layout only.
 *
 *   _loader.server.js  -> prisma queries
 *   _hooks.js          -> all state, chart logic, date range helpers (self-contained)
 *   components/
 *     Cards.jsx                    -> StatCard, StatCardNew (+ its sparkline), ChartCard
 *     DateRangePicker.jsx          -> preset picker + calendar
 *     CancelNeedsActionBanner.jsx  -> pending Subscription Cancellations callout
 *     OverviewSection.jsx          -> points / rewards / customers stat cards
 *     PrizeStatsSection.jsx        -> physical prize claim stat cards
 *     ChartsSection.jsx            -> points activity + rewards + enrollments + referrals + reward breakdown + top customers
 *     RewardBreakdownChart.jsx     -> reward redemption breakdown (donut)
 *     TopCustomersChart.jsx        -> top 10 customers by points (bar)
 *     PrizeChartsSection.jsx       -> prize claim volume + points spent chart
 */

import { useLoaderData } from "react-router";
import { authenticate } from "shopify-server";

import { loadDashboardData } from "./_loader.server";
import { useDashboardPage } from "./_hooks";
import { DateRangePicker } from "./components/DateRangePicker";
import { CancelNeedsActionBanner } from "./components/CancelNeedsActionBanner";
import { OverviewSection } from "./components/OverviewSection";
import { PrizeStatsSection } from "./components/PrizeStatsSection";
import { ChartsSection } from "./components/ChartsSection";
import { PrizeChartsSection } from "./components/PrizeChartsSection";

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    return loadDashboardData(session.id);
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
    const loaderData = useLoaderData();
    const page = useDashboardPage(loaderData);

    return (
        <s-page>

            <CancelNeedsActionBanner count={page.cancelNeedsAction} />

            <DateRangePicker
                preset={page.preset}           onPresetChange={page.setPreset}
                customStart={page.customStart} customEnd={page.customEnd}
                onCustomApply={page.handleCustomApply}
                granularity={page.granularity}
                labelCount={page.labelCount}
                interval={page.interval}       onIntervalChange={page.handleIntervalChange}
            />

            <OverviewSection  stats={page.overviewStats} chartData={page.chartData} rangeKey={page.rangeKey} periodComparison={page.periodComparison} />

            <PrizeStatsSection stats={page.prizeStats} chartData={page.chartData} rangeKey={page.rangeKey} periodComparison={page.periodComparison} />

            <ChartsSection
                chartData={page.chartData}
                rangeKey={page.rangeKey}
                rangeLabel={page.rangeLabel}
                chartOptions={page.chartOptions}
                rewardBreakdown={page.rewardBreakdown}
                topCustomersChart={page.topCustomersChart}
            />

            <PrizeChartsSection
                chartData={page.chartData}
                rangeKey={page.rangeKey}
                rangeLabel={page.rangeLabel}
                chartOptions={page.chartOptions}
            />

        </s-page>
    );
}

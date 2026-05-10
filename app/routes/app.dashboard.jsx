import prisma from "db-server";
import React, { useState, useMemo, useCallback } from "react";
import { useLoaderData } from "react-router";
import { authenticate } from "shopify-server";

import { DEFAULT_PRESET } from "@utils/chart/dateRange.js";
import { makeChartOptions } from "@utils/chart/chartUtils.js";
import useDateRange from "../hooks/chart/useDateRange";
import useChartSeries from "../hooks/chart/useChartSeries.js";
import { StatCard, ChartCard, StatCardNew } from "@components/chart/Cards.jsx";
import { DateRangePicker } from "@components/chart/DateRangePicker.jsx";

// ─── Loader ───────────────────────────────────────────────────────────────────

/**
 * Scoped to the current shop via Customer.sessionId.
 *
 * @returns {{ transactions: Object[], rewards: Object[], customerCount: number }}
 */
export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);

    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const [transactions, rewards, customerCount] = await Promise.all([
        prisma.transaction.findMany({
            where: { createdAt: { gte: twoYearsAgo }, customer: { sessionId: session.id } },
            select: { id: true, type: true, points: true, status: true, createdAt: true },
            orderBy: { createdAt: "asc" },
        }),
        prisma.reward.findMany({
            where: { createdAt: { gte: twoYearsAgo }, customer: { sessionId: session.id } },
            select: { id: true, status: true, pointsCost: true, createdAt: true },
            orderBy: { createdAt: "asc" },
        }),
        prisma.customer.count({
            where: { sessionId: session.id, activeStatus: "ACTIVE" },
        }),
    ]);

    return { transactions, rewards, customerCount };
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
    const { transactions, rewards, customerCount } = useLoaderData();

    // ── Date range state ──────────────────────────────────────────────────────
    const [preset, setPreset] = useState(DEFAULT_PRESET);
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const [interval, setInterval] = useState(null); // null = auto

    const handleCustomApply = useCallback(({ start, end }) => {
        setCustomStart(start); setCustomEnd(end);
    }, []);

    const handleIntervalChange = useCallback((e) => {
        const v = e.target.value;
        setInterval(v === "" ? null : Number(v));
    }, []);

    // ── Resolve active date range ─────────────────────────────────────────────
    const { start, end } = useDateRange({ preset, customStart, customEnd });

    // ── Pre-filter transactions to save repeated work in series configs ────────
    const inRange = useCallback((r) => { const d = new Date(r.createdAt); return d >= start && d <= end; }, [start, end]);
    const tx = useMemo(() => transactions.filter(inRange), [transactions, inRange]);
    const rw = useMemo(() => rewards.filter(inRange), [rewards, inRange]);

    const earnTx = useMemo(() => tx.filter((t) => ["EARN", "REFERRAL"].includes(t.type) && t.points > 0), [tx]);
    const redeemTx = useMemo(() => tx.filter((t) => t.type === "REDEEM"), [tx]);

    // ── Summary stats ─────────────────────────────────────────────────────────
    const stats = useMemo(() => ({
        pointsEarned: earnTx.reduce((s, t) => s + t.points, 0),
        pointsRedeemed: redeemTx.reduce((s, t) => s + Math.abs(t.points), 0),
        rewardsIssued: rw.length,
        activeRewards: rw.filter((r) => r.status === "ACTIVE").length,
    }), [earnTx, redeemTx, rw]);

    // ── Chart series ──────────────────────────────────────────────────────────
    // To add a new chart: add an entry here and a <ChartCard> below.
    // Each entry is independent — add/remove without touching any hook internals.
    const { granularity, labels, labelCount, data: chartData } = useChartSeries({
        start, end, preset, interval,
        series: [
            { key: "earned", records: earnTx, getValue: (t) => t.points },
            { key: "redeemed", records: redeemTx, getValue: (t) => Math.abs(t.points) },
            { key: "rewards", records: rw, getValue: () => 1 },
        ],
    });

    // Unique key — forces ApexCharts to fully remount on any range/interval change
    const rangeKey = `${preset}-${customStart}-${customEnd}-${interval ?? "auto"}`;
    const chartOptions = useCallback((colors) => makeChartOptions(colors, labels), [labels]);

    return (
        <s-page>

            {/* Date range + interval picker */}
            <DateRangePicker
                preset={preset} onPresetChange={setPreset}
                customStart={customStart} customEnd={customEnd}
                onCustomApply={handleCustomApply}
                granularity={granularity}
                labelCount={labelCount}
                interval={interval} onIntervalChange={handleIntervalChange}
            />

            {/* Overview stat cards — 5 columns above 600px, 1 below */}
            <s-section heading="Overview">
                <s-query-container>
                    <s-grid
                        gridTemplateColumns="@container (inline-size > 600px) 1fr 1fr 1fr 1fr 1fr, 1fr"
                        gap="base"
                    >
                        <s-grid-item><StatCardNew label="Points earned" value={stats.pointsEarned.toLocaleString()} color="#1D9E75" /></s-grid-item>
                        <s-grid-item><StatCardNew label="Points redeemed" value={stats.pointsRedeemed.toLocaleString()} color="#E24B4A" /></s-grid-item>
                        <s-grid-item><StatCardNew label="Rewards issued" value={stats.rewardsIssued.toLocaleString()} color="#378ADD" /></s-grid-item>
                        <s-grid-item><StatCardNew label="Active rewards" value={stats.activeRewards.toLocaleString()} color="#BA7517" /></s-grid-item>
                        <s-grid-item><StatCardNew label="Active customers" value={customerCount.toLocaleString()} color="#534AB7" /></s-grid-item>
                    </s-grid>
                </s-query-container>
            </s-section>

            {/* Charts — add new <ChartCard> entries here */}
            <ChartCard
                heading="Points activity"
                chartKey={`points-${rangeKey}`}
                options={chartOptions(["#1D9E75", "#E24B4A"])}
                series={[
                    { name: "Earned", data: chartData.earned },
                    { name: "Redeemed", data: chartData.redeemed },
                ]}
                type="bar"
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

        </s-page>
    );
}
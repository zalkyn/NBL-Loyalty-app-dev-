import { useState, useMemo, useCallback } from "react";
import {
    DEFAULT_PRESET,
    getPresetRange,
} from "@utils/chart/dateRange.js";
import {
    getGranularity,
    generateLabels,
    getBucketIndex,
    bucketRecords,
    mergeBuckets,
    makeChartOptions,
} from "@utils/chart/chartUtils.js";

// DATE_PRESETS / TOMORROW_STR / makeChartOptions now live in app/utils/chart/*
// and are imported directly by callers (e.g. components/DateRangePicker.jsx)
// instead of being re-exported through this file.

function resolveDateRange(preset, customStart, customEnd) {
    if (preset === "custom" && customStart && customEnd) {
        return {
            start: new Date(`${customStart}T00:00:00`),
            end: new Date(`${customEnd}T23:59:59.999`),
        };
    }
    return getPresetRange(preset);
}

function buildChartSeries({ start, end, preset, interval, series }) {
    const granularity = getGranularity(start, end, preset);
    const rawLabels = generateLabels(start, end, granularity);
    const len = rawLabels.length;
    const target = interval && interval < len ? interval : null;

    const data = {};
    let labels = rawLabels;

    for (const { key, records, getValue } of series) {
        const raw = bucketRecords(records, len, start, granularity, getValue);
        const { mergedData, mergedLabels } = mergeBuckets(raw, rawLabels, target);
        data[key] = mergedData;
        if (labels === rawLabels) labels = mergedLabels;
    }

    return { granularity, labels, labelCount: len, data };
}

// ─────────────────────────────────────────────────────────────────────────────
// useDashboardPage
// ─────────────────────────────────────────────────────────────────────────────

export function useDashboardPage(loaderData) {
    const {
        transactions = [],
        rewards = [],
        customerCount = 0,
        prizeClaims = [],
    } = loaderData ?? {};

    // ── Date range state ──────────────────────────────────────────────────────
    const [preset, setPreset] = useState(DEFAULT_PRESET);
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const [interval, setInterval] = useState(null);

    const handleCustomApply = useCallback(({ start, end }) => {
        setCustomStart(start);
        setCustomEnd(end);
    }, []);

    const handleIntervalChange = useCallback((e) => {
        const v = e.target.value;
        setInterval(v === "" ? null : Number(v));
    }, []);

    // ── Active date range ─────────────────────────────────────────────────────
    const { start, end } = useMemo(
        () => resolveDateRange(preset, customStart, customEnd),
        [preset, customStart, customEnd]
    );

    // ── Filter records to active range ────────────────────────────────────────
    const inRange = useCallback(
        (r) => { const d = new Date(r.createdAt); return d >= start && d <= end; },
        [start, end]
    );

    const tx = useMemo(() => transactions.filter(inRange), [transactions, inRange]);
    const rw = useMemo(() => rewards.filter(inRange), [rewards, inRange]);
    const pc = useMemo(() => prizeClaims.filter(inRange), [prizeClaims, inRange]);

    const earnTx = useMemo(() => tx.filter((t) => ["EARN", "REFERRAL"].includes(t.type) && t.points > 0), [tx]);
    // REVERSED excludes redemptions that were later refunded because voucher
    // generation failed after points were already deducted (see the refund
    // flow in reward-claim.jsx) — the customer got their points back via a
    // separate ADJUST transaction, so counting the original REDEEM here too
    // would overstate this total with no offsetting entry anywhere else.
    const redeemTx = useMemo(() => tx.filter((t) => t.type === "REDEEM" && t.status !== "REVERSED"), [tx]);
    // Manual admin balance corrections (bonuses, refunds after a failed
    // voucher, support corrections). Signed (+/-) — kept separate from
    // earnTx/redeemTx since these aren't customer-driven activity, but they
    // do move the balance, so they need their own visibility on the
    // dashboard (see overviewStats.adjustmentsNet and the "adjustments"
    // chart series below) rather than disappearing silently.
    const adjustTx = useMemo(() => tx.filter((t) => t.type === "ADJUST"), [tx]);

    // ── Prize stat cards (derived from filtered pc — matches chart range) ──────
    const prizeStats = useMemo(() => ({
        total: pc.length,
        pending: pc.filter((c) => c.status === "PENDING").length,
        fulfilled: pc.filter((c) => c.status === "FULFILLED").length,
        completed: pc.filter((c) => c.status === "COMPLETED").length,
        cancelled: pc.filter((c) => c.status === "CANCELLED").length,
    }), [pc]);

    // ── Overview stat cards ───────────────────────────────────────────────────
    const overviewStats = useMemo(() => ({
        pointsEarned: earnTx.reduce((s, t) => s + t.points, 0),
        pointsRedeemed: redeemTx.reduce((s, t) => s + Math.abs(t.points), 0),
        adjustmentsNet: adjustTx.reduce((s, t) => s + t.points, 0),
        // Split for the breakdown line under the Adjustments card — admins
        // need to see how much was incremented vs decremented, not just the
        // net, since a small net can hide a large increment offset by a
        // large decrement (or vice versa).
        adjustmentsPositive: adjustTx.filter((t) => t.points > 0).reduce((s, t) => s + t.points, 0),
        adjustmentsNegative: adjustTx.filter((t) => t.points < 0).reduce((s, t) => s + Math.abs(t.points), 0),
        rewardsIssued: rw.length,
        activeRewards: rw.filter((r) => r.status === "ACTIVE").length,
        activeCustomers: customerCount,
    }), [earnTx, redeemTx, adjustTx, rw, customerCount]);

    // ── Chart series ──────────────────────────────────────────────────────────
    const { granularity, labels, labelCount, data: chartData } = useMemo(
        () => buildChartSeries({
            start, end, preset, interval,
            series: [
                { key: "earned", records: earnTx, getValue: (t) => t.points },
                { key: "redeemed", records: redeemTx, getValue: (t) => Math.abs(t.points) },
                { key: "adjustments", records: adjustTx, getValue: (t) => t.points },
                { key: "rewards", records: rw, getValue: () => 1 },
                { key: "prizePending", records: pc.filter((c) => c.status === "PENDING"), getValue: () => 1 },
                { key: "prizeFulfilled", records: pc.filter((c) => c.status === "FULFILLED"), getValue: () => 1 },
                { key: "prizeCompleted", records: pc.filter((c) => c.status === "COMPLETED"), getValue: () => 1 },
                { key: "prizeCancelled", records: pc.filter((c) => c.status === "CANCELLED"), getValue: () => 1 },
            ],
        }),
        [start, end, preset, interval, earnTx, redeemTx, adjustTx, rw, pc]
    );

    const rangeKey = `${preset}-${customStart}-${customEnd}-${interval ?? "auto"}`;
    const chartOptions = useCallback((colors) => makeChartOptions(colors, labels), [labels]);

    return {
        // Date range controls
        preset, setPreset,
        customStart, customEnd,
        handleCustomApply,
        granularity, labelCount,
        interval, handleIntervalChange,

        // Stats
        overviewStats,
        prizeStats,

        // Charts
        chartData,
        rangeKey,
        chartOptions,
    };
}
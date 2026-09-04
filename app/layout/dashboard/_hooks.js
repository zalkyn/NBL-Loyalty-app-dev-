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

/** Max individually-labeled slices in the reward-breakdown donut before the
 *  rest get folded into a single "Other" slice — see rewardBreakdown below. */
const MAX_BREAKDOWN_SLICES = 6;

/**
 * Human-readable date range for display under each chart's heading — e.g.
 * "Sep 4, 2026" for a single day, "Aug 29 – Sep 4, 2026" for a range in the
 * same year, or "Dec 28, 2025 – Jan 3, 2026" when it spans a year boundary.
 * Purely presentational — has no bearing on what data is actually shown,
 * just makes each chart legible on its own (e.g. in a screenshot) without
 * having to scroll back up to the date picker to see what period it covers.
 *
 * @param {Date} start
 * @param {Date} end
 * @returns {string}
 */
function formatDateRangeLabel(start, end) {
    const fmtShort = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const fmtFull = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    if (start.toDateString() === end.toDateString()) return fmtFull(end);

    const startStr = start.getFullYear() === end.getFullYear() ? fmtShort(start) : fmtFull(start);
    return `${startStr} – ${fmtFull(end)}`;
}

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

/**
 * Produces the six Transaction-derived "pseudo-record" arrays
 * (earned/redeemed/adjustNet/adjustPositive/adjustNegative/backfilled), each
 * shaped as `{ createdAt, points }` so downstream code (inRange filtering,
 * overviewStats sums, chart bucketing via bucketRecords) can treat them
 * exactly like real Transaction rows without caring which source produced
 * them.
 *
 * Two sources, chosen by granularity:
 *   - "hourly" (Today/Yesterday) -> recentTransactions, individual rows for
 *     the last 2 days (see _loader.server.js) — small regardless of shop
 *     size, so raw + client-side filtering is fine here, same as before.
 *   - everything else -> dailyTransactionAgg, already summed IN POSTGRES
 *     per day (see _loader.server.js's header comment for why: Transaction
 *     is this shop's highest-volume table, and daily/weekly/monthly/Overview
 *     numbers are all just sums, which a sum-of-daily-sums reproduces
 *     exactly — verified against the old row-per-transaction path before
 *     this shipped). ADJUST needs three separate day columns
 *     (net/positive/negative), not one, because a single day can contain
 *     BOTH a positive and a negative adjustment — collapsing to one signed
 *     number per day would silently merge them and break the Adjustments
 *     card's ↑/↓ breakdown.
 *
 * @param {"hourly"|"daily"|"weekly"|"monthly"} granularity
 * @param {Object[]} recentTransactions
 * @param {Object[]} dailyTransactionAgg
 */
function deriveTransactionSeries(granularity, recentTransactions, dailyTransactionAgg) {
    if (granularity === "hourly") {
        const adjustRaw = recentTransactions.filter((t) => t.type === "ADJUST");
        return {
            earnedLike: recentTransactions.filter((t) => ["EARN", "REFERRAL"].includes(t.type) && t.points > 0),
            redeemedLike: recentTransactions
                .filter((t) => t.type === "REDEEM" && t.status !== "REVERSED")
                .map((t) => ({ createdAt: t.createdAt, points: Math.abs(t.points) })),
            adjustNetLike: adjustRaw,
            adjustPositiveLike: adjustRaw.filter((t) => t.points > 0),
            adjustNegativeLike: adjustRaw
                .filter((t) => t.points < 0)
                .map((t) => ({ createdAt: t.createdAt, points: Math.abs(t.points) })),
            backfilledLike: recentTransactions.filter((t) => t.type === "BACKFILL"),
        };
    }

    return {
        earnedLike: dailyTransactionAgg.map((d) => ({ createdAt: d.day, points: d.earned })),
        redeemedLike: dailyTransactionAgg.map((d) => ({ createdAt: d.day, points: d.redeemed })),
        adjustNetLike: dailyTransactionAgg.map((d) => ({ createdAt: d.day, points: d.adjustNet })),
        adjustPositiveLike: dailyTransactionAgg.map((d) => ({ createdAt: d.day, points: d.adjustPositive })),
        adjustNegativeLike: dailyTransactionAgg.map((d) => ({ createdAt: d.day, points: d.adjustNegative })),
        backfilledLike: dailyTransactionAgg.map((d) => ({ createdAt: d.day, points: d.backfilled })),
    };
}

/**
 * Same hourly-vs-day-aggregate split as deriveTransactionSeries above, for
 * new-customer enrollments. `points` is reused as the field name (rather
 * than introducing a differently-named field just for this one series) so
 * it stays a drop-in fit for bucketRecords/inRange, which only care that a
 * `.createdAt` and a numeric field exist — not what that field is called.
 *
 * @param {"hourly"|"daily"|"weekly"|"monthly"} granularity
 * @param {Object[]} recentEnrollments
 * @param {Object[]} dailyEnrollmentAgg
 */
function deriveEnrollmentSeries(granularity, recentEnrollments, dailyEnrollmentAgg) {
    if (granularity === "hourly") {
        return recentEnrollments.map((c) => ({ createdAt: c.enrolledAt, points: 1 }));
    }
    return dailyEnrollmentAgg.map((d) => ({ createdAt: d.day, points: d.enrolled }));
}

/**
 * Same hourly-vs-day-aggregate split again, for referral performance.
 * "sent" = every Referral row; "converted" = status USED (see
 * _loader.server.js's header comment on that query for why USED, not
 * discountUsed/rewardGiven individually).
 *
 * @param {"hourly"|"daily"|"weekly"|"monthly"} granularity
 * @param {Object[]} recentReferrals
 * @param {Object[]} dailyReferralAgg
 */
function deriveReferralSeries(granularity, recentReferrals, dailyReferralAgg) {
    if (granularity === "hourly") {
        return {
            sentLike: recentReferrals.map((r) => ({ createdAt: r.createdAt, points: 1 })),
            convertedLike: recentReferrals
                .filter((r) => r.status === "USED")
                .map((r) => ({ createdAt: r.createdAt, points: 1 })),
        };
    }
    return {
        sentLike: dailyReferralAgg.map((d) => ({ createdAt: d.day, points: d.sent })),
        convertedLike: dailyReferralAgg.map((d) => ({ createdAt: d.day, points: d.converted })),
    };
}

/**
 * Same hourly-vs-day-aggregate split again, for the points liability trend.
 * `points` here is already the SIGNED net change (not a count like
 * deriveEnrollmentSeries/deriveReferralSeries above) — see
 * _loader.server.js's header comment on dailyLiabilityAgg for why a raw
 * per-day sum of Transaction.points reconstructs balance movement.
 *
 * @param {"hourly"|"daily"|"weekly"|"monthly"} granularity
 * @param {Object[]} recentLiabilityTx
 * @param {Object[]} dailyLiabilityAgg
 */
function deriveLiabilitySeries(granularity, recentLiabilityTx, dailyLiabilityAgg) {
    if (granularity === "hourly") {
        return recentLiabilityTx.map((t) => ({ createdAt: t.createdAt, points: t.points }));
    }
    return dailyLiabilityAgg.map((d) => ({ createdAt: d.day, points: d.netChange }));
}

/**
 * Sums a day-bucketed aggregate row's numeric field over an inclusive
 * [start, end] window. Deliberately reads the *Agg rows (2-year window,
 * see _loader.server.js), not the hourly recentX arrays, regardless of the
 * CURRENTLY selected range's own chart granularity — a previous-period
 * comparison window can fall further back than recentTransactions' 2-day
 * fetch (e.g. the "Yesterday" preset's previous period is the day before
 * that), but every day including today is already present in the day-agg,
 * so this reads correctly for every preset without a second query. Also
 * used for the CURRENT period's comparison figure, not just the previous
 * one, so both sides of one comparison come from the identical code path
 * (must exactly equal deriveTransactionSeries's own sum for the same
 * range — same underlying rows, just summed via a different grouping).
 *
 * @param {Object[]} dailyAgg
 * @param {string}   valueKey
 * @param {Date}     start
 * @param {Date}     end
 * @returns {number}
 */
function sumDailyAggInRange(dailyAgg, valueKey, start, end) {
    let sum = 0;
    for (const row of dailyAgg) {
        const d = new Date(row.day);
        if (d >= start && d <= end) sum += row[valueKey] ?? 0;
    }
    return sum;
}

/**
 * cur/prev -> { pct, isNew }. pct is null when there's no previous-period
 * baseline to compare against (prev === 0) — a "0 -> 5" jump isn't a
 * meaningful percentage, so the UI shows "New" (isNew) instead of a
 * misleading number; "0 -> 0" shows neither (isNew stays false, pct stays
 * null), since there's nothing to report either way.
 */
function comparePeriod(current, previous) {
    if (previous === 0) return { current, previous, pct: null, isNew: current > 0 };
    return { current, previous, pct: ((current - previous) / previous) * 100, isNew: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// useDashboardPage
// ─────────────────────────────────────────────────────────────────────────────

export function useDashboardPage(loaderData) {
    const {
        dailyTransactionAgg = [],
        recentTransactions = [],
        dailyEnrollmentAgg = [],
        recentEnrollments = [],
        dailyReferralAgg = [],
        recentReferrals = [],
        dailyLiabilityAgg = [],
        recentLiabilityTx = [],
        rewards = [],
        customerCount = 0,
        prizeClaims = [],
        pointsLiability = 0,
        cancelTotal = 0,
        cancelNeedsAction = 0,
        topCustomers = [],
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

    // ── Previous period (for period-over-period comparisons) ─────────────────
    // Simple immediately-preceding window of equal length — NOT calendar-
    // aligned (e.g. "this month" compares against the preceding N days, not
    // literally last month, even though the two happen to coincide when the
    // month is complete). Calendar-aware comparison is a materially bigger
    // feature (different logic per preset); this is the standard simple
    // default and is what most dashboards mean by "vs previous period".
    const previousRange = useMemo(() => {
        const durationMs = end.getTime() - start.getTime();
        const prevEnd = new Date(start.getTime() - 1);
        const prevStart = new Date(prevEnd.getTime() - durationMs);
        return { prevStart, prevEnd };
    }, [start, end]);

    // Granularity has to be known BEFORE deriving the Transaction series
    // below (it picks the raw-hourly vs day-aggregate source) — computed
    // again inside buildChartSeries further down, but that's a cheap pure
    // function of start/end/preset, not worth restructuring around.
    const granularity = getGranularity(start, end, preset);

    const { earnedLike, redeemedLike, adjustNetLike, adjustPositiveLike, adjustNegativeLike, backfilledLike } = useMemo(
        () => deriveTransactionSeries(granularity, recentTransactions, dailyTransactionAgg),
        [granularity, recentTransactions, dailyTransactionAgg]
    );

    const enrolledLike = useMemo(
        () => deriveEnrollmentSeries(granularity, recentEnrollments, dailyEnrollmentAgg),
        [granularity, recentEnrollments, dailyEnrollmentAgg]
    );
    const enrollTx = useMemo(() => enrolledLike.filter(inRange), [enrolledLike, inRange]);

    const { sentLike, convertedLike } = useMemo(
        () => deriveReferralSeries(granularity, recentReferrals, dailyReferralAgg),
        [granularity, recentReferrals, dailyReferralAgg]
    );
    const referralSentTx = useMemo(() => sentLike.filter(inRange), [sentLike, inRange]);
    const referralConvertedTx = useMemo(() => convertedLike.filter(inRange), [convertedLike, inRange]);

    const liabilityLike = useMemo(
        () => deriveLiabilitySeries(granularity, recentLiabilityTx, dailyLiabilityAgg),
        [granularity, recentLiabilityTx, dailyLiabilityAgg]
    );
    const liabilityTx = useMemo(() => liabilityLike.filter(inRange), [liabilityLike, inRange]);

    const rw = useMemo(() => rewards.filter(inRange), [rewards, inRange]);
    const pc = useMemo(() => prizeClaims.filter(inRange), [prizeClaims, inRange]);

    const earnTx = useMemo(() => earnedLike.filter(inRange), [earnedLike, inRange]);
    // REVERSED excludes redemptions that were later refunded because voucher
    // generation failed after points were already deducted (see the refund
    // flow in reward-claim.jsx) — the customer got their points back via a
    // separate ADJUST transaction, so counting the original REDEEM here too
    // would overstate this total with no offsetting entry anywhere else.
    // (The REVERSED exclusion and the abs() itself already happened in
    // deriveTransactionSeries — redeemedLike's `.points` is already the
    // positive, REVERSED-excluded redemption amount.)
    const redeemTx = useMemo(() => redeemedLike.filter(inRange), [redeemedLike, inRange]);
    // Manual admin balance corrections (bonuses, refunds after a failed
    // voucher, support corrections) — kept separate from earnTx/redeemTx
    // since these aren't customer-driven activity, but they do move the
    // balance, so they need their own visibility on the dashboard (see
    // overviewStats.adjustmentsNet and the "adjustments" chart series
    // below) rather than disappearing silently. Three arrays, not one —
    // net/positive/negative are separate day-columns upstream (see
    // deriveTransactionSeries's header comment for why a single signed
    // number per day can't represent both a same-day increase and decrease).
    const adjustNetTx = useMemo(() => adjustNetLike.filter(inRange), [adjustNetLike, inRange]);
    const adjustPositiveTx = useMemo(() => adjustPositiveLike.filter(inRange), [adjustPositiveLike, inRange]);
    const adjustNegativeTx = useMemo(() => adjustNegativeLike.filter(inRange), [adjustNegativeLike, inRange]);
    // One-time retroactive award for a customer's pre-install lifetime spend
    // (see ShadowRule/PointsBackfillEntry) — deliberately NOT folded into
    // earnTx above. Right after a backfill run, lumping it into "Points
    // earned" would make it look like real order-driven earning suddenly
    // spiked; keeping it separate lets a merchant see backfill activity as
    // its own, one-time thing (see overviewStats.pointsBackfilled and the
    // "backfilled" chart series below).
    const backfillTx = useMemo(() => backfilledLike.filter(inRange), [backfilledLike, inRange]);

    // ── Reward redemption breakdown (donut) ───────────────────────────────────
    // Grouped by title, not rewardRule — rewardRule.title is an unresolved
    // template string ("Voucher {{currency_value}}") shared by every value
    // of that rule, so it can't tell a $5 voucher from a $10 one; the
    // per-instance title can. Total across all slices always equals
    // overviewStats.rewardsIssued (same `rw`), so the two numbers can never
    // silently disagree.
    const rewardBreakdown = useMemo(() => {
        const counts = new Map();
        for (const r of rw) {
            const key = r.title || "Untitled reward";
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }

        // Cap to the top slices + one "Other" bucket — a donut with a long
        // tail of one-off titles is unreadable, not more informative.
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        const top = sorted.slice(0, MAX_BREAKDOWN_SLICES);
        const otherCount = sorted.slice(MAX_BREAKDOWN_SLICES).reduce((s, [, c]) => s + c, 0);

        const labels = top.map(([label]) => label);
        const series = top.map(([, count]) => count);
        if (otherCount > 0) {
            labels.push("Other");
            series.push(otherCount);
        }

        return { labels, series };
    }, [rw]);

    // ── Top customers leaderboard (bar) ───────────────────────────────────────
    // Live snapshot (topCustomers is already the top 10 by points, queried
    // in _loader.server.js) — not date-range filtered, same reasoning as
    // pointsLiability/activeCustomers. Name-resolution fallback chain
    // matches the one already used on the customer detail page
    // (StatsGrid.jsx et al.): name -> firstName+lastName -> email -> "Customer".
    const topCustomersChart = useMemo(() => ({
        labels: topCustomers.map((c) =>
            c.name || [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Customer"
        ),
        series: topCustomers.map((c) => c.points),
    }), [topCustomers]);

    // ── Prize stat cards (derived from filtered pc — matches chart range) ──────
    const prizeStats = useMemo(() => {
        // Among claims created in range that have since been fulfilled
        // (fulfilledAt set — a claim can be reverted back to PENDING by an
        // admin, see physical-prizes-claims-manage/_data.server.js, which
        // clears fulfilledAt back to null, so this only ever reflects the
        // CURRENT fulfillment, not a stale one). null (not 0) when there's
        // nothing to average yet, so the card can show "—" instead of a
        // misleading "0.0 days".
        const fulfilledClaims = pc.filter((c) => c.fulfilledAt);
        const avgFulfillmentDays = fulfilledClaims.length > 0
            ? fulfilledClaims.reduce((sum, c) => sum + (new Date(c.fulfilledAt) - new Date(c.createdAt)), 0)
                / fulfilledClaims.length / 86_400_000
            : null;

        return {
            total: pc.length,
            pending: pc.filter((c) => c.status === "PENDING").length,
            fulfilled: pc.filter((c) => c.status === "FULFILLED").length,
            completed: pc.filter((c) => c.status === "COMPLETED").length,
            cancelled: pc.filter((c) => c.status === "CANCELLED").length,
            avgFulfillmentDays,
        };
    }, [pc]);

    // ── Overview stat cards ───────────────────────────────────────────────────
    const overviewStats = useMemo(() => {
        const pointsEarned = earnTx.reduce((s, t) => s + t.points, 0);
        // .points is already the positive, REVERSED-excluded amount (see
        // deriveTransactionSeries) — no Math.abs needed here anymore.
        const pointsRedeemed = redeemTx.reduce((s, t) => s + t.points, 0);
        const referralsSent = referralSentTx.reduce((s, t) => s + t.points, 0);
        const referralsConverted = referralConvertedTx.reduce((s, t) => s + t.points, 0);

        return {
            pointsEarned,
            pointsRedeemed,
            // Share of points earned (in range) that have already come back
            // as a redemption — deliberately NOT "redeemed this period /
            // earned this period" read as a cohort conversion rate (most
            // redemptions in a given window spend points earned in an
            // EARLIER window); it's a simple in-range activity ratio, same
            // spirit as the other Overview cards. 0 earned -> 0%, not
            // NaN/Infinity, since there's nothing to have a rate of yet.
            redemptionRate: pointsEarned > 0 ? (pointsRedeemed / pointsEarned) * 100 : 0,
            adjustmentsNet: adjustNetTx.reduce((s, t) => s + t.points, 0),
            // adjustPositiveTx/adjustNegativeTx are already split at the
            // source (see deriveTransactionSeries) — no per-record sign
            // filter needed here anymore either. .points on the negative
            // side is already the positive/abs magnitude.
            adjustmentsPositive: adjustPositiveTx.reduce((s, t) => s + t.points, 0),
            adjustmentsNegative: adjustNegativeTx.reduce((s, t) => s + t.points, 0),
            pointsBackfilled: backfillTx.reduce((s, t) => s + t.points, 0),
            // In-range count, not a live snapshot — how many customers
            // enrolled DURING the selected period, same "activity in this
            // window" spirit as pointsEarned/pointsRedeemed above (as
            // opposed to activeCustomers, which is the current total).
            newEnrollments: enrollTx.reduce((s, t) => s + t.points, 0),
            // Referral performance, in-range — same "activity ratio, 0 sent
            // -> 0%" reasoning as redemptionRate above.
            referralsSent,
            referralsConverted,
            referralConversionRate: referralsSent > 0 ? (referralsConverted / referralsSent) * 100 : 0,
            rewardsIssued: rw.length,
            activeRewards: rw.filter((r) => r.status === "ACTIVE").length,
            activeCustomers: customerCount,
            // Live snapshot (current, not date-range filtered) — same
            // reasoning as activeCustomers above.
            pointsLiability,
            // In-range net signed movement behind that live snapshot — see
            // dailyLiabilityAgg's header comment in _loader.server.js. Shown
            // as a "+X this period" / "-X this period" detail line under
            // the Points liability card, and charted as a running total in
            // ChartsSection (see liabilityTrend below).
            liabilityNetChange: liabilityTx.reduce((s, t) => s + t.points, 0),
            // Also live snapshots, not date-range filtered — all-time counts
            // from SubscriptionCancelEvent (see _loader.server.js), same
            // numbers CancelNeedsActionBanner's count and the dedicated
            // Subscription Cancellations page compute, so this card can
            // never silently disagree with either of them.
            cancelTotal,
            cancelNeedsAction,
        };
    }, [
        earnTx, redeemTx, adjustNetTx, adjustPositiveTx, adjustNegativeTx, backfillTx, enrollTx,
        referralSentTx, referralConvertedTx, liabilityTx, rw, customerCount, pointsLiability, cancelTotal, cancelNeedsAction,
    ]);

    // ── Period-over-period comparison ─────────────────────────────────────────
    // Scoped to the 6 cards that are plain in-range sums with no existing
    // `detail` line to conflict with (Adjustments and Points liability
    // already use `detail` for their own ↑/↓ breakdown — deliberately left
    // alone rather than overloading that one slot with two different
    // things). See sumDailyAggInRange/comparePeriod above.
    const periodComparison = useMemo(() => {
        const { prevStart, prevEnd } = previousRange;
        const inPrevRange = (r) => { const d = new Date(r.createdAt); return d >= prevStart && d <= prevEnd; };

        return {
            pointsEarned: comparePeriod(
                sumDailyAggInRange(dailyTransactionAgg, "earned", start, end),
                sumDailyAggInRange(dailyTransactionAgg, "earned", prevStart, prevEnd)
            ),
            pointsRedeemed: comparePeriod(
                sumDailyAggInRange(dailyTransactionAgg, "redeemed", start, end),
                sumDailyAggInRange(dailyTransactionAgg, "redeemed", prevStart, prevEnd)
            ),
            newEnrollments: comparePeriod(
                sumDailyAggInRange(dailyEnrollmentAgg, "enrolled", start, end),
                sumDailyAggInRange(dailyEnrollmentAgg, "enrolled", prevStart, prevEnd)
            ),
            referralsSent: comparePeriod(
                sumDailyAggInRange(dailyReferralAgg, "sent", start, end),
                sumDailyAggInRange(dailyReferralAgg, "sent", prevStart, prevEnd)
            ),
            // Reward/PhysicalPrizeClaim aren't day-aggregated (see
            // _loader.server.js's header comment on why) — filtered
            // directly off the raw 2-year arrays instead.
            rewardsIssued: comparePeriod(rw.length, rewards.filter(inPrevRange).length),
            prizeClaimsTotal: comparePeriod(pc.length, prizeClaims.filter(inPrevRange).length),
        };
    }, [dailyTransactionAgg, dailyEnrollmentAgg, dailyReferralAgg, rewards, prizeClaims, rw, pc, start, end, previousRange]);

    // ── Chart series ──────────────────────────────────────────────────────────
    // granularity NOT re-destructured here — already computed above (needed
    // earlier, to pick deriveTransactionSeries's source); buildChartSeries
    // computes its own copy internally too (a cheap pure recompute of the
    // exact same start/end/preset), but only labels/labelCount/data are
    // pulled from its return to avoid a duplicate `const granularity`.
    const { labels, labelCount, data: chartData } = useMemo(
        () => buildChartSeries({
            start, end, preset, interval,
            series: [
                { key: "earned", records: earnTx, getValue: (t) => t.points },
                { key: "redeemed", records: redeemTx, getValue: (t) => t.points },
                { key: "adjustments", records: adjustNetTx, getValue: (t) => t.points },
                { key: "backfilled", records: backfillTx, getValue: (t) => t.points },
                { key: "enrolled", records: enrollTx, getValue: (t) => t.points },
                { key: "referralsSent", records: referralSentTx, getValue: (t) => t.points },
                { key: "referralsConverted", records: referralConvertedTx, getValue: (t) => t.points },
                { key: "liabilityNet", records: liabilityTx, getValue: (t) => t.points },
                { key: "rewards", records: rw, getValue: () => 1 },
                { key: "prizePending", records: pc.filter((c) => c.status === "PENDING"), getValue: () => 1 },
                { key: "prizeFulfilled", records: pc.filter((c) => c.status === "FULFILLED"), getValue: () => 1 },
                { key: "prizeCompleted", records: pc.filter((c) => c.status === "COMPLETED"), getValue: () => 1 },
                { key: "prizeCancelled", records: pc.filter((c) => c.status === "CANCELLED"), getValue: () => 1 },
            ],
        }),
        [start, end, preset, interval, earnTx, redeemTx, adjustNetTx, backfillTx, enrollTx, referralSentTx, referralConvertedTx, liabilityTx, rw, pc]
    );

    // Running total of liabilityNet, not the per-bucket net itself — a
    // per-day/week/month NET swing (up some days, down others) doesn't show
    // the trajectory the "liability trend" name promises; the cumulative
    // line does. Starts from 0 at the selected range's start, not from the
    // live total (see dailyLiabilityAgg's header comment in
    // _loader.server.js) — this chart shows how liability moved DURING the
    // period, not a reconstructed absolute history before it.
    const chartDataWithLiabilityTrend = useMemo(() => {
        let running = 0;
        const liabilityTrend = (chartData.liabilityNet ?? []).map((v) => (running += v));

        // Net of exactly the four categories plotted in the "Points
        // activity" bar chart (Earned/Redeemed/Adjustments/Backfilled) —
        // NOT the same population/scope as liabilityTrend above (that one
        // is activeStatus-filtered and covers every Transaction type,
        // including EXPIRE/REVERSAL/SUBSCRIPTION_CANCEL_*, which
        // dailyTransactionAgg doesn't capture at all — see its header
        // comment in _loader.server.js). This is a plain per-bucket sum of
        // the four arrays already shown above it, so it can only ever mean
        // "net of what's plotted in this chart", nothing broader.
        const earned = chartData.earned ?? [];
        const pointsActivityNet = earned.map((v, i) =>
            v - (chartData.redeemed?.[i] ?? 0) + (chartData.adjustments?.[i] ?? 0) + (chartData.backfilled?.[i] ?? 0)
        );

        return { ...chartData, liabilityTrend, pointsActivityNet };
    }, [chartData]);

    const rangeKey = `${preset}-${customStart}-${customEnd}-${interval ?? "auto"}`;
    const rangeLabel = useMemo(() => formatDateRangeLabel(start, end), [start, end]);
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
        periodComparison,
        rewardBreakdown,
        topCustomersChart,
        cancelNeedsAction,

        // Charts
        chartData: chartDataWithLiabilityTrend,
        rangeKey,
        rangeLabel,
        chartOptions,
    };
}
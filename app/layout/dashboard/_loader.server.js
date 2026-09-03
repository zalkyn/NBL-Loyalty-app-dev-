// ─────────────────────────────────────────────────────────────────────────────
// Server-only. Never import from client code (_hooks.js or components/).
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "db-server";
import { logger } from "app/utils/logger.js";
import { NON_ACTIONABLE_SKIP_REASONS } from "app/layout/subscription-cancellations/_data.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "layout/dashboard/_loader.server.js";

/**
 * Fetches all dashboard data in one parallel round-trip.
 *
 * Note: `prizeStats` shown on the dashboard is derived client-side from
 * `prizeClaims` (see _hooks.js) — it isn't a separate field returned here.
 *
 * Degrades to empty defaults (rather than crashing the whole page) on a
 * transient DB failure.
 *
 * @param {string} sessionId
 * @returns {{ dailyTransactionAgg, recentTransactions, dailyEnrollmentAgg, recentEnrollments, dailyReferralAgg, recentReferrals, dailyLiabilityAgg, recentLiabilityTx, rewards, customerCount, prizeClaims, pointsLiability: number, cancelTotal: number, cancelNeedsAction: number, topCustomers: Object[] }}
 */
export async function loadDashboardData(sessionId) {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    // Only the hourly-granularity charts (Today/Yesterday presets) need
    // individual-transaction resolution — a 2-day window is always small
    // regardless of shop size, so this stays a plain findMany.
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    try {
        const [dailyTransactionAgg, recentTransactions, dailyEnrollmentAgg, recentEnrollments, dailyReferralAgg, recentReferrals, dailyLiabilityAgg, recentLiabilityTx, rewards, customerCount, prizeClaims, pointsLiabilityAgg, cancelGrouped, topCustomers] = await Promise.all([

            // Day-bucketed sums computed IN Postgres, not a row-per-transaction
            // fetch — Transaction is this shop's highest-volume table by far
            // (every EARN/REDEEM/ADJUST/BACKFILL ever, growing forever), so
            // pulling every individual row into Node on every dashboard view
            // doesn't scale the way a bounded, ~730-row-max (one per day
            // across the window) query does. See _hooks.js for how these
            // day rows get re-bucketed into daily/weekly/monthly chart
            // granularities and range-summed for the Overview stat cards —
            // both are just sums, and summing daily pre-sums over a range is
            // mathematically identical to summing the individual
            // transactions in that range, so this changes nothing about
            // what any number on the page means.
            //
            // Reward and PhysicalPrizeClaim are NOT rewritten this way:
            // their volume is inherently much lower (a shop redeems far
            // fewer rewards than it records point-earning events), and
            // Reward specifically needs per-row `title` for the redemption-
            // breakdown donut, which a day-only aggregate would lose
            // entirely. Revisit only if either genuinely becomes a scale
            // problem on its own.
            prisma.$queryRaw`
                SELECT
                    DATE_TRUNC('day', t."createdAt") AS day,
                    SUM(CASE WHEN t."type" IN ('EARN', 'REFERRAL') AND t."points" > 0 THEN t."points" ELSE 0 END)::int AS earned,
                    SUM(CASE WHEN t."type" = 'REDEEM' AND t."status" != 'REVERSED' THEN ABS(t."points") ELSE 0 END)::int AS redeemed,
                    SUM(CASE WHEN t."type" = 'ADJUST' THEN t."points" ELSE 0 END)::int AS "adjustNet",
                    SUM(CASE WHEN t."type" = 'ADJUST' AND t."points" > 0 THEN t."points" ELSE 0 END)::int AS "adjustPositive",
                    SUM(CASE WHEN t."type" = 'ADJUST' AND t."points" < 0 THEN ABS(t."points") ELSE 0 END)::int AS "adjustNegative",
                    SUM(CASE WHEN t."type" = 'BACKFILL' THEN t."points" ELSE 0 END)::int AS backfilled
                FROM "Transaction" t
                JOIN "Customer" c ON t."customerId" = c."id"
                WHERE c."sessionId" = ${sessionId} AND t."createdAt" >= ${twoYearsAgo}
                GROUP BY DATE_TRUNC('day', t."createdAt")
                ORDER BY day ASC
            `,

            prisma.transaction.findMany({
                where: { createdAt: { gte: twoDaysAgo }, customer: { sessionId } },
                select: { id: true, type: true, points: true, status: true, createdAt: true },
                orderBy: { createdAt: "asc" },
            }),

            // New-enrollment trend — same day-bucketed-in-Postgres approach
            // as dailyTransactionAgg above, and for the same reason: a shop
            // with 100k+ customers would otherwise mean 100k+ rows fetched
            // just to count signups per day. Not filtered by activeStatus —
            // enrollment is a historical event (did they sign up that day),
            // not a reflection of whether they're still active now.
            prisma.$queryRaw`
                SELECT
                    DATE_TRUNC('day', "enrolledAt") AS day,
                    COUNT(*)::int AS enrolled
                FROM "Customer"
                WHERE "sessionId" = ${sessionId} AND "enrolledAt" >= ${twoYearsAgo}
                GROUP BY DATE_TRUNC('day', "enrolledAt")
                ORDER BY day ASC
            `,

            // Hourly-granularity fallback for the enrollment chart, same
            // reasoning as recentTransactions above.
            prisma.customer.findMany({
                where: { sessionId, enrolledAt: { gte: twoDaysAgo } },
                select: { id: true, enrolledAt: true },
                orderBy: { enrolledAt: "asc" },
            }),

            // Referral performance — same day-bucketed-in-Postgres approach
            // and reasoning as dailyEnrollmentAgg above. "sent" = every
            // Referral row created; "converted" = status USED, which
            // orderPaidJob.js only ever sets once the referred friend's
            // order actually used the discount code and the referrer's
            // reward was granted (see that job's referral-handling section)
            // — this is the one true "did this referral work" signal, not
            // discountUsed or rewardGiven individually (both flip alongside
            // status in the same write).
            prisma.$queryRaw`
                SELECT
                    DATE_TRUNC('day', r."createdAt") AS day,
                    COUNT(*)::int AS sent,
                    SUM(CASE WHEN r."status" = 'USED' THEN 1 ELSE 0 END)::int AS converted
                FROM "Referral" r
                JOIN "Customer" c ON r."referrerId" = c."id"
                WHERE c."sessionId" = ${sessionId} AND r."createdAt" >= ${twoYearsAgo}
                GROUP BY DATE_TRUNC('day', r."createdAt")
                ORDER BY day ASC
            `,

            // Hourly-granularity fallback for the referral chart, same
            // reasoning as recentTransactions/recentEnrollments above.
            prisma.referral.findMany({
                where: { createdAt: { gte: twoDaysAgo }, referrer: { sessionId } },
                select: { id: true, status: true, createdAt: true },
                orderBy: { createdAt: "asc" },
            }),

            // Points liability trend — day-bucketed NET signed movement
            // (every Transaction row already IS one balance-affecting
            // event — EARN/REFERRAL/BACKFILL add, REDEEM/EXPIRE subtract,
            // ADJUST/REVERSAL/SUBSCRIPTION_CANCEL_* apply their signed
            // delta — so summing t.points per day reconstructs how the
            // balance actually moved, no per-type branching needed here
            // unlike dailyTransactionAgg above).
            //
            // Filtered to CURRENTLY active customers (not point-in-time
            // status) so this reconciles with the "Points liability" stat
            // card below, which is also a live ACTIVE-only snapshot — a
            // customer who's since gone inactive drops out of both
            // consistently, and one who's since become active pulls their
            // full history into both consistently.
            //
            // One known, accepted inexactness: ADJUST stores the caller's
            // raw signed amount (see createTransaction.js), but the actual
            // balance change is floored at 0 (Math.max(0, points + amount))
            // — so a large negative ADJUST on a low-balance customer can
            // make this sum drift slightly below what the live snapshot
            // shows. Rare in practice (an admin adjustment overshooting a
            // customer's current balance) and not worth a second query to
            // chase, since this chart is presented as a trend/direction
            // indicator, not a claimed exact reconciliation.
            prisma.$queryRaw`
                SELECT
                    DATE_TRUNC('day', t."createdAt") AS day,
                    SUM(t."points")::int AS "netChange"
                FROM "Transaction" t
                JOIN "Customer" c ON t."customerId" = c."id"
                WHERE c."sessionId" = ${sessionId} AND c."activeStatus" = 'ACTIVE' AND t."createdAt" >= ${twoYearsAgo}
                GROUP BY DATE_TRUNC('day', t."createdAt")
                ORDER BY day ASC
            `,

            // Hourly-granularity fallback for the liability trend chart,
            // same reasoning as recentTransactions/recentReferrals above —
            // also activeStatus-filtered to match dailyLiabilityAgg.
            prisma.transaction.findMany({
                where: { createdAt: { gte: twoDaysAgo }, customer: { sessionId, activeStatus: "ACTIVE" } },
                select: { id: true, points: true, createdAt: true },
                orderBy: { createdAt: "asc" },
            }),

            prisma.reward.findMany({
                where: { createdAt: { gte: twoYearsAgo }, customer: { sessionId } },
                // title added for the reward-breakdown donut (_hooks.js) —
                // per-instance ("Voucher $5"/"Voucher $10"), not
                // rewardRule.title, which is an unresolved template string
                // ("Voucher {{currency_value}}") shared by every value of
                // that rule and so useless for telling them apart.
                select: { id: true, status: true, pointsCost: true, createdAt: true, title: true },
                orderBy: { createdAt: "asc" },
            }),

            prisma.customer.count({
                where: { sessionId, activeStatus: "ACTIVE" },
            }),

            // Date-range filterable — used for both stat cards and the prize
            // activity chart. fulfilledAt added for the "Avg. fulfillment
            // time" stat card (see prizeStats.avgFulfillmentDays in
            // _hooks.js).
            prisma.physicalPrizeClaim.findMany({
                where: { createdAt: { gte: twoYearsAgo }, prize: { sessionId } },
                select: { id: true, pointsCost: true, status: true, createdAt: true, fulfilledAt: true },
                orderBy: { createdAt: "asc" },
            }),

            // Total outstanding points across active customers — a live
            // snapshot (not date-range filtered, same reasoning as
            // customerCount above), aggregated in the DB rather than
            // summing every customer row in JS.
            prisma.customer.aggregate({
                where: { sessionId, activeStatus: "ACTIVE" },
                _sum: { points: true },
            }),

            // groupBy, not findMany + JS filter — same reasoning as
            // subscription-cancellations/route.jsx's own stats query, which
            // this mirrors so the two pages' "Needs Action" counts can never
            // disagree from computing it two different ways.
            prisma.subscriptionCancelEvent.groupBy({
                by: ["resetApplied", "skipReason"],
                where: { sessionId },
                _count: { _all: true },
            }),

            // Live leaderboard snapshot, not date-range filtered — a bounded
            // `take` (unlike the raw findMany calls above), so this stays
            // cheap regardless of how many customers this shop has.
            prisma.customer.findMany({
                where: { sessionId, activeStatus: "ACTIVE" },
                orderBy: { points: "desc" },
                take: 10,
                select: { id: true, name: true, firstName: true, lastName: true, email: true, points: true },
            }),

        ]);

        const cancelTotal = cancelGrouped.reduce((sum, g) => sum + g._count._all, 0);
        const cancelNeedsAction = cancelGrouped.reduce(
            (sum, g) => (!g.resetApplied && !NON_ACTIONABLE_SKIP_REASONS.includes(g.skipReason) ? sum + g._count._all : sum),
            0
        );

        return {
            dailyTransactionAgg, recentTransactions, dailyEnrollmentAgg, recentEnrollments,
            dailyReferralAgg, recentReferrals,
            dailyLiabilityAgg, recentLiabilityTx,
            rewards, customerCount, prizeClaims,
            pointsLiability: pointsLiabilityAgg._sum.points ?? 0,
            cancelTotal,
            cancelNeedsAction,
            topCustomers,
        };
    } catch (err) {
        logger.error("Failed to load dashboard data", { module: MODULE, sessionId, error: err?.message });
        return {
            dailyTransactionAgg: [], recentTransactions: [], dailyEnrollmentAgg: [], recentEnrollments: [],
            dailyReferralAgg: [], recentReferrals: [],
            dailyLiabilityAgg: [], recentLiabilityTx: [],
            rewards: [], customerCount: 0, prizeClaims: [],
            pointsLiability: 0, cancelTotal: 0, cancelNeedsAction: 0, topCustomers: [],
        };
    }
}

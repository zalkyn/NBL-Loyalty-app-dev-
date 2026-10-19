// ─────────────────────────────────────────────────────────────────────────────
// Server-only. Feature health numbers for the dashboard's "Needs attention"
// and "How your features are doing" sections. Everything is derived from data
// the app already stores — no extra tables — and every query is read-only.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "db-server";
import { logger } from "app/utils/logger.js";
import { getPointRuleByEvent } from "@controller/pointsRule/getPointRuleByEvent.js";

const MODULE = "layout/health/_health.server.js";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const EMPTY_HEALTH = {
    referral: { ruleActive: null, trigger: null, held: 0, skipped30d: 0, flagged30d: 0, stuck: 0 },
    jobs: { failed: 0, failedOrders: [], waiting: 0 },
    ruleCurrencies: [],
};

/**
 * @param {{ id: string, shop: string }} session
 */
export async function loadHealthData(session) {
    const since = new Date(Date.now() - THIRTY_DAYS_MS);

    try {
        const [referralRule, held, recentUsed, stuckRows, failedJobs, waitingJobs, shadowRules] = await Promise.all([
            getPointRuleByEvent("REFERRAL", session.id).catch(() => null),

            prisma.referral.count({ where: { status: "HELD", referrer: { sessionId: session.id } } }),

            // Skipped / flagged live in referral.metadata (see orderPaidJob.js);
            // a bounded recent window keeps this cheap and filtered in JS.
            prisma.referral.findMany({
                where: { status: "USED", updatedAt: { gte: since }, referrer: { sessionId: session.id } },
                select: { metadata: true },
                take: 500,
            }),

            // Discount code used on an order, yet the referral never closed and no
            // reward was recorded — the exact symptom of a silently skipped reward.
            prisma.$queryRaw`
                SELECT COUNT(*)::int AS n
                FROM "Referral" r
                JOIN "Customer" c ON c.id = r."referrerId"
                JOIN "Reward" rw ON UPPER(rw.code) = UPPER(r."discountCode") AND rw."customerId" = r."referredId"
                WHERE c."sessionId" = ${session.id}
                  AND r.status = 'ACTIVE' AND r."discountUsed" = false AND rw.status = 'USED'`,

            // Newest few failures, so the merchant can quote the order ids to support
            // (the Background Jobs page is developer-only and not available to them).
            prisma.job.findMany({
                where: { shop: session.shop, status: "FAILED", type: { in: ["ORDER_PAID", "ORDER_REVERSED"] }, updatedAt: { gte: since } },
                orderBy: { updatedAt: "desc" },
                select: { payload: true },
                take: 200,
            }),
            prisma.job.count({
                // A fresh job has no lastError; a retried one keeps the error it failed with.
                where: { shop: session.shop, status: "PENDING", lastError: { not: null }, type: { in: ["ORDER_PAID", "ORDER_REVERSED"] } },
            }),

            prisma.shadowRule.findMany({
                where: { sessionId: session.id },
                select: { currencyCode: true },
                distinct: ["currencyCode"],
            }),
        ]);

        return {
            referral: {
                ruleActive: referralRule ? Boolean(referralRule.isActive) : null,
                trigger: referralRule?.conditions?.referral?.trigger ?? null,
                held,
                skipped30d: recentUsed.filter((r) => r.metadata?.skipped).length,
                flagged30d: recentUsed.filter((r) => r.metadata?.reviewFlag).length,
                stuck: Number(stuckRows?.[0]?.n ?? 0),
            },
            jobs: {
                failed: failedJobs.length,
                failedOrders: [...new Set(failedJobs.map((j) => String(j.payload?.orderId ?? "").split("/").pop()).filter(Boolean))].slice(0, 5),
                waiting: waitingJobs,
            },
            ruleCurrencies: shadowRules.map((r) => r.currencyCode).filter(Boolean),
        };
    } catch (err) {
        logger.error("Failed to load dashboard health data", { module: MODULE, sessionId: session.id, error: err?.message });
        return EMPTY_HEALTH;
    }
}

/** Most failed orders one click will re-queue, so a click can never flood the queue. */
const RETRY_BATCH_LIMIT = 20;

/**
 * Puts the shop's recently failed order jobs back in the queue (same revival
 * jobAutoRetryJob does). Safe to repeat: awards are idempotent per order and
 * reversals only take what is left, so a retried job can't double-pay.
 *
 * @param {{ shop: string }} session
 * @returns {Promise<number>} how many jobs were re-queued
 */
export async function retryFailedOrderJobs(session) {
    const since = new Date(Date.now() - THIRTY_DAYS_MS);
    const failed = await prisma.job.findMany({
        where: { shop: session.shop, status: "FAILED", type: { in: ["ORDER_PAID", "ORDER_REVERSED"] }, updatedAt: { gte: since } },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
        take: RETRY_BATCH_LIMIT,
    });
    if (!failed.length) return 0;

    const result = await prisma.job.updateMany({
        // status re-checked so a job that changed in between is left alone
        where: { id: { in: failed.map((j) => j.id) }, status: "FAILED" },
        data: { status: "PENDING", attempts: 0, lockedAt: null, failedAt: null, runAt: new Date() },
    });
    logger.info("Merchant re-queued failed order jobs", { module: MODULE, shop: session.shop, count: result.count });
    return result.count;
}

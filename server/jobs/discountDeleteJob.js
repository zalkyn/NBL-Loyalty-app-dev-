import prisma from "../../app/db.server.js";
import { unauthenticated } from "../../app/shopify.server.js";
import { logger } from "../../app/utils/logger.js";
import { dbRetry } from "../../app/utils/retry/dbRetry.js";
import { deleteDiscountCode } from "../../app/graphql/mutation/discounts/deleteDiscountCode.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "discountDeleteJob";

/** @constant {number} Maximum number of PENDING jobs to process in a single poller cycle. */
const BATCH_SIZE = 50;

/** @constant {number} How long (ms) a job may remain in PROCESSING before it is considered stale and re-queued. */
const STALE_LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ─────────────────────────────────────────────────────────────────────────────
// Job Entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main entry point called by jobManager on each cron cycle.
 *
 * Handles DISCOUNT_DELETE jobs, enqueued by:
 *   - customers/$id/_action.server.js's handleCancelReward -> source: "reward_cancel"
 *     (only if AppSettings.settings.discountDelete.onRewardCancel is on)
 *   - orderPaidJob.js's "Voucher rewards marked as used" step -> source: "reward_used"
 *     (only if AppSettings.settings.discountDelete.onRewardUsed is on)
 *
 * Deliberately its own job type/poller rather than piggybacking on
 * orderPaidJob/orderReversalJob — this is a low-priority hygiene task, not
 * something customer-facing should ever wait on, and keeping it separate
 * means a burst of cancellations can never delay real order processing.
 *
 * Same crash-recovery + batching + backoff shape as orderReversalJob.js.
 *
 * @returns {Promise<void>}
 */
export async function runDiscountDeleteJob() {
    await requeueStaleJobs();

    const jobs = await dbRetry(
        () =>
            prisma.job.findMany({
                where: {
                    type: "DISCOUNT_DELETE",
                    status: "PENDING",
                    runAt: { lte: new Date() },
                },
                orderBy: { runAt: "asc" },
                take: BATCH_SIZE,
            }),
        { module: MODULE }
    );

    if (!jobs.length) {
        logger.info(MODULE, "No pending DISCOUNT_DELETE jobs — skipping cycle");
        return;
    }

    logger.info(MODULE, `Processing ${jobs.length} DISCOUNT_DELETE job(s)`);

    for (const job of jobs) {
        try {
            await processJob(job);
        } catch (err) {
            logger.error(MODULE, `Job #${job.id} threw outside its own error handling — skipping`, {
                shop: job.shop,
                error: err?.message,
            });
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stale Lock Recovery
// ─────────────────────────────────────────────────────────────────────────────

async function requeueStaleJobs() {
    const staleThreshold = new Date(Date.now() - STALE_LOCK_TIMEOUT_MS);

    const { count } = await dbRetry(
        () =>
            prisma.job.updateMany({
                where: {
                    type: "DISCOUNT_DELETE",
                    status: "PROCESSING",
                    lockedAt: { lte: staleThreshold },
                },
                data: {
                    status: "PENDING",
                    lockedAt: null,
                    lastError: "Re-queued after stale lock detected (possible server crash)",
                },
            }),
        { module: MODULE }
    );

    if (count > 0) {
        logger.warn(MODULE, `Re-queued ${count} stale DISCOUNT_DELETE job(s)`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-Job Processor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Processes a single DISCOUNT_DELETE job end-to-end.
 *
 * @param {{ id: number, shop: string, payload: object, attempts: number, maxAttempts: number }} job
 * @returns {Promise<void>}
 */
async function processJob(job) {
    const { id, shop, payload, attempts, maxAttempts } = job;
    const { discountNodeId, source, entityType, entityId } = payload || {};

    // ── 1. Claim — same conditional-update race guard as orderReversalJob.js ──
    const claim = await dbRetry(
        () =>
            prisma.job.updateMany({
                where: { id, status: "PENDING" },
                data: { status: "PROCESSING", lockedAt: new Date() },
            }),
        { module: MODULE, jobId: id }
    );

    if (claim.count === 0) {
        logger.info(MODULE, `Job #${id} already claimed by another process — skipping`, { shop, discountNodeId });
        return;
    }

    logger.info(MODULE, `Processing job #${id}`, { shop, discountNodeId, source, entityType, entityId, attempt: attempts + 1, maxAttempts });

    try {
        if (!discountNodeId) throw new Error("Job payload missing discountNodeId");

        const { admin, session } = await unauthenticated.admin(shop);
        if (!session) throw new Error(`No active session for shop: ${shop}`);

        await deleteDiscountCode(admin, discountNodeId);

        // ── 2a. Success ──────────────────────────────────────────────────────
        await dbRetry(
            () =>
                prisma.job.update({
                    where: { id },
                    data: {
                        status: "COMPLETED",
                        lockedAt: null,
                        completedAt: new Date(),
                        attempts: attempts + 1,
                    },
                }),
            { module: MODULE, jobId: id }
        );

        logger.success(MODULE, `Job #${id} completed`, { shop, discountNodeId, source });
    } catch (err) {
        const nextAttempt = attempts + 1;
        const exhausted = nextAttempt >= maxAttempts;

        // ── 2b. Failure — exponential backoff: 2min -> 4min -> 8min ────────────
        const backoffMs = exhausted
            ? 0
            : Math.min(2 ** nextAttempt * 60 * 1000, 30 * 60 * 1000);

        await dbRetry(
            () =>
                prisma.job.update({
                    where: { id },
                    data: {
                        status: exhausted ? "FAILED" : "PENDING",
                        lockedAt: null,
                        attempts: nextAttempt,
                        lastError: err?.message,
                        failedAt: exhausted ? new Date() : null,
                        runAt: exhausted ? undefined : new Date(Date.now() + backoffMs),
                    },
                }),
            { module: MODULE, jobId: id }
        ).catch((updateErr) => {
            logger.error(MODULE, `Failed to record failure for job #${id}`, { error: updateErr?.message });
        });

        if (exhausted) {
            // Not customer-facing and not urgent — a discount code that
            // never got cleaned up is a minor tidiness issue, not a broken
            // feature, so this stays at "error" (visible in the Jobs page)
            // rather than needing any alerting beyond that.
            logger.error(MODULE, `Job #${id} permanently failed`, { shop, discountNodeId, source, error: err?.message });
        } else {
            logger.warn(MODULE, `Job #${id} failed — retrying in ${Math.round(backoffMs / 1000)}s`, {
                shop, discountNodeId, source, attempt: nextAttempt, error: err?.message,
            });
        }
    }
}

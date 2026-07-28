import prisma from "../../db.server.js";
import syncCustomersFromStore from "./syncCustomersFromStore.js";
import { customersCount } from "../../graphql/query/customers.js";
import { logger } from "../../utils/logger.js";
import { dbRetry } from "../../utils/retry/dbRetry.js";

const MODULE = "customerSyncProcessor";

const STALE_LOCK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/**
 * @constant {number} Minimum gap between progress writes.
 *
 * A page lands roughly every second or two, and the UI polls every three,
 * so writing on every single page would spend database round-trips
 * producing numbers nobody reads. Throttling to five seconds keeps the
 * bar visibly moving while making progress reporting a rounding error
 * against the sync itself.
 */
const PROGRESS_WRITE_INTERVAL_MS = 5000;

// ─────────────────────────────────────────────────────────────────────────────
// Stale Lock Recovery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resets CUSTOMER_SYNC jobs stuck in PROCESSING back to PENDING.
 * Called at the start of every cron cycle as a crash-recovery guard.
 */
export async function requeueStaleCustomerSyncJobs() {
    const staleThreshold = new Date(Date.now() - STALE_LOCK_TIMEOUT_MS);

    const { count } = await dbRetry(
        () =>
            prisma.job.updateMany({
                where: {
                    type: "CUSTOMER_SYNC",
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
        logger.warn(MODULE, `Re-queued ${count} stale CUSTOMER_SYNC job(s)`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How many customers this app already holds for the session.
 *
 * Never throws — it feeds an estimate, and a sync must not fail because a
 * decorative denominator was unavailable.
 */
async function countLocalCustomers(sessionId) {
    try {
        return await prisma.customer.count({ where: { sessionId } });
    } catch (error) {
        logger.warn(MODULE, "Couldn't count local customers", { sessionId, error: error?.message });
        return 0;
    }
}

/**
 * Persists one progress snapshot onto the job's payload.
 *
 * `payload` is rewritten wholesale rather than merged, because Prisma's
 * Json columns have no partial-update operator — so shop and sessionId
 * are restated every time. They're already known here; reading the row
 * back first purely to preserve them would double the cost of the most
 * frequent write this job makes.
 *
 * Never throws, and deliberately does not use dbRetry. This is the
 * reporting path, not the work: a progress write that fails is one stale
 * number for five seconds, and the next one is already on its way. Making
 * the sync wait through a retry cycle for it would be the reporting
 * getting in the way of the thing being reported on.
 */
async function writeProgress(jobId, session, progress) {
    try {
        await prisma.job.update({
            where: { id: jobId },
            data: {
                payload: {
                    shop: session.shop,
                    sessionId: session.id,
                    progress,
                },
            },
        });
    } catch (error) {
        logger.warn(MODULE, "Couldn't write sync progress", { jobId, error: error?.message });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Processor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Processes a single CUSTOMER_SYNC job end-to-end.
 *
 * Used by both:
 *   - The action (immediate trigger via setImmediate) — admin/session already available
 *   - The cron job (recovery path) — admin/session resolved via unauthenticated.admin
 *
 * @param {Object} admin   - Shopify Admin GraphQL client
 * @param {Object} session - Shopify session
 * @param {number} jobId   - Job DB id
 */
export async function processCustomerSync(admin, session, jobId) {
    // ── Mark as PROCESSING ────────────────────────────────────────────────────
    await dbRetry(
        () =>
            prisma.job.update({
                where: { id: jobId },
                data: { status: "PROCESSING", lockedAt: new Date(), attempts: { increment: 1 } },
            }),
        { module: MODULE, jobId }
    );

    logger.info(MODULE, "Customer sync started", { shop: session.shop, jobId });

    try {
        // ── Working out a denominator ─────────────────────────────────────
        // Shopify's customersCount caps at 10,000 and reports precision
        // AT_LEAST above that, so on any shop large enough for progress to
        // matter the figure is a floor, not a total — 10,000 on a shop with
        // 80,278 customers.
        //
        // The local customer table is the better estimate in that case: on
        // any sync after the first it is within a handful of the truth,
        // because it is the result of the previous sync. It is only wrong
        // on a first import, where it reads 0 and no bar is drawn at all —
        // which is the correct output for a total nobody knows.
        const counted = await customersCount(admin);
        const isExact = counted?.precision === "EXACT" && typeof counted.count === "number";

        let expectedTotal = isExact ? counted.count : null;
        let totalIsEstimate = false;

        if (!isExact) {
            const localCount = await countLocalCustomers(session.id);
            const floor = counted?.count ?? 0;
            const estimate = Math.max(localCount, floor);

            if (estimate > 0) {
                expectedTotal = estimate;
                totalIsEstimate = true;
            }
        }

        // Written straight away rather than waiting for the first page, so
        // a merchant who opens the page during the fetch sees the size of
        // what they started instead of an empty panel.
        await writeProgress(jobId, session, {
            total: expectedTotal,
            totalIsEstimate,
            processed: 0,
            success: 0,
            failed: 0,
        });

        let lastWriteAt = Date.now();

        const result = await syncCustomersFromStore(admin, session, {
            total: expectedTotal,
            totalIsEstimate,
            onProgress: async (progress) => {
                if (Date.now() - lastWriteAt < PROGRESS_WRITE_INTERVAL_MS) return;
                lastWriteAt = Date.now();
                await writeProgress(jobId, session, progress);
            },
        });

        // Retried on transient DB failure — without this, a dropped connection
        // here would mark an otherwise-successful sync as FAILED (see catch
        // below), even though every customer was already synced.
        await dbRetry(
            () =>
                prisma.job.update({
                    where: { id: jobId },
                    data: {
                        status: "COMPLETED",
                        completedAt: new Date(),
                        lockedAt: null,
                        payload: {
                            shop: session.shop,
                            sessionId: session.id,
                            result: { total: result.total, success: result.success, failed: result.failed },
                            // The final progress row is written as processed
                            // against processed, never against the earlier
                            // estimate. A finished sync must read 100%: a bar
                            // stopped at 99% because the count was taken a
                            // minute before the last customer was added is a
                            // bug report waiting to be filed.
                            progress: {
                                total: result.total,
                                totalIsEstimate: false,
                                processed: result.total,
                                success: result.success,
                                failed: result.failed,
                            },
                        },
                    },
                }),
            { module: MODULE, jobId }
        );

        logger.success(MODULE, "Customer sync completed", {
            shop: session.shop,
            jobId,
            total: result.total,
            success: result.success,
            failed: result.failed,
        });

    } catch (err) {
        await dbRetry(
            () =>
                prisma.job.update({
                    where: { id: jobId },
                    data: {
                        status: "FAILED",
                        lockedAt: null,
                        lastError: err?.message ?? "Unknown error",
                        failedAt: new Date(),
                    },
                }),
            { module: MODULE, jobId }
        ).catch((updateErr) => {
            // Best-effort — if even the FAILED-status write fails, log it
            // separately so the job isn't left silently stuck in PROCESSING.
            logger.error(MODULE, "Failed to mark job as FAILED", { jobId, error: updateErr?.message });
        });

        logger.error(MODULE, "Customer sync failed", {
            shop: session.shop,
            jobId,
            error: err?.message,
        });

        throw err;
    }
}
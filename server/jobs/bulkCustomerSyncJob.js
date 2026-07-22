import prisma from "../../app/db.server.js";
import { unauthenticated } from "../../app/shopify.server.js";
import { logger } from "../../app/utils/logger.js";
import { dbRetry } from "../../app/utils/retry/dbRetry.js";
import { syncCustomerConfig } from "../../app/controller/metafieldsSync/syncCustomerConfig.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "bulkCustomerSyncJob";

/** @constant {number} Customers processed per poller cycle, per job. Keeps
 *  each cycle's Shopify API load predictable and bounded, regardless of how
 *  many total customers a shop has (100k+ or 10) — this is what makes the
 *  job safe to run at any shop size without a special-case for scale. */
const BATCH_SIZE = 50;

/** @constant {number} How many shops' bulk-sync jobs to advance per cycle
 *  (each by one BATCH_SIZE chunk) — bounds total per-cycle work if, in a
 *  multi-shop install, several shops happened to have one running at once. */
const MAX_JOBS_PER_CYCLE = 5;

/** @constant {number} How long (ms) a job may remain PROCESSING before it's
 *  considered stale and re-queued (e.g. server restarted mid-batch). */
const STALE_LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ─────────────────────────────────────────────────────────────────────────────
// Job Entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main entry point called by jobManager on each cron cycle.
 *
 * Handles BULK_CUSTOMER_SYNC jobs — enqueued from the admin Version
 * Tracking page's "Sync all customers now" / "Sync only unsynced
 * customers" buttons (see enqueueBulkCustomerSync.js).
 *
 * Deliberately chunked and resumable rather than "one job, one giant loop":
 * a shop can have 100k+ customers, each requiring a real Shopify Admin API
 * call (syncCustomerConfig's metafieldsSet) — doing that in one job
 * execution would run for hours, blow past any reasonable jobTimeout, and
 * hold a lock the whole time. Instead, each cycle advances a job by ONE
 * BATCH_SIZE chunk (cursor stored in the job's own payload) and re-queues
 * itself for the next cycle — same "many small steps, never one big one"
 * principle as every other job in this codebase, just applied to a job
 * whose total work size varies by 4+ orders of magnitude between shops.
 *
 * @returns {Promise<void>}
 */
export async function runBulkCustomerSyncJob() {
    await requeueStaleJobs();

    const jobs = await dbRetry(
        () =>
            prisma.job.findMany({
                where: {
                    type: "BULK_CUSTOMER_SYNC",
                    status: "PENDING",
                    runAt: { lte: new Date() },
                },
                orderBy: { runAt: "asc" },
                take: MAX_JOBS_PER_CYCLE,
            }),
        { module: MODULE }
    );

    if (!jobs.length) return;

    for (const job of jobs) {
        try {
            await processOneBatch(job);
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
                    type: "BULK_CUSTOMER_SYNC",
                    status: "PROCESSING",
                    lockedAt: { lte: staleThreshold },
                },
                data: {
                    status: "PENDING",
                    lockedAt: null,
                    lastError: "Re-queued after stale lock detected (possible server crash) — resumes from its saved cursor, no progress lost",
                },
            }),
        { module: MODULE }
    );

    if (count > 0) {
        logger.warn(MODULE, `Re-queued ${count} stale BULK_CUSTOMER_SYNC job(s)`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-Job, Per-Batch Processor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Advances one BULK_CUSTOMER_SYNC job by exactly one batch.
 *
 * @param {{ id: number, shop: string, payload: object }} job
 * @returns {Promise<void>}
 */
async function processOneBatch(job) {
    const { id, shop, payload } = job;
    const scope = payload?.scope === "unsynced" ? "unsynced" : "all";
    const cursor = payload?.cursor || 0;

    // Same conditional-update claim pattern as every other job here — see
    // discountDeleteJob.js for the full rationale.
    const claim = await dbRetry(
        () =>
            prisma.job.updateMany({
                where: { id, status: "PENDING" },
                data: { status: "PROCESSING", lockedAt: new Date() },
            }),
        { module: MODULE, jobId: id }
    );

    if (claim.count === 0) return;

    try {
        const { admin, session } = await unauthenticated.admin(shop);
        if (!session) throw new Error(`No active session for shop: ${shop}`);

        const where = {
            sessionId: session.id,
            id: { gt: cursor },
            // "unsynced" = never been through a full ("core"-scope) sync —
            // see Customer.lastSyncedVersionKey's schema comment. Customers
            // who self-heal via their own order/reward/referral events
            // never need this at all; this scope exists specifically to
            // catch the ones who don't (browse-only accounts).
            ...(scope === "unsynced" ? { lastSyncedVersionKey: null } : {}),
        };

        const batch = await dbRetry(
            () =>
                prisma.customer.findMany({
                    where,
                    orderBy: { id: "asc" },
                    take: BATCH_SIZE,
                    select: { id: true, shopifyId: true },
                }),
            { module: MODULE, jobId: id }
        );

        if (batch.length === 0) {
            await dbRetry(
                () =>
                    prisma.job.update({
                        where: { id },
                        data: { status: "COMPLETED", lockedAt: null, completedAt: new Date() },
                    }),
                { module: MODULE, jobId: id }
            );
            logger.success(MODULE, `Job #${id} completed — bulk sync finished`, { shop, scope });
            return;
        }

        // Sequential, not parallel — same rate-limit-friendly reasoning as
        // every other job in this codebase. syncCustomerConfig already
        // retries internally on transient failure and never throws (logs
        // and returns null on failure instead) — so one customer's Shopify
        // record being gone, or one transient error, doesn't abort the
        // whole batch; it's simply skipped and the batch continues.
        for (const customer of batch) {
            await syncCustomerConfig(admin, customer.shopifyId);
        }

        const newCursor = batch[batch.length - 1].id;
        const isLastBatch = batch.length < BATCH_SIZE;

        await dbRetry(
            () =>
                prisma.job.update({
                    where: { id },
                    data: {
                        status: isLastBatch ? "COMPLETED" : "PENDING",
                        lockedAt: null,
                        completedAt: isLastBatch ? new Date() : null,
                        payload: { scope, cursor: newCursor },
                        // Immediately eligible for the next cycle — no
                        // artificial delay between chunks, the poller's own
                        // cadence is already the pacing mechanism.
                        runAt: isLastBatch ? undefined : new Date(),
                    },
                }),
            { module: MODULE, jobId: id }
        );

        logger.info(MODULE, `Job #${id} processed a batch of ${batch.length}`, {
            shop, scope, newCursor, isLastBatch,
        });
    } catch (err) {
        // Whole-batch failure (e.g. unauthenticated.admin itself failing,
        // not an individual customer) — re-queue from the SAME cursor, no
        // progress lost. Not using the attempts/backoff pattern other jobs
        // use here on purpose: a shop-auth failure isn't something that
        // benefits from exponential backoff, and this job already only
        // advances one small chunk per cycle, which is pacing enough.
        await dbRetry(
            () =>
                prisma.job.update({
                    where: { id },
                    data: {
                        status: "PENDING",
                        lockedAt: null,
                        lastError: err?.message,
                        runAt: new Date(Date.now() + 60 * 1000), // brief 1-minute cooldown before retrying
                    },
                }),
            { module: MODULE, jobId: id }
        ).catch((updateErr) => {
            logger.error(MODULE, `Failed to record failure for job #${id}`, { error: updateErr?.message });
        });

        logger.error(MODULE, `Job #${id} batch failed — will retry from the same cursor`, {
            shop, error: err?.message,
        });
    }
}

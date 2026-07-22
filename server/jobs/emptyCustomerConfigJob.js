import prisma from "../../app/db.server.js";
import { unauthenticated } from "../../app/shopify.server.js";
import { logger } from "../../app/utils/logger.js";
import { dbRetry } from "../../app/utils/retry/dbRetry.js";
import clearCustomerMetafields from "../../app/graphql/mutation/metafieldsSync/clearCustomerMetafields.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "emptyCustomerConfigJob";

/** @constant {number} Customers processed per poller cycle — same reasoning
 *  as bulkCustomerSyncJob.js's BATCH_SIZE. */
const BATCH_SIZE = 50;

/** @constant {number} How many shops' jobs to advance per cycle. */
const MAX_JOBS_PER_CYCLE = 5;

/** @constant {number} Stale-lock threshold. */
const STALE_LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ─────────────────────────────────────────────────────────────────────────────
// Job Entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main entry point called by jobManager on each cron cycle.
 *
 * Handles EMPTY_CUSTOMER_CONFIG jobs — enqueued from the Customer Sync
 * page's "empty already-synced customers' config" button (see
 * maintenanceToolFlags.js).
 *
 * Does the OPPOSITE of bulkCustomerSyncJob.js: instead of writing fresh
 * data TO a customer's split metafields, this DELETES them from Shopify —
 * for customers who currently have a synced config
 * (lastSyncedVersionKey IS NOT NULL) only, since "empty an already-synced
 * customer" is specifically the scenario this simulates (self-heal/
 * fallback against real Shopify data, not just this app's DB — see
 * clearCustomerMetafields.js's own comment).
 *
 * Same chunked/resumable shape as bulkCustomerSyncJob.js and the same
 * reasoning for why: real per-customer Shopify API calls, so this must
 * never try to do a shop's entire customer base in one job execution.
 *
 * @returns {Promise<void>}
 */
export async function runEmptyCustomerConfigJob() {
    await requeueStaleJobs();

    const jobs = await dbRetry(
        () =>
            prisma.job.findMany({
                where: {
                    type: "EMPTY_CUSTOMER_CONFIG",
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
                    type: "EMPTY_CUSTOMER_CONFIG",
                    status: "PROCESSING",
                    lockedAt: { lte: staleThreshold },
                },
                data: {
                    status: "PENDING",
                    lockedAt: null,
                    lastError: "Re-queued after stale lock detected — resumes from its saved cursor, no progress lost",
                },
            }),
        { module: MODULE }
    );

    if (count > 0) {
        logger.warn(MODULE, `Re-queued ${count} stale EMPTY_CUSTOMER_CONFIG job(s)`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-Job, Per-Batch Processor
// ─────────────────────────────────────────────────────────────────────────────

async function processOneBatch(job) {
    const { id, shop, payload } = job;
    const cursor = payload?.cursor || 0;

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

        // Only customers who currently HAVE a synced config — see this
        // file's header comment for why that's the exact scope requested.
        const batch = await dbRetry(
            () =>
                prisma.customer.findMany({
                    where: {
                        sessionId: session.id,
                        id: { gt: cursor },
                        lastSyncedVersionKey: { not: null },
                    },
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
            logger.success(MODULE, `Job #${id} completed — all already-synced customers emptied`, { shop });
            return;
        }

        // Sequential, not parallel — same rate-limit-friendly reasoning as
        // every job in this codebase. Each customer: clear their Shopify
        // metafields, THEN (only after that real deletion is confirmed)
        // reset the DB's own tracking column to match reality — same
        // "write the source of truth first" ordering principle as
        // syncCustomerConfig.js's version-key stamping.
        for (const customer of batch) {
            try {
                await clearCustomerMetafields(admin, customer.shopifyId);
                await dbRetry(
                    () =>
                        prisma.customer.update({
                            where: { id: customer.id },
                            data: { lastSyncedVersionKey: null },
                        }),
                    { module: MODULE, jobId: id, customerId: customer.id }
                );
            } catch (customerErr) {
                // One customer failing (e.g. their Shopify record gone)
                // shouldn't abort the whole batch — log and move on, same
                // as syncCustomerConfig's own per-customer error handling.
                logger.error(MODULE, "Failed to clear one customer's metafields — skipping", {
                    shop, customerId: customer.id, error: customerErr?.message,
                });
            }
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
                        payload: { cursor: newCursor },
                        runAt: isLastBatch ? undefined : new Date(),
                    },
                }),
            { module: MODULE, jobId: id }
        );

        logger.info(MODULE, `Job #${id} processed a batch of ${batch.length}`, { shop, newCursor, isLastBatch });
    } catch (err) {
        await dbRetry(
            () =>
                prisma.job.update({
                    where: { id },
                    data: {
                        status: "PENDING",
                        lockedAt: null,
                        lastError: err?.message,
                        runAt: new Date(Date.now() + 60 * 1000),
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

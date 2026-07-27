/**
 * @file jobs/pointsBackfillJob.js
 * @description Processes pending POINTS_BACKFILL jobs — one-time
 * retroactive points for the customers in an APPROVED
 * BackfillAudienceSnapshot.
 *
 * ── What changed, and why ────────────────────────────────────────────────
 * This job used to page through the shop's ENTIRE customer list from
 * Shopify and filter each page client-side, because Shopify deprecated
 * the Customer search filters that would have narrowed it server-side
 * (Admin API 2024-07: `tag`, `tag_not`, `customer_date`, `total_spent`
 * and others). That decision was right about the API and wrong about the
 * cost: on a 100k-customer shop, at one 50-customer page per 30-second
 * cycle, reaching an audience of ~2k people took roughly 16 hours, ~98%
 * of it spent fetching and discarding customers who were never in scope.
 *
 * The audience now comes from a Shopify customer Segment, captured into a
 * frozen snapshot beforehand (see snapshotBuildJob.js). This job reads
 * that snapshot.
 *
 * The consequence worth stating plainly: THIS JOB MAKES NO SHOPIFY API
 * CALLS AT ALL. Everything it needs — the customer list, their spend,
 * their contact details — was captured and verified during the preview
 * phase. That removes, in one move, rate limiting, mid-run network
 * failure, and the run's silent dependency on Shopify's opaque pagination
 * cursor still being valid many hours after it was issued (something
 * Shopify documents no guarantee about).
 *
 * ── Resumability ─────────────────────────────────────────────────────────
 * Progress is BackfillAudienceMember.processed, not a cursor in the job
 * payload. Resuming is `WHERE processed = false ORDER BY id ASC LIMIT n`,
 * which cannot expire, cannot go stale, and needs no reconciliation after
 * a crash. The flag is set only AFTER the customer's PointsBackfillEntry
 * reaches a terminal status, so a crash in between re-processes that one
 * customer — harmless, because PointsBackfillEntry's own
 * @@unique([shadowRuleId, customerId]) turns the retry into a no-op.
 */

import prisma from "../../app/db.server.js";
import { logger } from "../../app/utils/logger.js";
import { dbRetry } from "../../app/utils/retry/dbRetry.js";
import { getOrCreateCustomer } from "../../app/controller/customers/getOrCreateCustomer.js";
import createTransaction from "../../app/controller/transaction/createTransaction.js";
import { computePoints, currencyMatches } from "../../app/utils/backfill/computePoints.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "pointsBackfillJob";

/**
 * @constant {number} Snapshot members processed per poller cycle, per job.
 *
 * Raised from the old 50. That figure was chosen to bound a cycle that
 * also made a Shopify API call and had to stay inside a rate-limit
 * budget; this job makes none, so the only constraint left is local DB
 * throughput and the 5-minute jobTimeout. 250 members at CONCURRENCY 10
 * is 25 sequential sub-batches of local work — comfortably inside that,
 * and it turns a 2,000-member run into 8 cycles (~4 minutes) instead of
 * 40.
 */
const BATCH_SIZE = 250;

/** @constant {number} How many shops' backfill jobs to advance per cycle. */
const MAX_JOBS_PER_CYCLE = 3;

/** @constant {number} How many members within a batch are processed
 *  concurrently. Unchanged at 10, and for the same reason as before: each
 *  member means a get-or-create, a PointsBackfillEntry, and a
 *  Serializable-isolation createTransaction, so a bounded sub-batch keeps
 *  the connection pool from taking 250 concurrent transactions while
 *  still being far faster than sequential. */
const CONCURRENCY = 10;

/** @constant {number} Stale-lock threshold. */
const STALE_LOCK_TIMEOUT_MS = 10 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Job Entry
// ─────────────────────────────────────────────────────────────────────────────

export async function runPointsBackfillJob() {
    await requeueStaleJobs();

    const jobs = await dbRetry(
        () =>
            prisma.job.findMany({
                where: { type: "POINTS_BACKFILL", status: "PENDING", runAt: { lte: new Date() } },
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
                where: { type: "POINTS_BACKFILL", status: "PROCESSING", lockedAt: { lte: staleThreshold } },
                data: {
                    status: "PENDING",
                    lockedAt: null,
                    lastError:
                        "Re-queued after stale lock detected (possible server crash) — resumes from the first unprocessed snapshot member, no progress lost (already-awarded customers are protected by PointsBackfillEntry's idempotency constraint).",
                },
            }),
        { module: MODULE }
    );

    if (count > 0) {
        logger.warn(MODULE, `Re-queued ${count} stale POINTS_BACKFILL job(s)`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Terminal Failure Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marks a job FAILED outright — for preconditions a retry cannot fix: a
 * malformed payload, a snapshot or rule that no longer exists, or a rule
 * deactivated mid-run (see ShadowRule.isActive's schema comment — that is
 * how an admin halts a run in progress). Contrast with the try/catch in
 * processOneBatch, which handles TRANSIENT failures that requeue.
 *
 * @param {number} id
 * @param {string} shop
 * @param {string} message
 */
async function failJob(id, shop, message) {
    await dbRetry(
        () =>
            prisma.job.update({
                where: { id },
                data: { status: "FAILED", lockedAt: null, lastError: message, failedAt: new Date() },
            }),
        { module: MODULE, jobId: id }
    ).catch((updateErr) => {
        logger.error(MODULE, `Failed to record FAILED status for job #${id}`, { error: updateErr?.message });
    });

    logger.error(MODULE, `Job #${id} marked FAILED (terminal — will not auto-retry)`, { shop, reason: message });
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-Job, Per-Batch Processor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Advances one POINTS_BACKFILL job by one batch of snapshot members.
 *
 * @param {{ id: number, shop: string, payload: object }} job
 */
async function processOneBatch(job) {
    const { id, shop, payload } = job;
    const snapshotId = payload?.snapshotId;
    const shadowRuleId = payload?.shadowRuleId;
    const counts = payload?.counts || { awarded: 0, skipped: 0, failed: 0 };

    const claim = await dbRetry(
        () => prisma.job.updateMany({ where: { id, status: "PENDING" }, data: { status: "PROCESSING", lockedAt: new Date() } }),
        { module: MODULE, jobId: id }
    );

    if (claim.count === 0) return;

    // ── Terminal precondition checks — FAILED, not retried. See failJob(). ──
    if (!snapshotId || !shadowRuleId) {
        return failJob(id, shop, "Job payload missing snapshotId or shadowRuleId");
    }

    const snapshot = await dbRetry(
        () =>
            prisma.backfillAudienceSnapshot.findUnique({
                where: { id: snapshotId },
                include: { shadowRule: true },
            }),
        { module: MODULE, jobId: id }
    );

    if (!snapshot) {
        return failJob(id, shop, `Snapshot #${snapshotId} no longer exists`);
    }

    const shadowRule = snapshot.shadowRule;

    if (!shadowRule || shadowRule.id !== shadowRuleId) {
        return failJob(id, shop, `Snapshot #${snapshotId} does not belong to shadow rule #${shadowRuleId}`);
    }

    // Re-checked every cycle (not just at enqueue) so an admin can halt an
    // in-progress run by deactivating the rule.
    if (!shadowRule.isActive) {
        return failJob(id, shop, `ShadowRule #${shadowRuleId} ("${shadowRule.name}") was deactivated — halting run`);
    }

    try {
        // The session is read straight from the database rather than
        // through unauthenticated.admin(shop). Nothing in this job talks
        // to Shopify, so going through the Shopify client purely to obtain
        // a session would reintroduce a network dependency the redesign
        // exists to remove. A missing session means the app was
        // uninstalled mid-run, which is transient in the sense that a
        // reinstall fixes it — hence a throw into the retry path rather
        // than a terminal failure.
        const session = await dbRetry(
            () => prisma.session.findUnique({ where: { id: snapshot.sessionId }, select: { id: true, shop: true } }),
            { module: MODULE, jobId: id }
        );

        if (!session) throw new Error(`No session found for shop: ${shop}`);

        const members = await dbRetry(
            () =>
                prisma.backfillAudienceMember.findMany({
                    where: { snapshotId, processed: false },
                    orderBy: { id: "asc" },
                    take: BATCH_SIZE,
                }),
            { module: MODULE, jobId: id }
        );

        if (members.length === 0) {
            await dbRetry(
                () =>
                    prisma.job.update({
                        where: { id },
                        data: { status: "COMPLETED", lockedAt: null, completedAt: new Date(), payload: { ...payload, counts } },
                    }),
                { module: MODULE, jobId: id }
            );

            logger.info(MODULE, `Job #${id} completed`, { shop, snapshotId, totalCounts: counts });
            return;
        }

        const cycleCounts = { awarded: 0, skipped: 0, failed: 0 };

        for (let i = 0; i < members.length; i += CONCURRENCY) {
            const chunk = members.slice(i, i + CONCURRENCY);
            const settled = await Promise.allSettled(
                chunk.map((member) => processOneMember({ job, shadowRule, session, member }))
            );

            settled.forEach((result, idx) => {
                if (result.status === "fulfilled") {
                    cycleCounts[result.value] += 1;
                } else {
                    cycleCounts.failed += 1;
                    logger.error(MODULE, "Unexpected error processing a member — counted as failed", {
                        shop,
                        jobId: id,
                        shopifyId: chunk[idx]?.shopifyId,
                        error: result.reason?.message,
                    });
                }
            });
        }

        const newCounts = {
            awarded: counts.awarded + cycleCounts.awarded,
            skipped: counts.skipped + cycleCounts.skipped,
            failed: counts.failed + cycleCounts.failed,
        };

        // Best-effort running tally for a quick progress display — see
        // getPointsBackfillStatus()'s own comment on why
        // PointsBackfillEntry, not this, is authoritative.
        await dbRetry(
            () =>
                prisma.job.update({
                    where: { id },
                    data: {
                        status: "PENDING",
                        lockedAt: null,
                        payload: { ...payload, counts: newCounts },
                        runAt: new Date(),
                    },
                }),
            { module: MODULE, jobId: id }
        );

        logger.info(MODULE, `Job #${id} processed a batch of ${members.length}`, {
            shop,
            snapshotId,
            ...cycleCounts,
            totalCounts: newCounts,
        });
    } catch (err) {
        // Whole-batch failure — re-queue. There is no cursor to preserve:
        // `processed = false` already describes exactly what's left.
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

        logger.error(MODULE, `Job #${id} batch failed — will retry from the first unprocessed member`, {
            shop,
            snapshotId,
            error: err?.message,
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-Member Processor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adapts a BackfillAudienceMember row into the shape
 * getOrCreateCustomer()/storeCustomer() already read.
 *
 * store.js reads `defaultEmailAddress.emailAddress`, `firstName`,
 * `lastName` and an id off a raw Shopify customer node — the snapshot
 * columns were chosen to mirror exactly those, so this is a re-wrap
 * rather than a translation, and store.js needs no knowledge that
 * segments exist.
 *
 * @param {Object} member
 * @returns {Object}
 */
function toShopifyCustomerShape(member) {
    return {
        id: member.shopifyId,
        admin_graphql_api_id: member.shopifyId,
        firstName: member.firstName,
        lastName: member.lastName,
        defaultEmailAddress: member.email ? { emailAddress: member.email } : null,
    };
}

/**
 * Processes ONE snapshot member: get-or-create their local Customer
 * record, claim an idempotent PointsBackfillEntry, compute and award.
 *
 * ── On recomputing rather than trusting projectedPoints ──────────────────
 * The snapshot already holds a projectedPoints figure from preview time,
 * and this deliberately ignores it, recomputing from the same stored
 * amountSpent instead. A merchant can edit a ShadowRule between building
 * a preview and starting the run, and the award must reflect the rule as
 * it stands at award time — that's the value the Transaction, the
 * PointsBackfillEntry and any later audit will all be read against.
 * projectedPoints stays in the snapshot as the record of what the
 * merchant was shown; a divergence is logged rather than silently
 * reconciled, because it means the CSV they approved no longer describes
 * what happened.
 *
 * Note that amountSpent itself is NOT re-read from Shopify. It's frozen
 * at snapshot time on purpose — see PointsBackfillEntry.amountSpent's
 * schema comment: "why did this customer get exactly N points" must stay
 * answerable from stored rows alone, without today's live data.
 *
 * Any error thrown here propagates to the Promise.allSettled in
 * processOneBatch, which counts it as failed and logs it.
 *
 * @param {Object} params
 * @param {Object} params.job
 * @param {Object} params.shadowRule
 * @param {Object} params.session
 * @param {Object} params.member
 * @returns {Promise<"awarded"|"skipped"|"failed">}
 */
async function processOneMember({ job, shadowRule, session, member }) {
    const localCustomerId = await getOrCreateCustomer(session, toShopifyCustomerShape(member));

    if (!localCustomerId) {
        // Almost always: no email on file, so store.js has no key to
        // upsert on. The preview already predicted this (see the
        // skipReason column), so it should be no surprise to the merchant.
        // Marked processed WITHOUT a PointsBackfillEntry — there is no
        // valid customerId to attach one to, and no points were awarded,
        // so nothing needs protecting from a re-run.
        await markProcessed(member.id, job.id);
        logger.warn(MODULE, "Skipped — could not get/create a local customer record (likely no email on file)", {
            jobId: job.id,
            shadowRuleId: shadowRule.id,
            shopifyId: member.shopifyId,
        });
        return "skipped";
    }

    // Reconstructed in the shape currencyMatches() expects — it reads
    // Shopify's `{ amount, currencyCode }` money object, and the snapshot
    // stores those as two columns.
    const amountSpent = { amount: member.amountSpent, currencyCode: member.currencyCode };

    // Idempotency claim FIRST, before any computation. A P2002 means this
    // customer already has an entry under this exact ShadowRule (a
    // crash-resume replaying a member, or an earlier run reusing the
    // rule) — not an error, already handled. See PointsBackfillEntry's
    // @@unique comment in schema.prisma.
    let entry;
    try {
        entry = await dbRetry(
            () =>
                prisma.pointsBackfillEntry.create({
                    data: {
                        jobId: job.id,
                        shadowRuleId: shadowRule.id,
                        customerId: localCustomerId,
                        amountSpent: Number(member.amountSpent) || 0,
                        pointsAwarded: 0,
                        status: "PENDING",
                    },
                }),
            { module: MODULE, jobId: job.id, customerId: localCustomerId }
        );
    } catch (err) {
        if (err?.code === "P2002") {
            await markProcessed(member.id, job.id);
            return "skipped";
        }
        throw err;
    }

    if (shadowRule.rateType === "PER_AMOUNT" && !currencyMatches(shadowRule, amountSpent)) {
        await resolveEntry(entry.id, job.id, {
            status: "SKIPPED",
            reason: `Currency mismatch: customer amountSpent is ${member.currencyCode ?? "unknown"}, rule is ${shadowRule.currencyCode}`,
        });
        await markProcessed(member.id, job.id);
        return "skipped";
    }

    const points = computePoints(shadowRule, member.amountSpent);

    if (points !== member.projectedPoints) {
        logger.warn(MODULE, "Award differs from the previewed figure — the rule changed after the preview was approved", {
            jobId: job.id,
            shadowRuleId: shadowRule.id,
            shopifyId: member.shopifyId,
            previewed: member.projectedPoints,
            awarding: points,
        });
    }

    if (points <= 0) {
        await resolveEntry(entry.id, job.id, {
            status: "SKIPPED",
            reason: "Computed 0 points (no qualifying spend under this rule)",
        });
        await markProcessed(member.id, job.id);
        return "skipped";
    }

    // NEVER pass shadowRule.id as pointsRuleId — that FK only accepts real
    // PointsRule ids, and the two id spaces can collide by coincidence.
    // See createTransaction.js's BACKFILL @example and ShadowRule's own
    // schema comment. The link back lives in metadata and in the Entry
    // row's shadowRuleId column; pointsRuleId is simply never touched here.
    const transaction = await createTransaction(
        {
            customerId: localCustomerId,
            type: "BACKFILL",
            points,
            activity: `Backfilled ${points.toLocaleString()} pts for lifetime spend (${shadowRule.name})`,
            status: "COMPLETED",
            metadata: {
                source: "BACKFILL",
                shadowRuleId: shadowRule.id,
                jobId: job.id,
                snapshotId: member.snapshotId,
                segmentSourced: true,
                amountSpent: member.amountSpent,
                currencyCode: member.currencyCode,
            },
        },
        session
    );

    if (!transaction) {
        // createTransaction() never throws on a business/DB failure — it
        // logs and returns null (see that file's header). This check is not
        // optional: without it a failed award looks identical to a
        // successful one from here on.
        await resolveEntry(entry.id, job.id, {
            status: "FAILED",
            reason: "createTransaction returned null — see server logs for this job cycle",
        });
        // NOT marked processed. A failed award is the one case worth
        // re-attempting on a later run, and the PointsBackfillEntry
        // constraint means a retry that succeeds can't double-award.
        return "failed";
    }

    await resolveEntry(entry.id, job.id, {
        status: "AWARDED",
        pointsAwarded: points,
        transactionId: transaction.id,
    });

    // Set LAST, only once the entry is terminal. A crash between the two
    // re-processes this one member on the next cycle, where the P2002
    // branch above absorbs it.
    await markProcessed(member.id, job.id);

    return "awarded";
}

/**
 * @param {number} entryId
 * @param {number} jobId
 * @param {Object} data
 */
async function resolveEntry(entryId, jobId, data) {
    await dbRetry(() => prisma.pointsBackfillEntry.update({ where: { id: entryId }, data }), {
        module: MODULE,
        jobId,
    });
}

/**
 * @param {number} memberId
 * @param {number} jobId
 */
async function markProcessed(memberId, jobId) {
    await dbRetry(
        () =>
            prisma.backfillAudienceMember.update({
                where: { id: memberId },
                data: { processed: true, processedAt: new Date() },
            }),
        { module: MODULE, jobId }
    );
}

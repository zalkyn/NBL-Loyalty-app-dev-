/**
 * @file jobs/snapshotBuildJob.js
 * @description Builds a BackfillAudienceSnapshot by walking a Shopify
 * customer Segment one page per poller cycle.
 *
 * Same "many small steps, never one big one" principle as every other job
 * in this codebase (see bulkCustomerSyncJob.js's header) — each cycle
 * advances the build by ONE page of segment members and re-queues itself.
 *
 * ── What each page does ──────────────────────────────────────────────────
 *   1. fetch the page                      (1 Shopify call)
 *   2. verify the GID mapping on a sample  (1 Shopify call)
 *   3. cost every member against the rule  (pure, no I/O)
 *   4. insert the rows                     (1 DB call)
 *
 * Step 2 is the one that isn't obvious, and it's the reason this job
 * exists as a separate phase at all rather than being folded into the
 * backfill run. customerSegmentMembers returns ids of the form
 * `gid://shopify/CustomerSegmentMember/<n>`, where <n> is believed — but
 * not contractually documented — to equal the Customer id. Every member
 * this job writes has had that assumption checked against live Customer
 * records first, and a failure aborts the entire snapshot rather than
 * degrading. See controller/backfillAudience/verifyMemberGidMapping.js
 * for why "believed but not documented" is not good enough when the
 * output decides who receives money.
 *
 * The verification runs on EVERY page, not just the first. It costs one
 * small call per page — around eight calls for a typical run — and in
 * exchange it catches a mid-build change rather than trusting a check
 * made minutes and thousands of rows ago. That is a trivially good trade.
 */

import prisma from "../../app/db.server.js";
import { unauthenticated } from "../../app/shopify.server.js";
import { logger } from "../../app/utils/logger.js";
import { dbRetry } from "../../app/utils/retry/dbRetry.js";
import { segmentMembersPage } from "../../app/graphql/query/customerSegmentMembers.js";
import { verifyMemberGidMapping } from "../../app/controller/backfillAudience/verifyMemberGidMapping.js";
import { failSnapshot, finaliseSnapshot } from "../../app/controller/backfillAudience/snapshot.js";
import { normalizeSegmentMemberGid } from "../../app/utils/backfill/normalizeSegmentMemberGid.js";
import { computePoints, currencyMatches } from "../../app/utils/backfill/computePoints.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "snapshotBuildJob";

/** @constant {number} Segment members fetched per poller cycle, per job. */
const PAGE_SIZE = 250;

/** @constant {number} How many shops' snapshot builds to advance per cycle. */
const MAX_JOBS_PER_CYCLE = 3;

/** @constant {number} Stale-lock threshold. Two Shopify calls plus one
 *  bulk insert per cycle — lighter than pointsBackfillJob's per-customer
 *  transactional work, but kept at the same conservative 10 minutes
 *  rather than inventing a second number to reason about. */
const STALE_LOCK_TIMEOUT_MS = 10 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Job Entry
// ─────────────────────────────────────────────────────────────────────────────

export async function runSnapshotBuildJob() {
    await requeueStaleJobs();

    const jobs = await dbRetry(
        () =>
            prisma.job.findMany({
                where: { type: "BACKFILL_SNAPSHOT", status: "PENDING", runAt: { lte: new Date() } },
                orderBy: { runAt: "asc" },
                take: MAX_JOBS_PER_CYCLE,
            }),
        { module: MODULE }
    );

    if (!jobs.length) return;

    for (const job of jobs) {
        try {
            await processOnePage(job);
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
                where: { type: "BACKFILL_SNAPSHOT", status: "PROCESSING", lockedAt: { lte: staleThreshold } },
                data: {
                    status: "PENDING",
                    lockedAt: null,
                    lastError:
                        "Re-queued after stale lock detected (possible server crash) — resumes from its saved segment cursor. Rows already captured are protected by BackfillAudienceMember's @@unique([snapshotId, shopifyId]), so a replayed page inserts nothing twice.",
                },
            }),
        { module: MODULE }
    );

    if (count > 0) {
        logger.warn(MODULE, `Re-queued ${count} stale BACKFILL_SNAPSHOT job(s)`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Terminal Failure Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marks the job FAILED and the snapshot with it — for conditions a retry
 * cannot fix (missing payload, deleted snapshot, deactivated rule, and
 * above all a GID verification failure). Contrast with the catch in
 * processOnePage, which handles TRANSIENT failures that a retry genuinely
 * can fix; those re-queue as PENDING instead.
 *
 * @param {Object} job
 * @param {number|null} snapshotId
 * @param {string} message
 */
async function failBuild(job, snapshotId, message) {
    if (snapshotId) {
        await failSnapshot(snapshotId, message);
    }

    await dbRetry(
        () =>
            prisma.job.update({
                where: { id: job.id },
                data: { status: "FAILED", lockedAt: null, lastError: message, failedAt: new Date() },
            }),
        { module: MODULE, jobId: job.id }
    ).catch((err) => {
        logger.error(MODULE, `Failed to record FAILED status for job #${job.id}`, { error: err?.message });
    });

    logger.error(MODULE, `Job #${job.id} marked FAILED (terminal — will not auto-retry)`, {
        shop: job.shop,
        snapshotId,
        reason: message,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-Job, Per-Page Processor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Advances one BACKFILL_SNAPSHOT job by exactly one page of segment members.
 *
 * @param {{ id: number, shop: string, payload: object }} job
 */
async function processOnePage(job) {
    const { id, shop, payload } = job;
    const snapshotId = payload?.snapshotId;

    // Same conditional-update claim pattern as every other job here — see
    // discountDeleteJob.js for the full rationale.
    const claim = await dbRetry(
        () => prisma.job.updateMany({ where: { id, status: "PENDING" }, data: { status: "PROCESSING", lockedAt: new Date() } }),
        { module: MODULE, jobId: id }
    );

    if (claim.count === 0) return;

    if (!snapshotId) {
        return failBuild(job, null, "Job payload missing snapshotId");
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
        return failBuild(job, null, `Snapshot #${snapshotId} no longer exists`);
    }

    // Re-checked every cycle rather than once at enqueue, so deactivating
    // the rule halts an in-progress build — same escape hatch
    // pointsBackfillJob.js gives an admin for a run in flight.
    if (!snapshot.shadowRule?.isActive) {
        return failBuild(job, snapshotId, `Shadow rule "${snapshot.shadowRule?.name}" was deactivated — halting preview build`);
    }

    // A snapshot that isn't BUILDING has already reached a terminal state
    // (most likely FAILED by a previous cycle's verification check). The
    // job simply stops; it must NOT re-open a snapshot that was closed for
    // a safety reason.
    if (snapshot.status !== "BUILDING") {
        await dbRetry(
            () =>
                prisma.job.update({
                    where: { id },
                    data: { status: "COMPLETED", lockedAt: null, completedAt: new Date() },
                }),
            { module: MODULE, jobId: id }
        );
        logger.info(MODULE, `Job #${id} stopped — snapshot is already ${snapshot.status}`, { shop, snapshotId });
        return;
    }

    try {
        const { admin, session } = await unauthenticated.admin(shop);
        if (!session) throw new Error(`No active session for shop: ${shop}`);

        const page = await segmentMembersPage(admin, {
            segmentId: snapshot.segmentId,
            cursor: snapshot.buildCursor,
            pageSize: PAGE_SIZE,
        });

        if (!page) throw new Error("Failed to fetch segment member page from Shopify");

        // ── The safety gate ──────────────────────────────────────────────
        // Runs BEFORE any row from this page is written. A throw here is
        // an inconclusive check (Shopify call failed), which falls through
        // to the transient catch and retries the same cursor — an
        // unverified page is never written on the assumption it was
        // probably fine.
        const verification = await verifyMemberGidMapping(admin, page.nodes);

        if (!verification.ok) {
            return failBuild(job, snapshotId, verification.reason);
        }

        const rows = page.nodes
            .map((node) => toMemberRow(node, snapshot))
            .filter(Boolean);

        const dropped = page.nodes.length - rows.length;

        if (rows.length > 0) {
            // skipDuplicates makes a replayed page a no-op rather than a
            // constraint violation — the property that lets stale-lock
            // recovery re-run a page without any reconciliation logic.
            await dbRetry(
                () => prisma.backfillAudienceMember.createMany({ data: rows, skipDuplicates: true }),
                { module: MODULE, jobId: id, snapshotId }
            );
        }

        const isLastPage = !page.hasNextPage;

        await dbRetry(
            () =>
                prisma.backfillAudienceSnapshot.update({
                    where: { id: snapshotId },
                    data: {
                        buildCursor: page.endCursor,
                        gidChecked: { increment: verification.checked },
                        reportedTotalCount: page.totalCount,
                    },
                }),
            { module: MODULE, jobId: id, snapshotId }
        );

        if (isLastPage) {
            // Re-read rather than reusing the in-memory copy: gidChecked
            // has been incremented across every cycle of this build, and
            // the value loaded at the top of THIS cycle predates the
            // increment just written.
            const finalState = await dbRetry(
                () =>
                    prisma.backfillAudienceSnapshot.findUnique({
                        where: { id: snapshotId },
                        select: { gidChecked: true },
                    }),
                { module: MODULE, jobId: id, snapshotId }
            );

            // Fail closed. Verification only samples members that have an
            // email address, so a segment where nobody does yields zero
            // checks — and "nothing contradicted the assumption" is not
            // the same as "the assumption was confirmed". Refusing to
            // release an unverified snapshot costs the merchant an error
            // message; releasing one costs them points awarded against
            // ids nothing ever validated.
            if ((finalState?.gidChecked ?? 0) === 0) {
                return failBuild(
                    job,
                    snapshotId,
                    "Could not verify customer identity mapping — no member of this segment has an email address to check against. Add email addresses, or use a segment that includes customers with them."
                );
            }

            const result = await finaliseSnapshot({ snapshotId, reportedTotalCount: page.totalCount });

            await dbRetry(
                () =>
                    prisma.job.update({
                        where: { id },
                        data: { status: "COMPLETED", lockedAt: null, completedAt: new Date() },
                    }),
                { module: MODULE, jobId: id }
            );

            logger.info(MODULE, `Job #${id} finished building snapshot #${snapshotId}`, { shop, ...result });
            return;
        }

        await dbRetry(
            () =>
                prisma.job.update({
                    where: { id },
                    data: {
                        status: "PENDING",
                        lockedAt: null,
                        // Immediately eligible for the next cycle — the
                        // poller's own cadence is already the pacing
                        // mechanism, same as pointsBackfillJob.js.
                        runAt: new Date(),
                    },
                }),
            { module: MODULE, jobId: id }
        );

        logger.info(MODULE, `Job #${id} captured a page of ${page.nodes.length}`, {
            shop,
            snapshotId,
            written: rows.length,
            dropped,
            gidChecked: verification.checked,
        });
    } catch (err) {
        // Transient — re-queue from the SAME cursor, nothing lost. Same
        // brief fixed cooldown as pointsBackfillJob.js's own catch: this
        // job already advances only one small page per cycle, so a
        // backoff ladder would add complexity without adding pacing.
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

        logger.error(MODULE, `Job #${id} page failed — will retry from the same cursor`, {
            shop,
            snapshotId,
            error: err?.message,
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Member Mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Turns one CustomerSegmentMember node into a BackfillAudienceMember row,
 * costing it against the rule as it goes.
 *
 * `skipReason` is computed HERE, at preview time, rather than being
 * discovered during the run. Every reason a customer will end up SKIPPED
 * is knowable from data already in hand, so surfacing it in the CSV turns
 * "2,047 customers" into "1,982 will be awarded, 65 won't, and here's
 * why" — which is the difference between a list a merchant can actually
 * approve and one they can only guess at. The run re-derives all of this
 * independently and writes the real outcome to PointsBackfillEntry; this
 * column is a prediction for the merchant, never an instruction to the job.
 *
 * Returns null for a member whose GID can't be normalised. That can only
 * happen if Shopify changed the id scheme, which
 * verifyMemberGidMapping() has already checked for on this same page — so
 * in practice this is unreachable, and exists so that a member is dropped
 * rather than written with a malformed id if the two ever disagree.
 *
 * @param {Object} node - Raw CustomerSegmentMember node
 * @param {Object} snapshot - Snapshot row, with `shadowRule` included
 * @returns {Object|null}
 */
function toMemberRow(node, snapshot) {
    const shopifyId = normalizeSegmentMemberGid(node?.id);
    if (!shopifyId) {
        logger.warn(MODULE, "Dropped a segment member with an unparseable GID", {
            snapshotId: snapshot.id,
            rawId: node?.id,
        });
        return null;
    }

    const rule = snapshot.shadowRule;
    const email = node?.defaultEmailAddress?.emailAddress ?? null;
    const amountSpent = node?.amountSpent;
    const spent = Number(amountSpent?.amount) || 0;

    let projectedPoints = 0;
    let skipReason = null;

    // Mirrors processOneCustomer()'s order of checks in
    // pointsBackfillJob.js exactly, so the prediction and the outcome
    // can't disagree about which rule bit first.
    if (!email) {
        // getOrCreateCustomer() returns null without an email — store.js
        // has no other key to upsert on.
        skipReason = "No email address on file — cannot be enrolled";
    } else if (rule.rateType === "PER_AMOUNT" && !currencyMatches(rule, amountSpent)) {
        skipReason = `Currency mismatch: spend is in ${amountSpent?.currencyCode ?? "unknown"}, rule is in ${rule.currencyCode}`;
    } else {
        projectedPoints = computePoints(rule, spent);
        if (projectedPoints <= 0) {
            skipReason = "Computed 0 points (no qualifying spend under this rule)";
        }
    }

    return {
        snapshotId: snapshot.id,
        shopifyId,
        email,
        phone: node?.defaultPhoneNumber?.phoneNumber ?? null,
        displayName: node?.displayName ?? null,
        firstName: node?.firstName ?? null,
        lastName: node?.lastName ?? null,
        amountSpent: spent,
        currencyCode: amountSpent?.currencyCode ?? null,
        projectedPoints,
        skipReason,
    };
}

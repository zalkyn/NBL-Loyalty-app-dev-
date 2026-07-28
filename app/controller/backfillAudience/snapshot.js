/**
 * @file controller/backfillAudience/snapshot.js
 * @description Lifecycle of a BackfillAudienceSnapshot — the frozen
 * customer list a POINTS_BACKFILL run is approved against.
 *
 * Enqueue/status split mirrors controller/jobs/pointsBackfill.js and
 * controller/jobs/bulkCustomerSync.js exactly; the actual paging work
 * happens in server/jobs/snapshotBuildJob.js.
 *
 * The flow this supports, end to end:
 *
 *   merchant picks a segment + a rule
 *     -> enqueueSnapshotBuild()          status: BUILDING
 *     -> snapshotBuildJob pages the segment, verifies GIDs, costs each
 *        member against the rule
 *                                        status: READY   (or FAILED)
 *     -> merchant reads the count, the projected total, the CSV
 *     -> enqueuePointsBackfill({ snapshotId })
 *                                        status: CONSUMED
 *
 * Nothing awards points until that last step, and what it awards is
 * exactly the row set the merchant just exported — see
 * BackfillAudienceSnapshot's schema comment for why that equality is the
 * whole point of the design.
 */

import prisma from "../../db.server.js";
import { logger } from "../../utils/logger.js";
import { dbRetry } from "../../utils/retry/dbRetry.js";
import { segment as fetchSegment } from "../../graphql/query/shop/segments.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "controller/backfillAudience/snapshot";

// ─────────────────────────────────────────────────────────────────────────────
// Enqueue
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Starts building a snapshot for one segment + one ShadowRule.
 *
 * Re-validates the segment against Shopify rather than trusting the id
 * the browser sent: the picker's list is rendered by a loader that may be
 * minutes stale, and more fundamentally a segment id arriving as a form
 * value is user input. Fetching it also captures name and query for the
 * denormalised copies — see the schema comment on why those are copies.
 *
 * Only one BUILDING snapshot per (rule, segment) pair at a time. Unlike
 * the guard in enqueuePointsBackfill this is genuinely just
 * anti-double-click: a previous READY or FAILED snapshot for the same
 * pair does not block a new one, because rebuilding is the normal way to
 * refresh a preview after the merchant edits the segment.
 *
 * @param {Object} params
 * @param {string} params.shop
 * @param {string} params.sessionId
 * @param {Object} params.admin - Shopify Admin GraphQL client
 * @param {number} params.shadowRuleId
 * @param {string} params.segmentId - Full GID, e.g. "gid://shopify/Segment/123"
 * @returns {Promise<{ ok: boolean, message: string, snapshotId?: number }>}
 */
export async function enqueueSnapshotBuild({ shop, sessionId, admin, shadowRuleId, segmentId }) {
    try {
        if (!segmentId) {
            return { ok: false, message: "Choose a customer segment first." };
        }

        const shadowRule = await dbRetry(
            () =>
                prisma.shadowRule.findFirst({
                    where: { id: shadowRuleId, sessionId },
                    select: { id: true, name: true, isActive: true },
                }),
            { module: MODULE, shadowRuleId }
        );

        if (!shadowRule) {
            return { ok: false, message: "Shadow rule not found." };
        }

        // Checked here as well as at run time, so a merchant doesn't spend
        // a build only to be told at the final step that the rule was
        // never switched on. The run re-checks anyway (see
        // pointsBackfillJob.js) — this is the earlier, friendlier failure,
        // not a replacement for it.
        if (!shadowRule.isActive) {
            return { ok: false, message: "This shadow rule is inactive — activate it before building a preview." };
        }

        const segmentData = await fetchSegment(admin, segmentId);

        if (!segmentData) {
            return {
                ok: false,
                message: "That segment no longer exists, or isn't accessible. Refresh the page and pick another.",
            };
        }

        const existing = await dbRetry(
            () =>
                prisma.backfillAudienceSnapshot.findFirst({
                    where: { sessionId, shadowRuleId, segmentId, status: "BUILDING" },
                    select: { id: true },
                }),
            { module: MODULE, shadowRuleId }
        );

        if (existing) {
            return { ok: false, message: "A preview for this rule and segment is already being built." };
        }

        const snapshot = await dbRetry(
            () =>
                prisma.backfillAudienceSnapshot.create({
                    data: {
                        segmentId: segmentData.id,
                        segmentName: segmentData.name,
                        segmentQuery: segmentData.query ?? null,
                        status: "BUILDING",
                        shadowRuleId,
                        sessionId,
                        shop,
                    },
                    select: { id: true },
                }),
            { module: MODULE, shadowRuleId }
        );

        await dbRetry(
            () =>
                prisma.job.create({
                    data: {
                        type: "BACKFILL_SNAPSHOT",
                        shop,
                        status: "PENDING",
                        payload: { snapshotId: snapshot.id },
                    },
                }),
            { module: MODULE, snapshotId: snapshot.id }
        );

        logger.info(MODULE, "Snapshot build started", {
            shop,
            snapshotId: snapshot.id,
            shadowRuleId,
            segmentId: segmentData.id,
        });

        return {
            ok: true,
            snapshotId: snapshot.id,
            message: `Building a preview of "${segmentData.name}" — this runs in the background.`,
        };
    } catch (error) {
        logger.error(MODULE, "Failed to start snapshot build", { shop, shadowRuleId, error: error?.message });
        return { ok: false, message: "Failed to start the preview build." };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The most recent snapshot for a rule, plus live build progress.
 *
 * `builtSoFar` is counted from BackfillAudienceMember rather than read
 * off the snapshot row, for the same reason getPointsBackfillStatus()
 * counts PointsBackfillEntry instead of trusting payload.counts: a
 * running tally on the parent row can drift after a crash-resume, while
 * the child rows are always exactly what actually happened. Only queried
 * while BUILDING — once READY, memberCount is final and authoritative.
 *
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {number} params.shadowRuleId
 * @returns {Promise<Object|null>}
 */
export async function getLatestSnapshot({ sessionId, shadowRuleId }) {
    const snapshot = await dbRetry(
        () =>
            prisma.backfillAudienceSnapshot.findFirst({
                where: { sessionId, shadowRuleId },
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    segmentId: true,
                    segmentName: true,
                    segmentQuery: true,
                    status: true,
                    reportedTotalCount: true,
                    memberCount: true,
                    projectedTotalPoints: true,
                    gidChecked: true,
                    lastError: true,
                    createdAt: true,
                    builtAt: true,
                    consumedAt: true,
                },
            }),
        { module: MODULE, shadowRuleId }
    );

    if (!snapshot) return null;

    if (snapshot.status === "BUILDING") {
        const builtSoFar = await dbRetry(
            () => prisma.backfillAudienceMember.count({ where: { snapshotId: snapshot.id } }),
            { module: MODULE, snapshotId: snapshot.id }
        );

        return { ...snapshot, builtSoFar, awardableCount: 0 };
    }

    // How many members will actually receive points, as opposed to how
    // many are in the segment. These are different numbers and the gap
    // between them is often large (customers with no email, or whose
    // spend computes to zero under this rule), so showing only the total
    // would set up a merchant to expect 2,047 awards and get 1,982 with
    // no warning. Counted rather than stored: it's one cheap indexed
    // count on page load, and one less denormalised field that could
    // drift out of step with the rows it describes.
    const awardableCount = await dbRetry(
        () => prisma.backfillAudienceMember.count({ where: { snapshotId: snapshot.id, projectedPoints: { gt: 0 } } }),
        { module: MODULE, snapshotId: snapshot.id }
    );

    return { ...snapshot, awardableCount };
}

/**
 * A page of a snapshot's members, for the on-screen preview table.
 *
 * Ordered by projectedPoints descending so the largest awards — the ones
 * worth scrutinising before approving a run — are on the first page,
 * rather than buried on page 40 of an id-ordered list. Ties break on id
 * to keep pagination stable.
 *
 * @param {Object} params
 * @param {number} params.snapshotId
 * @param {number} [params.page=1]
 * @param {number} [params.pageSize=25]
 * @returns {Promise<{ members: Array, totalCount: number, totalPages: number }>}
 */
export async function getSnapshotMembers({ snapshotId, page = 1, pageSize = 25 }) {
    const where = { snapshotId };

    const [members, totalCount] = await Promise.all([
        dbRetry(
            () =>
                prisma.backfillAudienceMember.findMany({
                    where,
                    orderBy: [{ projectedPoints: "desc" }, { id: "asc" }],
                    skip: (Math.max(1, page) - 1) * pageSize,
                    take: pageSize,
                    select: {
                        id: true,
                        shopifyId: true,
                        displayName: true,
                        email: true,
                        phone: true,
                        amountSpent: true,
                        currencyCode: true,
                        projectedPoints: true,
                        skipReason: true,
                        processed: true,
                    },
                }),
            { module: MODULE, snapshotId }
        ),
        dbRetry(() => prisma.backfillAudienceMember.count({ where }), { module: MODULE, snapshotId }),
    ]);

    return { members, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / pageSize)) };
}

/**
 * Every member of a snapshot, for the pre-run CSV export.
 *
 * Not paginated — a CSV download needs the whole set in one response.
 * Same memory caveat as getBackfilledCustomersForExport() in
 * controller/jobs/pointsBackfill.js, and bounded the same way in
 * practice: a snapshot holds one segment's membership, not the shop's
 * entire customer base, which is the specific improvement this whole
 * feature was built for.
 *
 * Scoped by sessionId as well as snapshotId — the snapshot id arrives in
 * a URL query parameter, so it's user input, and this endpoint returns
 * customer PII. An id belonging to another shop must return nothing
 * rather than being trusted because it happens to exist.
 *
 * @param {Object} params
 * @param {string} params.sessionId
 * @param {number} params.snapshotId
 * @returns {Promise<{ snapshot: Object, members: Array }|null>}
 */
export async function getSnapshotForExport({ sessionId, snapshotId }) {
    const snapshot = await dbRetry(
        () =>
            prisma.backfillAudienceSnapshot.findFirst({
                where: { id: snapshotId, sessionId },
                select: {
                    id: true,
                    segmentName: true,
                    status: true,
                    memberCount: true,
                    projectedTotalPoints: true,
                    builtAt: true,
                    shadowRule: { select: { name: true, currencyCode: true } },
                },
            }),
        { module: MODULE, snapshotId }
    );

    if (!snapshot) return null;

    const members = await dbRetry(
        () =>
            prisma.backfillAudienceMember.findMany({
                where: { snapshotId },
                orderBy: [{ projectedPoints: "desc" }, { id: "asc" }],
                select: {
                    shopifyId: true,
                    displayName: true,
                    email: true,
                    phone: true,
                    amountSpent: true,
                    currencyCode: true,
                    projectedPoints: true,
                    skipReason: true,
                },
            }),
        { module: MODULE, snapshotId }
    );

    return { snapshot, members };
}

/**
 * Is ANY backfill work running for this shop right now, on any rule?
 *
 * The page's own status panels are scoped to whichever rule is selected,
 * which is the right default — but it means someone who starts a build,
 * navigates away, and comes back through the nav menu (no `ruleId` in the
 * URL) lands on a page that looks idle while a job is very much running.
 * This backs a shop-wide banner so that never happens.
 *
 * Reads the Job table rather than snapshot statuses: a job is the thing
 * that's actually running, and this way a POINTS_BACKFILL run started
 * from a snapshot that has since been CONSUMED still shows up.
 *
 * @param {Object} params
 * @param {string} params.shop
 * @returns {Promise<{ snapshotJobs: number, backfillJobs: number, ruleIds: number[] }>}
 */
export async function getActiveBackfillWork({ shop }) {
    const jobs = await dbRetry(
        () =>
            prisma.job.findMany({
                where: {
                    shop,
                    type: { in: ["BACKFILL_SNAPSHOT", "POINTS_BACKFILL"] },
                    status: { in: ["PENDING", "PROCESSING"] },
                },
                select: { type: true, payload: true },
            }),
        { module: MODULE, shop }
    );

    const ruleIds = [];
    let snapshotJobs = 0;
    let backfillJobs = 0;

    for (const job of jobs) {
        if (job.type === "BACKFILL_SNAPSHOT") snapshotJobs += 1;
        else backfillJobs += 1;

        const ruleId = job.payload?.shadowRuleId;
        if (typeof ruleId === "number" && !ruleIds.includes(ruleId)) ruleIds.push(ruleId);
    }

    return { snapshotJobs, backfillJobs, ruleIds };
}

// ─────────────────────────────────────────────────────────────────────────────
// State transitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marks a snapshot FAILED with a reason. Terminal — a FAILED snapshot is
 * never runnable and is never resumed.
 *
 * Used for build errors, and most importantly for GID verification
 * failure, where continuing would mean awarding points against customer
 * ids that can no longer be trusted to identify the right people.
 *
 * @param {number} snapshotId
 * @param {string} reason
 */
export async function failSnapshot(snapshotId, reason) {
    await dbRetry(
        () =>
            prisma.backfillAudienceSnapshot.update({
                where: { id: snapshotId },
                data: { status: "FAILED", lastError: reason, buildCursor: null },
            }),
        { module: MODULE, snapshotId }
    ).catch((error) => {
        logger.error(MODULE, "Failed to record FAILED status for snapshot", {
            snapshotId,
            error: error?.message,
        });
    });

    logger.error(MODULE, "Snapshot marked FAILED", { snapshotId, reason });
}

/**
 * Finalises a completed build: counts and totals are computed from the
 * member rows themselves in one aggregate, not accumulated page by page.
 *
 * This matters more than it looks. A page-by-page running total is wrong
 * the moment any page is retried — the build re-inserts rows that
 * @@unique([snapshotId, shopifyId]) then discards, but a counter that was
 * already incremented has no way to un-count them. Deriving both figures
 * from the rows at the end makes the build fully idempotent: however many
 * times a page was retried, the totals describe exactly what's in the
 * table.
 *
 * A mismatch against Shopify's own reported totalCount is recorded rather
 * than treated as an error — it means the segment's membership shifted
 * while the build was walking it, which is expected behaviour for a live
 * segment and is exactly the kind of thing the merchant should see before
 * approving, not something to hide.
 *
 * @param {Object} params
 * @param {number} params.snapshotId
 * @param {number|null} params.reportedTotalCount
 * @returns {Promise<{ memberCount: number, projectedTotalPoints: number, drifted: boolean }>}
 */
export async function finaliseSnapshot({ snapshotId, reportedTotalCount }) {
    const aggregate = await dbRetry(
        () =>
            prisma.backfillAudienceMember.aggregate({
                where: { snapshotId },
                _count: { _all: true },
                _sum: { projectedPoints: true },
            }),
        { module: MODULE, snapshotId }
    );

    const memberCount = aggregate._count._all ?? 0;
    const projectedTotalPoints = aggregate._sum.projectedPoints ?? 0;
    const drifted = reportedTotalCount != null && reportedTotalCount !== memberCount;

    await dbRetry(
        () =>
            prisma.backfillAudienceSnapshot.update({
                where: { id: snapshotId },
                data: {
                    status: "READY",
                    memberCount,
                    projectedTotalPoints,
                    reportedTotalCount,
                    buildCursor: null,
                    builtAt: new Date(),
                    lastError: drifted
                        ? `Segment reported ${reportedTotalCount} members but ${memberCount} were captured — the segment changed while the preview was being built. Rebuild if you need an exact match.`
                        : null,
                },
            }),
        { module: MODULE, snapshotId }
    );

    logger.info(MODULE, "Snapshot ready", { snapshotId, memberCount, projectedTotalPoints, drifted });
    return { memberCount, projectedTotalPoints, drifted };
}

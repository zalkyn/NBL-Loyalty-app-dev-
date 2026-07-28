/**
 * @file controller/jobs/pointsBackfill.js  (REPLACES the existing file)
 * @description Enqueue + status for POINTS_BACKFILL. Actual work happens
 * in the background — see server/jobs/pointsBackfillJob.js.
 *
 * The single behavioural change from the previous version:
 * enqueuePointsBackfill no longer takes an `audience` object of tags and
 * dates. It takes a snapshotId — a BackfillAudienceSnapshot the merchant
 * has already built, reviewed and exported. Audience matching has moved
 * out of the run entirely (Shopify's segment evaluates it, and
 * snapshotBuildJob freezes the result), so there is nothing left for this
 * function to filter on.
 *
 * getPointsBackfillStatus and the two read helpers below are unchanged.
 */

import prisma from "../../db.server.js";
import { logger } from "../../utils/logger.js";
import { dbRetry } from "../../utils/retry/dbRetry.js";

const MODULE = "controller/jobs/pointsBackfill";

/**
 * Starts a POINTS_BACKFILL run from an approved snapshot.
 *
 * ── Why the snapshot is CONSUMED rather than re-runnable ─────────────────
 * The status flip to CONSUMED is what makes "approved" mean something. A
 * snapshot is the record of a specific list of people a merchant looked
 * at and signed off on; once a run has been started from it, that
 * approval has been spent. Wanting to run again against the same segment
 * is a legitimate thing to want — and the right answer is to build a
 * fresh preview, because the segment's membership has almost certainly
 * moved since, and the merchant should be approving what's true now
 * rather than re-approving a list they last saw in a CSV a week ago.
 *
 * The flip is done as a conditional updateMany on status: "READY", not a
 * read-then-write. Two rapid clicks on Start would otherwise both read
 * READY and both enqueue a job; the conditional update means exactly one
 * of them can win, at the database rather than in application logic.
 * (PointsBackfillEntry's own unique constraint would prevent the actual
 * double-award, but two jobs racing over the same member rows is still
 * a mess worth not creating.)
 *
 * @param {Object} params
 * @param {string} params.shop
 * @param {string} params.sessionId
 * @param {number} params.snapshotId
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function enqueuePointsBackfill({ shop, sessionId, snapshotId }) {
    try {
        const snapshot = await dbRetry(
            () =>
                prisma.backfillAudienceSnapshot.findFirst({
                    where: { id: snapshotId, sessionId },
                    select: {
                        id: true,
                        status: true,
                        memberCount: true,
                        segmentName: true,
                        shadowRuleId: true,
                        shadowRule: { select: { id: true, name: true, isActive: true } },
                    },
                }),
            { module: MODULE, snapshotId }
        );

        if (!snapshot) {
            return { ok: false, message: "Preview not found." };
        }

        if (snapshot.status === "CONSUMED") {
            return { ok: false, message: "This preview has already been used for a run. Build a fresh one to run again." };
        }

        if (snapshot.status !== "READY") {
            return {
                ok: false,
                message:
                    snapshot.status === "BUILDING"
                        ? "This preview is still being built. Wait for it to finish."
                        : "This preview failed to build and can't be run. Build a new one.",
            };
        }

        if (!snapshot.shadowRule?.isActive) {
            return { ok: false, message: "This shadow rule is inactive — activate it before running a backfill." };
        }

        if (snapshot.memberCount === 0) {
            return { ok: false, message: "This preview contains no customers — nothing to run." };
        }

        // Same "query, not a DB unique constraint" reasoning as before: a
        // constraint on a fixed key would block starting a fresh run after
        // a previous one COMPLETED, which must always stay allowed.
        const existing = await dbRetry(
            () =>
                prisma.job.findFirst({
                    where: {
                        shop,
                        type: "POINTS_BACKFILL",
                        status: { in: ["PENDING", "PROCESSING"] },
                        payload: { path: ["shadowRuleId"], equals: snapshot.shadowRuleId },
                    },
                    select: { id: true },
                }),
            { module: MODULE, snapshotId }
        );

        if (existing) {
            return { ok: false, message: `"${snapshot.shadowRule.name}" already has a backfill running.` };
        }

        // Conditional claim — see the header comment. If another request
        // got here first this returns 0 and no job is created.
        const claimed = await dbRetry(
            () =>
                prisma.backfillAudienceSnapshot.updateMany({
                    where: { id: snapshotId, status: "READY" },
                    data: { status: "CONSUMED", consumedAt: new Date() },
                }),
            { module: MODULE, snapshotId }
        );

        if (claimed.count === 0) {
            return { ok: false, message: "This preview was just used by another request. Refresh the page." };
        }

        await dbRetry(
            () =>
                prisma.job.create({
                    data: {
                        type: "POINTS_BACKFILL",
                        shop,
                        status: "PENDING",
                        payload: {
                            snapshotId,
                            shadowRuleId: snapshot.shadowRuleId,
                            counts: { awarded: 0, skipped: 0, failed: 0 },
                        },
                    },
                }),
            { module: MODULE, snapshotId }
        );

        logger.info(MODULE, "Points backfill started", {
            shop,
            snapshotId,
            shadowRuleId: snapshot.shadowRuleId,
            memberCount: snapshot.memberCount,
        });

        return {
            ok: true,
            message: `Backfill started for ${snapshot.memberCount.toLocaleString()} customers from "${snapshot.segmentName}" — this runs in the background.`,
        };
    } catch (error) {
        logger.error(MODULE, "Failed to start points backfill", { shop, snapshotId, error: error?.message });
        return { ok: false, message: "Failed to start backfill." };
    }
}

/**
 * Reports whether a backfill is currently active for a ShadowRule, plus
 * the AUTHORITATIVE progress counts — read live from PointsBackfillEntry
 * (grouped by status), not from the job's own payload.counts.
 *
 * payload.counts is a fast, best-effort running tally the job updates
 * once per batch — after a crash-resume it can under-count `awarded` for
 * customers processed in a batch that crashed before its counts update
 * was persisted. PointsBackfillEntry itself is never wrong: every row
 * reflects exactly what happened to that customer.
 *
 * ── The counts are ALL-TIME, and `run` is not ────────────────────────────
 * The grouped counts are scoped to shadowRuleId, so they cover every run
 * this rule has ever had. That is the right figure for the totals panel,
 * and the wrong one for a progress bar: entry rows are created batch by
 * batch as the job works, so awarded+skipped+failed+pending is not the
 * size of anything — it's just "how many rows exist so far", which sits
 * a hair below 100% for the entire run and would read as almost-finished
 * from the first second onward.
 *
 * `run` is the separate, honestly-scoped answer for the current job:
 * BackfillAudienceMember.processed against the snapshot's memberCount.
 * That flag is the job's OWN definition of progress (see
 * pointsBackfillJob.js's Resumability note) and is set only after a
 * member's entry reaches a terminal status, so the fraction can never
 * claim more work than actually finished.
 *
 * Costs two extra reads, and only while something is running: a
 * single-row snapshot lookup and a count that the existing
 * @@index([snapshotId, processed, id]) satisfies without touching the
 * table. Idle polls are exactly as cheap as before.
 *
 * @param {Object} params
 * @param {number} params.shadowRuleId
 * @returns {Promise<{
 *   activeJob: Object|null,
 *   awarded: number, skipped: number, failed: number, pending: number,
 *   run: { jobId: number, processed: number, total: number, segmentName: string|null }|null
 * }>}
 */
export async function getPointsBackfillStatus({ shadowRuleId }) {
    const [activeJob, grouped] = await Promise.all([
        prisma.job.findFirst({
            where: {
                type: "POINTS_BACKFILL",
                status: { in: ["PENDING", "PROCESSING"] },
                payload: { path: ["shadowRuleId"], equals: shadowRuleId },
            },
            // payload comes along for snapshotId — the only link from a
            // running job back to the list of people it's working through.
            select: { id: true, status: true, payload: true },
        }),
        prisma.pointsBackfillEntry.groupBy({
            by: ["status"],
            where: { shadowRuleId },
            _count: { status: true },
        }),
    ]);

    const counts = { awarded: 0, skipped: 0, failed: 0, pending: 0 };
    for (const row of grouped) {
        const key = row.status.toLowerCase();
        if (key in counts) counts[key] = row._count.status;
    }

    const run = activeJob ? await getRunProgress(activeJob) : null;

    // `payload` is dropped on the way out. It's a job-internal record with
    // a best-effort counts tally inside it, and putting that on the wire
    // next to the authoritative numbers invites someone downstream to read
    // the wrong one.
    const publicJob = activeJob ? { id: activeJob.id, status: activeJob.status } : null;

    return { activeJob: publicJob, ...counts, run };
}

/**
 * Progress for one running job, or null if it can't be established.
 *
 * Returning null rather than a zero-filled object is deliberate: the UI
 * draws no bar without this, and no bar is the correct output for "the
 * denominator is unknown". A bar filling against a made-up total is a
 * guess wearing the costume of a measurement — the same reasoning as the
 * percent guard in SnapshotPreview's BuildingState.
 *
 * Never throws. This runs on every poll of a page whose whole job is to
 * reassure someone that their run is fine; a failed decorative count must
 * not be what takes that page down.
 */
async function getRunProgress(activeJob) {
    try {
        const snapshotId = activeJob.payload?.snapshotId;
        if (!snapshotId) return null;

        const snapshot = await prisma.backfillAudienceSnapshot.findUnique({
            where: { id: snapshotId },
            select: { memberCount: true, segmentName: true },
        });

        if (!snapshot?.memberCount) return null;

        const processed = await prisma.backfillAudienceMember.count({
            where: { snapshotId, processed: true },
        });

        return {
            jobId: activeJob.id,
            // Clamped because the two reads aren't in one transaction: a
            // batch can land between them, and a bar reporting 101% is the
            // kind of detail that makes someone doubt every other number
            // on the page.
            processed: Math.min(processed, snapshot.memberCount),
            total: snapshot.memberCount,
            segmentName: snapshot.segmentName ?? null,
        };
    } catch (error) {
        logger.warn(MODULE, "Couldn't read run progress", { jobId: activeJob?.id, error: error?.message });
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Search + sort for the Backfilled Customers table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Name-or-email match, case-insensitive.
 *
 * `mode: "insensitive"` compiles to ILIKE, which this schema's Postgres
 * supports natively — it is NOT portable to every provider, so it belongs
 * here next to the datasource rather than anywhere a future non-Postgres
 * target might inherit it silently.
 *
 * Returned as a fragment to merge into a `customer` filter rather than as
 * a whole `where`, because getBackfilledCustomersForExport() already
 * constrains `customer` by sessionId and must keep doing so — a search
 * that REPLACED that object instead of extending it would quietly widen
 * an export past its own shop.
 */
function customerSearchFragment(term) {
    if (!term) return null;

    return {
        OR: [
            { name: { contains: term, mode: "insensitive" } },
            { email: { contains: term, mode: "insensitive" } },
        ],
    };
}

/**
 * Sort keys the database will actually act on.
 *
 * Deliberately a lookup table, not a key/direction pair assembled from the
 * request: `orderBy` is a query fragment, and building one out of user
 * input is the same class of mistake as string-concatenating SQL.
 * _data.js has its own copy of these keys for the dropdown; an unknown
 * key here just becomes the default.
 *
 * ── Why every entry has a second, unique term ────────────────────────────
 * A backfill routinely awards every customer in a segment the SAME number
 * of points (a FIXED-rate rule does so by definition), and amountSpent is
 * frequently 0 across the board too. Sorting thousands of rows on a column
 * where they all tie leaves the order genuinely undefined between queries
 * — Postgres is free to return page 2 in a different arrangement than the
 * one page 1 implied. The visible symptom is a paginated list that repeats
 * some customers and silently omits others, which in a table whose whole
 * job is "prove who got points" is worse than being slow. Appending `id`
 * makes every sort a total order, so pagination is stable by construction.
 */
const ENTRY_ORDER_BY = {
    date_desc: [{ createdAt: "desc" }, { id: "desc" }],
    date_asc: [{ createdAt: "asc" }, { id: "asc" }],
    points_desc: [{ pointsAwarded: "desc" }, { id: "asc" }],
    points_asc: [{ pointsAwarded: "asc" }, { id: "asc" }],
    spent_desc: [{ amountSpent: "desc" }, { id: "asc" }],
    spent_asc: [{ amountSpent: "asc" }, { id: "asc" }],
    // Customers with no name sort to one end (Postgres puts NULLs last
    // ascending, first descending). The table falls back to showing their
    // email, so they stay identifiable rather than looking like blanks.
    name_asc: [{ customer: { name: "asc" } }, { id: "asc" }],
    name_desc: [{ customer: { name: "desc" } }, { id: "asc" }],
};

const DEFAULT_ORDER_BY = ENTRY_ORDER_BY.date_desc;

/**
 * Own-property lookup, not `ENTRY_ORDER_BY[sort] ?? DEFAULT`.
 *
 * The `??` version reads inherited properties too, so ?sort=constructor
 * resolves to Object itself and ?sort=__proto__ to Object.prototype —
 * both truthy, so neither falls back, and a function or a bare prototype
 * gets handed to Prisma as an orderBy. Not exploitable into data access
 * here, but it turns a hand-edited URL into a 500 on a page whose job is
 * reassuring a merchant that a points run went correctly.
 */
function orderByFor(sort) {
    return typeof sort === "string" && Object.hasOwn(ENTRY_ORDER_BY, sort)
        ? ENTRY_ORDER_BY[sort]
        : DEFAULT_ORDER_BY;
}

const ENTRY_SELECT = {
    id: true,
    createdAt: true,
    pointsAwarded: true,
    amountSpent: true,
    customer: { select: { id: true, name: true, email: true } },
};

/**
 * Paginated list of AWARDED entries for one ShadowRule, with customer
 * details — the "who was actually in this batch" view.
 *
 * Search and sort are applied in the database, not in the component. With
 * thousands of entries behind a 25-row page, filtering client-side would
 * only ever search the page already on screen — which looks like it works
 * right up until the customer someone is hunting for is on page 40.
 *
 * @param {Object} params
 * @param {number} params.shadowRuleId
 * @param {number} [params.page=1]
 * @param {number} [params.pageSize=25]
 * @param {string} [params.q] - name/email search, already trimmed
 * @param {string} [params.sort] - key from ENTRY_ORDER_BY
 * @returns {Promise<{ entries: Array, totalCount: number, unfilteredCount: number, totalPages: number, page: number }>}
 */
export async function getPointsBackfillEntries({ shadowRuleId, page = 1, pageSize = 25, q = "", sort } = {}) {
    // Clamped here as well as normalised in the loader. `take` is a cost
    // ceiling, and a page size arriving as 0 (empty forever), a negative
    // (Prisma throws) or 50000 (one query returns the whole table) are all
    // reachable from a hand-edited URL if this trusts its caller.
    const size = Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 250 ? pageSize : 25;

    const baseWhere = { shadowRuleId, status: "AWARDED" };

    const term = typeof q === "string" ? q.trim() : "";
    const searchFragment = customerSearchFragment(term);
    const where = searchFragment ? { ...baseWhere, customer: searchFragment } : baseWhere;

    const orderBy = orderByFor(sort);
    const requestedPage = Math.max(1, page);

    const [entriesFirstTry, totalCount, unfilteredCountRaw] = await Promise.all([
        prisma.pointsBackfillEntry.findMany({
            where,
            orderBy,
            skip: (requestedPage - 1) * size,
            take: size,
            select: ENTRY_SELECT,
        }),
        prisma.pointsBackfillEntry.count({ where }),
        // Only worth a second COUNT when a search is narrowing things —
        // without one the two numbers are the same query.
        searchFragment ? prisma.pointsBackfillEntry.count({ where: baseWhere }) : null,
    ]);

    const unfilteredCount = searchFragment ? unfilteredCountRaw : totalCount;
    const totalPages = Math.max(1, Math.ceil(totalCount / size));

    // ── Stale page number ────────────────────────────────────────────────
    // Someone on page 12 who then searches for one specific customer has a
    // page number that no longer exists, and the honest result of that
    // query is zero rows — an empty table that reads as "no matches" when
    // there was in fact a match, just not that far in. The client resets
    // the page when the query changes, so this only catches URLs that
    // arrive already stale (a bookmark, a back button, a shared link).
    //
    // Corrective read rather than counting up front on every call: this
    // path is rare, and making it cheap would cost an extra round trip on
    // the poll path, which is not.
    let entries = entriesFirstTry;
    let effectivePage = requestedPage;

    if (entries.length === 0 && requestedPage > totalPages && totalCount > 0) {
        effectivePage = totalPages;
        entries = await prisma.pointsBackfillEntry.findMany({
            where,
            orderBy,
            skip: (effectivePage - 1) * size,
            take: size,
            select: ENTRY_SELECT,
        });
    }

    return { entries, totalCount, unfilteredCount, totalPages, page: effectivePage };
}

/**
 * Every AWARDED backfill entry for this shop — for the POST-RUN CSV
 * export. Distinct from the PRE-RUN preview export, which reads snapshot
 * members instead (see controller/backfillAudience/snapshot.js's
 * getSnapshotForExport). Both exist on purpose: one is what was approved,
 * the other is what happened, and comparing them is the whole audit.
 *
 * UNCHANGED from the previous version.
 */
export async function getBackfilledCustomersForExport({ sessionId, shadowRuleId, q = "", sort } = {}) {
    const term = typeof q === "string" ? q.trim() : "";
    const searchFragment = customerSearchFragment(term);

    return prisma.pointsBackfillEntry.findMany({
        where: {
            status: "AWARDED",
            // sessionId is the shop boundary and is NOT optional — the
            // search is spread INTO this object, never over it. Getting
            // that backwards would turn a search box into a cross-shop
            // data leak.
            customer: { sessionId, ...(searchFragment ?? {}) },
            ...(shadowRuleId ? { shadowRuleId } : {}),
        },
        // Same ordering the table is showing, so the file a merchant opens
        // is in the arrangement they were looking at when they clicked.
        orderBy: orderByFor(sort),
        select: {
            createdAt: true,
            pointsAwarded: true,
            amountSpent: true,
            customer: { select: { name: true, email: true } },
            shadowRule: { select: { name: true, currencyCode: true } },
        },
    });
}
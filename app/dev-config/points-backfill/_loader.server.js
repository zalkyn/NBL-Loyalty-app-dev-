/**
 * @file dev-config/points-backfill/_loader.server.js
 * @description Loader for the Points Backfill trigger/monitor page.
 *
 * ── Why Shopify calls are fetched conditionally ──────────────────────────
 * This page polls itself (see _hooks.js) every few seconds while a
 * snapshot is building or a run is active, and every poll re-runs this
 * loader. Any Shopify call made here unconditionally is therefore made
 * once per poll for the entire duration of a build — dozens of identical
 * requests returning identical data, against the app's rate-limit budget,
 * for figures nobody is looking at because the UI is showing build
 * progress instead.
 *
 * Both Shopify calls this loader can make are gated on that:
 *
 *   segments()          the picker's list      skipped while polling
 *   segmentMemberCount()the live count         skipped while polling
 *
 * The count guard was already here; the segment list guard was NOT, so
 * the "stops calling Shopify entirely" claim this file used to make was
 * only ever half true. It is true now.
 *
 * Skipping the list means this loader returns no segments during a poll,
 * which would empty the picker mid-build — so it says so with
 * `segmentsStale` and _hooks.js renders its last known list instead. The
 * selection is echoed back unvalidated in that case, which is safe
 * because nothing is done with it: every mutating path re-fetches the
 * segment from Shopify before acting on it (see enqueueSnapshotBuild).
 *
 * ── Why activeWork is fetched before the others ──────────────────────────
 * It is the input to that decision, so it can't sit in the same
 * Promise.all as the calls it's meant to gate. One extra sequential local
 * DB read, in exchange for not calling Shopify on every poll.
 */

import { authenticate } from "shopify-server";
import prisma from "db-server";
import { getPointsBackfillStatus, getPointsBackfillEntries } from "@controller/jobs/pointsBackfill";
import { getLatestSnapshot, getSnapshotMembers, getActiveBackfillWork } from "@controller/backfillAudience/snapshot";
import segments, { segment as fetchSegment } from "@graphql/query/shop/segments.js";
import { segmentMemberCount } from "@graphql/query/customerSegmentMembers.js";
import { normalizeEntrySort, normalizeEntryQuery, normalizePageSize } from "./_data";

export const loader = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const url = new URL(request.url);

    const ruleIdParam = url.searchParams.get("ruleId");
    const selectedRuleId = ruleIdParam ? parseInt(ruleIdParam) : null;
    const selectedSegmentId = url.searchParams.get("segmentId") || null;
    const entriesPage = Math.max(1, parseInt(url.searchParams.get("entriesPage") || "1") || 1);
    const membersPage = Math.max(1, parseInt(url.searchParams.get("membersPage") || "1") || 1);

    // Both normalised before they go anywhere near a query: the sort key
    // is whitelisted down to a known value and the search term is trimmed
    // and length-capped, so a hand-edited URL can't reach Prisma with
    // anything the rest of the page hasn't already agreed on.
    const entriesQuery = normalizeEntryQuery(url.searchParams.get("entriesQ"));
    const entriesSort = normalizeEntrySort(url.searchParams.get("entriesSort"));
    const entriesPerPage = normalizePageSize(url.searchParams.get("entriesPerPage"));
    const membersPerPage = normalizePageSize(url.searchParams.get("membersPerPage"));

    // Shop-wide, not scoped to the selected rule — see
    // getActiveBackfillWork()'s own comment on why. Fetched first because
    // every Shopify call below is gated on it.
    const activeWork = await getActiveBackfillWork({ shop: session.shop });
    const isPolling = activeWork.snapshotJobs > 0 || activeWork.backfillJobs > 0;

    const [rules, segmentsResult] = await Promise.all([
        prisma.shadowRule.findMany({
            where: { sessionId: session.id },
            orderBy: { createdAt: "desc" },
            select: {
                id: true, name: true, isActive: true,
                rateType: true, fixedPoints: true, perAmount: true, pointsPerUnit: true, currencyCode: true,
            },
        }),
        isPolling ? null : segments(admin),
    ]);

    const segmentsStale = segmentsResult === null;
    const availableSegments = segmentsResult?.segments ?? [];
    const segmentsError = segmentsResult?.error ?? null;

    // Only ever look up state for a rule that's actually this shop's own —
    // same ownership check as every mutating action in this feature, just
    // read-side here.
    const selectedRule = selectedRuleId ? rules.find((r) => r.id === selectedRuleId) ?? null : null;

    // Likewise: a segmentId from the URL is user input. Resolving it
    // against the list this shop's own access token returned means an id
    // belonging to somewhere else simply doesn't select anything, rather
    // than being handed to Shopify to find out.
    let validSegmentId = null;

    if (segmentsStale) {
        // Nothing to resolve against this pass. Echoed back so the
        // client's cached list can keep the picker populated; see the
        // header for why passing it through unchecked is safe.
        validSegmentId = selectedSegmentId;
    } else {
        validSegmentId = availableSegments.some((s) => s.id === selectedSegmentId) ? selectedSegmentId : null;

        // ── One exception, for a segment that was only just created ─────
        // segments() is a paginated connection, and a brand-new segment
        // isn't guaranteed to appear in it on the very next read. Without
        // this, creating a segment and auto-selecting it produces a page
        // where the selection silently vanishes and the merchant is left
        // staring at "Choose a segment…" wondering whether the create
        // worked at all.
        //
        // The direct lookup is still an authorisation check, not a bypass:
        // `admin` is scoped to one shop's token, so a segment belonging to
        // anywhere else resolves to null here exactly as it would have
        // been rejected by the list check above.
        if (!validSegmentId && selectedSegmentId) {
            const direct = await fetchSegment(admin, selectedSegmentId);
            if (direct) {
                availableSegments.unshift(direct);
                validSegmentId = direct.id;
            }
        }
    }

    const [status, entriesResult, snapshot] = selectedRule
        ? await Promise.all([
              getPointsBackfillStatus({ shadowRuleId: selectedRule.id }),
              getPointsBackfillEntries({
                  shadowRuleId: selectedRule.id,
                  page: entriesPage,
                  pageSize: entriesPerPage,
                  q: entriesQuery,
                  sort: entriesSort,
              }),
              getLatestSnapshot({ sessionId: session.id, shadowRuleId: selectedRule.id }),
          ])
        : [null, null, null];

    // Members are only worth fetching for a snapshot the merchant can act
    // on. A BUILDING one is still changing under the query, and a FAILED
    // one must not be reviewable as though it were usable.
    const membersResult =
        snapshot?.status === "READY"
            ? await getSnapshotMembers({ snapshotId: snapshot.id, page: membersPage, pageSize: membersPerPage })
            : null;

    // ── The one Shopify call left, and only when it counts ───────────────
    const shouldFetchCount = !!validSegmentId && !isPolling && !segmentsStale;

    let liveCount = null;
    let countError = null;

    if (shouldFetchCount) {
        try {
            liveCount = await segmentMemberCount(admin, validSegmentId);
        } catch (error) {
            // Surfaced rather than swallowed to 0 — a failed count and an
            // empty segment look identical as a number, and only one of
            // them means "go ahead".
            countError = error?.message ?? "Shopify didn't respond.";
        }
    }

    return {
        rules,
        selectedRuleId: selectedRule?.id ?? null,
        segments: availableSegments,
        segmentsError,
        segmentsStale,
        selectedSegmentId: validSegmentId,
        liveCount,
        countError,
        activeWork,
        snapshot,
        members: membersResult?.members ?? [],
        membersPage,
        membersPerPage,
        membersTotalCount: membersResult?.totalCount ?? 0,
        membersTotalPages: membersResult?.totalPages ?? 1,
        status,
        entries: entriesResult?.entries ?? [],
        entriesTotalCount: entriesResult?.totalCount ?? 0,
        // How many entries exist ignoring the search, so the table can
        // tell "this rule has never awarded anyone" apart from "nobody
        // matches what you typed". They need different screens: the first
        // has nothing to show, the second must keep the search box on
        // screen or there's no way left to undo the search.
        entriesUnfilteredCount: entriesResult?.unfilteredCount ?? 0,
        entriesTotalPages: entriesResult?.totalPages ?? 1,
        // Echoed back from the query rather than from the URL — a page
        // number past the end of a freshly narrowed result set is
        // corrected there, and the pager has to agree with the rows.
        entriesPage: entriesResult?.page ?? entriesPage,
        entriesQuery,
        entriesSort,
        entriesPerPage,
    };
};

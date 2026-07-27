/**
 * @file dev-config/points-backfill/_hooks.js
 * @description All client-side state + handlers for the Points Backfill
 * page: rule and segment selection (both via URL search params), the two
 * submit flows (build preview, start run), CSV exports, the shared
 * confirmation modal, and live polling.
 *
 * Polling covers TWO background phases, not one. Previously only a run
 * was worth watching; a snapshot build is equally worth watching, because
 * the merchant is sitting on this page waiting for a preview before they
 * can do anything at all.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useFetcher, useSearchParams, useRevalidator, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useCsvDownload } from "@app/hooks/useCsvDownload";
import { CREATE_SEGMENT_MODAL_ID } from "./components/CreateSegmentModal";
import { DEFAULT_ENTRY_SORT, ENTRY_SEARCH_MAX_LENGTH, DEFAULT_PAGE_SIZE } from "./_data";

/** Steady-state gap between polls, measured from the END of the previous one. */
const POLL_INTERVAL_MS = 3000;

/**
 * A build or run that hasn't finished in this long has almost certainly
 * stopped rather than slowed down. Polling forever past that point is a
 * request every few seconds, for hours, from a tab someone left open —
 * so it stops and offers a Resume instead of quietly burning capacity.
 */
const POLL_MAX_DURATION_MS = 30 * 60 * 1000;

/**
 * Ceiling on how long a post-submit lock may wait for the loader to
 * confirm what it just did. Generous — several polls' worth — because
 * hitting it at all means something upstream is wrong, and the only job
 * of the ceiling is to make sure that "wrong" never becomes "this button
 * is disabled until you reload the page".
 */
const SETTLE_TIMEOUT_MS = 15000;

// Shared id for the single confirmation modal — every trigger button on
// this page references it via commandFor to open it declaratively.
export const MODAL_ID = "points-backfill-confirm-modal";

export function usePointsBackfillPage(loaderData) {
    const {
        rules, selectedRuleId,
        segments, segmentsError, segmentsStale, selectedSegmentId, liveCount, countError, activeWork,
        snapshot, members, membersPage, membersPerPage, membersTotalCount, membersTotalPages,
        status, entries, entriesTotalCount, entriesUnfilteredCount, entriesTotalPages, entriesPage,
        entriesQuery, entriesSort, entriesPerPage,
    } = loaderData ?? {};

    const [, setSearchParams] = useSearchParams();
    const shopify = useAppBridge();
    const navigation = useNavigation();
    // Only the imperative half. `state` is deliberately NOT read here —
    // polling drives this same revalidator every few seconds, so anything
    // derived from it oscillates for the whole duration of a build. See
    // the settle-lock block below, and `isRefreshing` further down, both
    // of which exist because of that.
    const { revalidate } = useRevalidator();

    const buildFetcher = useFetcher();
    const startFetcher = useFetcher();
    const createSegmentFetcher = useFetcher();

    const isBuilding = buildFetcher.state !== "idle";
    const isStarting = startFetcher.state !== "idle";
    const isCreatingSegment = createSegmentFetcher.state !== "idle";

    // ── Post-submit settle locks ──────────────────────────────────────────
    /**
     * A submit isn't finished when its fetcher goes idle — it's finished
     * when the revalidated loader has reported the new state. In the gap
     * between the two, `snapshot.status` is still whatever it was before,
     * so every "is this already running?" check says no and the button
     * re-enables for a moment.
     *
     * The server rejects the second submit either way (see
     * enqueueSnapshotBuild's BUILDING guard and enqueuePointsBackfill's
     * CONSUMED guard), so nothing is double-awarded — but the merchant
     * gets an error toast for a mistake the UI invited. Holding a lock
     * until the loader catches up closes the window instead.
     *
     * This was `revalidatorState !== "idle"` — ANY revalidation, from
     * anywhere. Polling revalidates every three seconds, so for the whole
     * length of a build the lock switched on and off with each poll and
     * every control wired to it visibly blinked. Exactly the trap already
     * documented on `isRefreshing` below; this is the other half of it.
     * Scoping each lock to the submit that opened it is what actually
     * fixes that, rather than hiding it at the call sites.
     *
     * Cleared on server truth, not on the revalidate() promise. React
     * Router aborts an in-flight revalidation when a new one starts, so a
     * poll landing at the wrong moment resolves the submit's promise
     * without its data ever having been committed — which would reopen
     * precisely the window this exists to close, intermittently and only
     * under load.
     */
    const [buildSettling, setBuildSettling] = useState(false);
    const [startSettling, setStartSettling] = useState(false);

    /**
     * The snapshot row the build submit created (the action returns its
     * id). The lock lifts once the loader reports THAT row — not merely
     * some snapshot, and not a particular status: a small segment can be
     * captured, finished and READY before the first poll returns, so
     * waiting for BUILDING specifically would sometimes wait forever.
     */
    const awaitedSnapshotIdRef = useRef(null);

    useEffect(() => {
        if (!buildSettling) return;
        const awaited = awaitedSnapshotIdRef.current;
        if (awaited != null && snapshot?.id === awaited) setBuildSettling(false);
    }, [buildSettling, snapshot?.id]);

    // Starting a run CONSUMES the snapshot and enqueues a job — either one
    // showing up in loader data means the server has taken ownership and
    // the ordinary hasActiveRun guard can take over from here.
    useEffect(() => {
        if (!startSettling) return;
        if (snapshot?.status === "CONSUMED" || status?.activeJob) setStartSettling(false);
    }, [startSettling, snapshot?.status, status?.activeJob]);

    /**
     * Ceiling on both locks.
     *
     * If the server never reports what the two effects above wait for —
     * the loader threw, a deploy landed mid-submit, the response came
     * back malformed — the lock would hold forever and its button would
     * sit disabled with no way out but a page reload. A permanently dead
     * primary action is a far worse failure than a brief unlocked window,
     * so the lock always lets go eventually. By then the loader has run
     * several times over and the status-based guards (isSnapshotBuilding,
     * hasActiveRun) are carrying the weight anyway.
     */
    useEffect(() => {
        if (!buildSettling) return undefined;
        const timer = setTimeout(() => setBuildSettling(false), SETTLE_TIMEOUT_MS);
        return () => clearTimeout(timer);
    }, [buildSettling]);

    useEffect(() => {
        if (!startSettling) return undefined;
        const timer = setTimeout(() => setStartSettling(false), SETTLE_TIMEOUT_MS);
        return () => clearTimeout(timer);
    }, [startSettling]);

    const buildLocked = isBuilding || buildSettling;
    const startLocked = isStarting || startSettling;

    /** Loader work triggered by navigation — changing rule, segment, or page. */
    const isNavigating = navigation.state !== "idle";

    const selectedRule = rules?.find((r) => r.id === selectedRuleId) ?? null;

    // ── Segment list cache ────────────────────────────────────────────────
    // The loader stops fetching the segment list while a job is running
    // (see _loader.server.js). Rendering its empty response as-is would
    // blank the picker mid-build and make the merchant think their
    // selection was lost, so the last real list is kept and reused.
    const segmentsCacheRef = useRef([]);
    if (!segmentsStale && Array.isArray(segments)) {
        segmentsCacheRef.current = segments;
    }
    const effectiveSegments = segmentsStale ? segmentsCacheRef.current : (segments ?? []);

    // ── URL-driven selection ──────────────────────────────────────────────
    // Functional form rather than reading a `searchParams` snapshot from
    // the closure. Several of these callbacks are held by child components
    // across renders, so a captured snapshot can be a navigation or two
    // behind by the time it's invoked — writing it back would resurrect
    // whatever the URL used to contain. Reading `prev` at write time can't
    // go stale, which is also why the getter half of useSearchParams isn't
    // destructured at all.
    const setParams = useCallback((mutate) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            mutate(next);
            return next;
        });
    }, [setSearchParams]);

    const selectRule = useCallback((ruleId) => {
        setParams((next) => {
            if (ruleId) next.set("ruleId", String(ruleId));
            else next.delete("ruleId");
            // Everything POSITIONAL below the rule is scoped to it: a
            // segment chosen for one rule, a page number into another
            // rule's (possibly much shorter) lists, a search term whose
            // "12 of 5,842 match" was counted against a different rule
            // entirely. Clear those rather than carry them across.
            //
            // Sort order and page size deliberately survive: they're how
            // this person prefers to read a table, not a position inside
            // one, and resetting a preference on every rule change is its
            // own small annoyance.
            next.delete("segmentId");
            next.delete("entriesPage");
            next.delete("membersPage");
            next.delete("entriesQ");
        });
    }, [setParams]);

    const selectSegment = useCallback((segmentId) => {
        setParams((next) => {
            if (segmentId) next.set("segmentId", segmentId);
            else next.delete("segmentId");
        });
    }, [setParams]);

    // ── Adapters for the shared Pagination component ──────────────────────
    // It calls these exactly as it would a useState setter: sometimes a
    // plain number (page buttons, « and »), sometimes an updater function
    // (‹ and ›, which are written as `p => p - 1`). Here the "state" is a
    // URL search param, so the function form has to be resolved against
    // the current page before it can be written.
    //
    // Taking only a number would look fine — the numbered buttons and the
    // first/last jumps would all work — while ‹ and › silently reset to
    // page 1, because `aFunction > 1` is false and the branch below
    // deletes the param. queue-jobs/route.jsx solves it the same way; see
    // its own comment on the adapter.
    const currentEntriesPage = entriesPage ?? 1;
    const currentEntriesPerPage = entriesPerPage ?? DEFAULT_PAGE_SIZE;

    const setEntriesPage = useCallback((valueOrFn) => {
        const page = typeof valueOrFn === "function" ? valueOrFn(currentEntriesPage) : valueOrFn;
        setParams((next) => {
            if (page > 1) next.set("entriesPage", String(page));
            else next.delete("entriesPage");
        });
    }, [setParams, currentEntriesPage]);

    const setEntriesPerPage = useCallback((valueOrFn) => {
        const perPage = typeof valueOrFn === "function" ? valueOrFn(currentEntriesPerPage) : valueOrFn;
        setParams((next) => {
            if (perPage && perPage !== DEFAULT_PAGE_SIZE) next.set("entriesPerPage", String(perPage));
            else next.delete("entriesPerPage");
            // Page 7 of 234 is a different set of people than page 7 of 59.
            next.delete("entriesPage");
        });
    }, [setParams, currentEntriesPerPage]);

    const currentMembersPage = membersPage ?? 1;
    const currentMembersPerPage = membersPerPage ?? DEFAULT_PAGE_SIZE;

    const setMembersPage = useCallback((valueOrFn) => {
        const page = typeof valueOrFn === "function" ? valueOrFn(currentMembersPage) : valueOrFn;
        setParams((next) => {
            if (page > 1) next.set("membersPage", String(page));
            else next.delete("membersPage");
        });
    }, [setParams, currentMembersPage]);

    const setMembersPerPage = useCallback((valueOrFn) => {
        const perPage = typeof valueOrFn === "function" ? valueOrFn(currentMembersPerPage) : valueOrFn;
        setParams((next) => {
            if (perPage && perPage !== DEFAULT_PAGE_SIZE) next.set("membersPerPage", String(perPage));
            else next.delete("membersPerPage");
            next.delete("membersPage");
        });
    }, [setParams, currentMembersPerPage]);

    // ── Backfilled Customers: search + sort ───────────────────────────────
    // Both live in the URL alongside the page number, so a reload, a back
    // button or a link pasted to a colleague all land on the same view.
    // The input keeps its own copy so typing stays instant regardless of
    // how long the query behind it takes.
    // Typing only updates the local box; nothing is searched until the
    // Search button is pressed or Enter is hit. Same arrangement as
    // layout/customers/index/_hooks.js, which this deliberately mirrors —
    // two search boxes in one admin that commit on different triggers is
    // the kind of inconsistency people feel without being able to name.
    //
    // The searched term therefore lives in exactly one place at a time:
    // `entriesQueryInput` is what's typed, `entriesQuery` is what the
    // server actually filtered on, and the results can never claim to
    // match something that was never submitted.
    const [entriesQueryInput, setEntriesQueryInput] = useState(entriesQuery ?? "");

    // Resync when the query changes from anywhere other than this input —
    // selecting a different rule clears it, and the box has to follow.
    useEffect(() => {
        setEntriesQueryInput((current) => (current === (entriesQuery ?? "") ? current : entriesQuery ?? ""));
    }, [entriesQuery]);

    const commitEntriesQuery = useCallback((value) => {
        setParams((next) => {
            const term = value.trim().slice(0, ENTRY_SEARCH_MAX_LENGTH);
            if (term) next.set("entriesQ", term);
            else next.delete("entriesQ");
            // A page number from the old, wider result set means nothing
            // against the new one.
            next.delete("entriesPage");
        });
    }, [setParams]);

    const setEntriesQuery = useCallback((value) => {
        setEntriesQueryInput(value);
    }, []);

    const submitEntriesQuery = useCallback(() => {
        commitEntriesQuery(entriesQueryInput);
    }, [commitEntriesQuery, entriesQueryInput]);

    const onEntriesQueryKeyDown = useCallback((e) => {
        if (e.key === "Enter") submitEntriesQuery();
    }, [submitEntriesQuery]);

    const clearEntriesQuery = useCallback(() => {
        setEntriesQueryInput("");
        commitEntriesQuery("");
    }, [commitEntriesQuery]);

    const setEntriesSort = useCallback((value) => {
        setParams((next) => {
            if (value && value !== DEFAULT_ENTRY_SORT) next.set("entriesSort", value);
            else next.delete("entriesSort");
            next.delete("entriesPage");
        });
    }, [setParams]);

    // ── CSV exports ───────────────────────────────────────────────────────
    // Fetched and saved as a Blob rather than opened as a link — see
    // useCsvDownload's header for why an <a href> can't authenticate from
    // inside the embedded admin.
    const { downloadCsv, downloadingKey } = useCsvDownload();

    const downloadAllCsv = useCallback(() => {
        downloadCsv("all", "/app/points-backfill/export", "backfilled-customers-all.csv");
    }, [downloadCsv]);

    // Exports what the table is currently showing, not what it would show
    // unfiltered. Clicking "export" while looking at 12 search results and
    // receiving 5,842 rows is the kind of surprise that gets a file opened,
    // scrolled, and mistrusted — so the button's label changes with the
    // filter and the query goes along with the request.
    const downloadRuleCsv = useCallback(() => {
        if (!selectedRule) return;

        const params = new URLSearchParams({ ruleId: String(selectedRule.id) });
        if (entriesQuery) params.set("q", entriesQuery);
        if (entriesSort && entriesSort !== DEFAULT_ENTRY_SORT) params.set("sort", entriesSort);

        downloadCsv(
            "rule",
            `/app/points-backfill/export?${params.toString()}`,
            `backfilled-customers-rule-${selectedRule.id}.csv`
        );
    }, [downloadCsv, selectedRule, entriesQuery, entriesSort]);

    const downloadPreviewCsv = useCallback(() => {
        if (!snapshot) return;
        downloadCsv(
            "preview",
            `/app/points-backfill/preview-export?snapshotId=${snapshot.id}`,
            `backfill-preview-${snapshot.id}.csv`
        );
    }, [downloadCsv, snapshot]);

    // ── Manual refresh ────────────────────────────────────────────────────
    // The segment list is loader data, so it only changes on navigation.
    // Someone who creates a segment in another Shopify admin tab and
    // switches back needs a way to pull it in that isn't "reload the whole
    // page" — especially since nothing on screen would tell them that's
    // what's required.
    //
    // Tracked with its own flag rather than off revalidatorState: polling
    // uses the same revalidator, so reading its state directly made the
    // Refresh button flash "Refreshing…" every few seconds throughout an
    // unrelated build.
    const [isRefreshing, setIsRefreshing] = useState(false);

    const refreshSegments = useCallback(() => {
        setIsRefreshing(true);
        Promise.resolve(revalidate()).finally(() => setIsRefreshing(false));
    }, [revalidate]);

    // ── Create a segment from tags ────────────────────────────────────────
    // A convenience path for the single most common backfill audience
    // ("anyone with one of these tags"), so a merchant doesn't have to
    // leave for Shopify admin and come back. Anything more involved is
    // still better built in Shopify's own editor and picked above.
    const [segmentName, setSegmentName] = useState("");
    const [segmentTags, setSegmentTags] = useState([""]);

    const addSegmentTagRow = useCallback((value = "") => {
        setSegmentTags((prev) => [...prev, value]);
    }, []);

    const updateSegmentTagRow = useCallback((index, value) => {
        setSegmentTags((prev) => prev.map((t, i) => (i === index ? value : t)));
    }, []);

    const removeSegmentTagRow = useCallback((index) => {
        setSegmentTags((prev) => (prev.length === 1 ? [""] : prev.filter((_, i) => i !== index)));
    }, []);

    const cleanSegmentTags = segmentTags.map((t) => t.trim()).filter(Boolean);

    const requestCreateSegment = useCallback(() => {
        if (isCreatingSegment || !segmentName.trim() || cleanSegmentTags.length === 0) return;

        createSegmentFetcher.submit(
            {
                intent: "createSegment",
                segmentName: segmentName.trim(),
                segmentTags: JSON.stringify(cleanSegmentTags),
            },
            { method: "post" }
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCreatingSegment, segmentName, segmentTags, createSegmentFetcher]);

    // ── Build a preview ───────────────────────────────────────────────────
    // No confirmation modal. Building a preview writes nothing a merchant
    // can't discard and awards nothing — putting a "are you sure" in front
    // of a read-only action trains people to click through the one that
    // actually matters.
    const requestBuild = useCallback(() => {
        if (buildLocked || !selectedRule || !selectedSegmentId) return;

        buildFetcher.submit(
            {
                intent: "buildPreview",
                shadowRuleId: String(selectedRule.id),
                segmentId: selectedSegmentId,
            },
            { method: "post" }
        );
    }, [buildLocked, selectedRule, selectedSegmentId, buildFetcher]);

    // ── Shared confirm-modal flow ─────────────────────────────────────────
    const [pendingAction, setPendingAction] = useState(null);

    const confirmPendingAction = useCallback(() => {
        if (pendingAction) pendingAction.run();
        setPendingAction(null);
    }, [pendingAction]);

    /**
     * The confirmation for starting a run.
     *
     * The old version of this had to warn in the abstract — it described
     * what the filters would probably match, because nothing knew yet.
     * Now the exact numbers are already on screen, so the modal restates
     * them and spends its words on the one thing that isn't visible: that
     * this can't be cleanly undone.
     */
    const requestStart = useCallback(() => {
        if (startLocked || !snapshot || snapshot.status !== "READY" || status?.activeJob) return;

        setPendingAction({
            confirmHeading: `Award points to ${snapshot.awardableCount.toLocaleString()} customers?`,
            confirmText:
                `This awards ${snapshot.projectedTotalPoints.toLocaleString()} points in total to the ` +
                `${snapshot.awardableCount.toLocaleString()} customers in this preview, using the rule ` +
                `"${selectedRule?.name}". ` +
                `Points land in real customer balances and there's no undo — reversing one means adjusting that ` +
                `customer's balance by hand, one at a time. ` +
                `Download the CSV first if you haven't checked the list yet.`,
            run: () =>
                startFetcher.submit(
                    { intent: "startBackfill", snapshotId: String(snapshot.id) },
                    { method: "post" }
                ),
        });
    }, [startLocked, snapshot, status, selectedRule, startFetcher]);

    // ── Toasts on submit results ──────────────────────────────────────────
    useEffect(() => {
        if (!createSegmentFetcher.data?.message) return;
        shopify.toast.show(createSegmentFetcher.data.message, { isError: !createSegmentFetcher.data.ok });

        if (createSegmentFetcher.data.ok && createSegmentFetcher.data.createdSegmentId) {
            setSegmentName("");
            setSegmentTags([""]);

            // Close the modal by hand. Its primary button deliberately has
            // no command="--hide", so a rejected segment leaves the form
            // (and the input that needs fixing) on screen — which means
            // success has to close it explicitly.
            document.getElementById(CREATE_SEGMENT_MODAL_ID)?.hide?.();

            // Select the new segment straight away — nobody should have to
            // hunt in a dropdown for something they just made. This writes
            // to the URL, and the loader re-runs on that navigation and
            // picks up the refreshed segment list with it.
            selectSegment(createSegmentFetcher.data.createdSegmentId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [createSegmentFetcher.data, shopify]);

    useEffect(() => {
        if (!buildFetcher.data?.message) return;
        shopify.toast.show(buildFetcher.data.message, { isError: !buildFetcher.data.ok });

        if (buildFetcher.data.ok) {
            // Record what to wait for BEFORE asking for the data that
            // will satisfy it — a fast loader can come back inside the
            // same tick, and a lock whose target was set afterwards would
            // never see its own arrival.
            awaitedSnapshotIdRef.current = buildFetcher.data.snapshotId ?? null;
            setBuildSettling(true);
            revalidate();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [buildFetcher.data, shopify]);

    useEffect(() => {
        if (!startFetcher.data?.message) return;
        shopify.toast.show(startFetcher.data.message, { isError: !startFetcher.data.ok });

        if (startFetcher.data.ok) {
            setStartSettling(true);
            revalidate();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startFetcher.data, shopify]);

    // ── Polling ───────────────────────────────────────────────────────────
    const isRunning = ["PENDING", "PROCESSING"].includes(status?.activeJob?.status);
    const isSnapshotBuilding = snapshot?.status === "BUILDING";
    const shouldPoll = isRunning || isSnapshotBuilding;

    const [pollExpired, setPollExpired] = useState(false);
    const pollStartedAtRef = useRef(null);

    // Kept in a ref so the polling effect doesn't tear down and rebuild
    // its timer every time the revalidator identity changes.
    const revalidateRef = useRef(revalidate);
    useEffect(() => { revalidateRef.current = revalidate; }, [revalidate]);

    useEffect(() => {
        if (!shouldPoll || pollExpired) {
            pollStartedAtRef.current = null;
            return undefined;
        }

        if (pollStartedAtRef.current == null) {
            pollStartedAtRef.current = Date.now();
        }

        let cancelled = false;
        let timer = null;
        // Guards against two tick chains running at once. Without it, a
        // visibilitychange landing while a revalidation is still in flight
        // starts a second chain — the pending .finally schedules its own
        // timer, the new tick schedules another, and the poll rate quietly
        // doubles for the rest of the build. Which is precisely the
        // overlapping-request problem the self-scheduling design exists to
        // prevent, reintroduced through the back door.
        let inFlight = false;

        /**
         * Self-scheduling rather than setInterval, and deliberately so.
         * setInterval fires on a fixed clock regardless of whether the
         * previous revalidation has come back — on a slow response that
         * stacks overlapping loader requests, each one making the server
         * slower and making the next overlap more likely. Scheduling the
         * next poll only after the current one settles makes the interval
         * a floor instead of a promise, and the load self-limiting.
         */
        const tick = () => {
            if (cancelled || inFlight) return;

            if (Date.now() - pollStartedAtRef.current > POLL_MAX_DURATION_MS) {
                setPollExpired(true);
                return;
            }

            // A background tab is nobody's live view. Keep the timer alive
            // so it resumes instantly, but don't spend a request on it.
            if (typeof document !== "undefined" && document.hidden) {
                timer = setTimeout(tick, POLL_INTERVAL_MS);
                return;
            }

            inFlight = true;
            Promise.resolve(revalidateRef.current()).finally(() => {
                inFlight = false;
                if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
            });
        };

        timer = setTimeout(tick, POLL_INTERVAL_MS);

        // Coming back to the tab should show current data immediately,
        // not up to one interval later.
        const onVisibilityChange = () => {
            if (cancelled || document.hidden) return;
            clearTimeout(timer);
            tick();
        };

        document.addEventListener("visibilitychange", onVisibilityChange);

        return () => {
            cancelled = true;
            clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };
    }, [shouldPoll, pollExpired]);

    const resumePolling = useCallback(() => {
        pollStartedAtRef.current = Date.now();
        setPollExpired(false);
        revalidate();
    }, [revalidate]);

    // ── Toast when a build finishes ───────────────────────────────────────
    // Tracked by snapshot id as well as status, so rebuilding after a
    // failure announces the new result rather than staying quiet because
    // the status happened to land on the same value twice.
    const prevBuild = useRef({ id: snapshot?.id, status: snapshot?.status });

    useEffect(() => {
        const prev = prevBuild.current;
        const isSameSnapshot = prev.id === snapshot?.id;

        if (isSameSnapshot && prev.status === "BUILDING" && snapshot?.status === "READY") {
            shopify.toast.show(
                `Preview ready — ${snapshot.awardableCount.toLocaleString()} of ${snapshot.memberCount.toLocaleString()} customers will earn points.`
            );
        }

        if (isSameSnapshot && prev.status === "BUILDING" && snapshot?.status === "FAILED") {
            shopify.toast.show("Preview build stopped — see the reason on the page.", { isError: true });
        }

        prevBuild.current = { id: snapshot?.id, status: snapshot?.status };
    }, [snapshot, shopify]);

    // ── Toast when a run finishes ─────────────────────────────────────────
    const prevWasRunning = useRef(isRunning);

    useEffect(() => {
        if (prevWasRunning.current && !isRunning && status) {
            shopify.toast.show(
                status.failed > 0
                    ? `Backfill finished — ${status.awarded.toLocaleString()} awarded, ${status.failed.toLocaleString()} failed (see server logs).`
                    : `Backfill finished — ${status.awarded.toLocaleString()} customers awarded points.`
            );
        }
        prevWasRunning.current = isRunning;
    }, [isRunning, status, shopify]);

    return {
        rules, selectedRule, selectRule,
        segments: effectiveSegments,
        segmentsError: segmentsError ?? null,
        selectedSegmentId, selectSegment, liveCount, countError,
        refreshSegments, isRefreshing,
        activeWork: activeWork ?? { snapshotJobs: 0, backfillJobs: 0, ruleIds: [] },
        segmentName, setSegmentName,
        segmentTags, addSegmentTagRow, updateSegmentTagRow, removeSegmentTagRow,
        cleanSegmentTags, isCreatingSegment, requestCreateSegment,
        snapshot,
        members: members ?? [],
        membersPage: currentMembersPage,
        membersPerPage: currentMembersPerPage,
        membersTotalCount: membersTotalCount ?? 0,
        membersTotalPages: membersTotalPages ?? 1,
        setMembersPage,
        setMembersPerPage,
        status, isRunning,
        isBuilding, isStarting, buildLocked, startLocked, isNavigating,
        pollExpired, resumePolling,
        entries: entries ?? [],
        entriesTotalCount: entriesTotalCount ?? 0,
        entriesUnfilteredCount: entriesUnfilteredCount ?? 0,
        entriesTotalPages: entriesTotalPages ?? 1,
        entriesPage: currentEntriesPage,
        entriesPerPage: currentEntriesPerPage,
        setEntriesPage,
        setEntriesPerPage,
        entriesQuery: entriesQuery ?? "",
        entriesQueryInput,
        setEntriesQuery,
        submitEntriesQuery,
        onEntriesQueryKeyDown,
        clearEntriesQuery,
        entriesSort: entriesSort ?? DEFAULT_ENTRY_SORT,
        setEntriesSort,
        pendingAction, setPendingAction, confirmPendingAction,
        requestBuild, requestStart,
        downloadAllCsv, downloadRuleCsv, downloadPreviewCsv, downloadingKey,
    };
}
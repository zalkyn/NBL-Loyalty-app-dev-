import { useState, useEffect, useCallback, useRef } from "react";
import { useSubmit, useNavigation, useNavigate, useRevalidator, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

const POLL_INTERVAL_MS = 3000; // gap between polls, measured from the END of the previous one

/**
 * A sync that hasn't finished in this long has almost certainly stopped
 * rather than slowed down. Polling past that point is a request every
 * three seconds, for hours, from a tab someone left open.
 */
const POLL_MAX_DURATION_MS = 60 * 60 * 1000;

export function useCustomersPage(loaderData, actionData) {
    const submit      = useSubmit();
    const nav         = useNavigation();
    const navigate    = useNavigate();
    const shopify     = useAppBridge();
    const { revalidate } = useRevalidator();

    const {
        customers = [], totalCount = 0,
        page, pageSize, search, sortBy,
        error,
        syncJobId,
        syncJobStatus,
        syncProgress,
        localCustomerCount,
    } = loaderData ?? {};

    // Sync is running if loader says PENDING/PROCESSING, OR we just submitted
    const isSubmittingSync = nav.state === "submitting" && nav.formMethod === "POST";
    const isSyncRunning    = isSubmittingSync || ["PENDING", "PROCESSING"].includes(syncJobStatus);

    // ── Confirmation modal ────────────────────────────────────────────────────
    // The count is fetched when the modal opens rather than carried in
    // loader data — see handleCustomerCount in _action.server.js. Its own
    // fetcher so it doesn't collide with the sync submit, and so opening
    // the modal never puts the page into a navigation state.
    const countFetcher = useFetcher();
    const isCounting = countFetcher.state !== "idle";

    const openSyncModal = useCallback(() => {
        if (isSyncRunning) return;
        countFetcher.submit({ submitType: "customer-count" }, { method: "POST" });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isSyncRunning, countFetcher]);

    // ── Polling ───────────────────────────────────────────────────────────────
    const [pollExpired, setPollExpired] = useState(false);
    const pollStartedAtRef = useRef(null);

    // Kept in a ref so the effect doesn't tear down and rebuild its timer
    // every time the revalidator identity changes.
    const revalidateRef = useRef(revalidate);
    useEffect(() => { revalidateRef.current = revalidate; }, [revalidate]);

    useEffect(() => {
        if (!isSyncRunning || isSubmittingSync || pollExpired) {
            pollStartedAtRef.current = null;
            return undefined;
        }

        if (pollStartedAtRef.current == null) pollStartedAtRef.current = Date.now();

        let cancelled = false;
        let timer = null;
        let inFlight = false;

        /**
         * Self-scheduling rather than setInterval, which is what this used
         * to be. setInterval fires on a fixed clock whether or not the
         * previous revalidation has come back — on a slow response that
         * stacks overlapping loader requests, each one making the server
         * slower and the next overlap more likely. Scheduling the next
         * poll only after the current one settles makes the interval a
         * floor instead of a promise, and the load self-limiting.
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
    }, [isSyncRunning, isSubmittingSync, pollExpired]);

    const resumePolling = useCallback(() => {
        pollStartedAtRef.current = Date.now();
        setPollExpired(false);
        revalidate();
    }, [revalidate]);

    // ── Toast on sync complete ────────────────────────────────────────────────
    const prevSyncStatus = useRef(syncJobStatus);
    const lastProgressRef = useRef(syncProgress);

    // Held separately because the completing loader response clears
    // syncJobStatus (the job is no longer PENDING/PROCESSING, so the query
    // that found it returns nothing) — and with it the progress block. The
    // toast fires on that same response, so without a copy of the last
    // figures it can only say "done" and not what was done.
    useEffect(() => {
        if (syncProgress) lastProgressRef.current = syncProgress;
    }, [syncProgress]);

    useEffect(() => {
        const wasRunning = ["PENDING", "PROCESSING"].includes(prevSyncStatus.current);
        const isNowDone  = syncJobStatus === "COMPLETED" || syncJobStatus === null;

        if (wasRunning && isNowDone && prevSyncStatus.current !== null) {
            const last = lastProgressRef.current;
            shopify.toast.show(
                last?.processed
                    ? last.failed > 0
                        ? `Synced ${last.success.toLocaleString()} customers — ${last.failed.toLocaleString()} failed (see server logs).`
                        : `Synced ${last.success.toLocaleString()} customers.`
                    : "Customers synced successfully."
            );
        }

        if (syncJobStatus === "FAILED") {
            shopify.toast.show("Sync failed. Please try again.", { isError: true });
        }

        prevSyncStatus.current = syncJobStatus;
    }, [syncJobStatus, shopify]);

    // ── Toast on action data ──────────────────────────────────────────────────
    useEffect(() => {
        if (!actionData?.message) return;
        // "Sync started" is silent — the banner and button already show it
        if (actionData.submitType === "sync-customers") return;
        shopify.toast.show(actionData.message, { isError: actionData.isError ?? false });
    }, [actionData, shopify]);

    // ── Navigation ────────────────────────────────────────────────────────────
    const [navigatingTo, setNavigatingTo] = useState(null);
    useEffect(() => { if (nav.state === "idle") setNavigatingTo(null); }, [nav.state]);

    const isLoading = nav.state === "loading"
        && nav.formMethod !== "POST"
        && navigatingTo === null
        && nav.location?.pathname === window.location.pathname;

    // ── Search — manual, not auto-search ─────────────────────────────────────
    // Typing only updates localSearch (the input's own displayed value) —
    // the URL/loader only updates when the customer explicitly submits
    // (Search button click or Enter key), via handleSearchSubmit below.
    const [localSearch, setLocalSearch] = useState(search);
    useEffect(() => { setLocalSearch(search); }, [search]);

    // ── URL updater ───────────────────────────────────────────────────────────
    const updateURL = useCallback((params) => {
        const next = new URLSearchParams({
            search:   params.search   ?? search,
            sortBy:   params.sortBy   ?? sortBy,
            page:     String(params.page     ?? 1),
            pageSize: String(params.pageSize ?? pageSize),
        });
        submit(next, { method: "GET", replace: true });
    }, [submit, search, sortBy, pageSize]);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleSearch = useCallback((e) => {
        setLocalSearch(e.target.value);
    }, []);

    // Fires the actual search — Search button click, or Enter key in the
    // field (see handleSearchKeyDown). Always resets to page 1, same as the
    // old debounced version did.
    const handleSearchSubmit = useCallback(() => {
        updateURL({ search: localSearch, page: 1 });
    }, [updateURL, localSearch]);

    const handleSearchKeyDown = useCallback((e) => {
        if (e.key === "Enter") handleSearchSubmit();
    }, [handleSearchSubmit]);

    const handleSortChange = useCallback((e) => updateURL({ sortBy: e.target.value, page: 1 }), [updateURL]);

    // Pagination calls these like useState setters — a plain number from
    // the numbered buttons and the first/last jumps, but an updater
    // function from ‹ and › (`p => Math.max(1, p - 1)`). Taking only the
    // number meant updateURL received the function itself, stringified it
    // into ?page=, and parseInt turned that into NaN — so the two
    // step-by-one arrows were the only controls on the page that jumped
    // back to page 1 instead of moving one page. Resolving the function
    // against the current value first is the same adapter
    // dev-config/queue-jobs/route.jsx uses.
    const handlePageChange = useCallback(
        (valueOrFn) => updateURL({ page: typeof valueOrFn === "function" ? valueOrFn(page) : valueOrFn }),
        [updateURL, page]
    );

    const handlePageSizeChange = useCallback(
        (valueOrFn) => updateURL({
            pageSize: typeof valueOrFn === "function" ? valueOrFn(pageSize) : valueOrFn,
            page: 1,
        }),
        [updateURL, pageSize]
    );

    const handleSync = useCallback(() => {
        // Guarded here as well as in the action. The modal's confirm button
        // is reachable if a sync starts in another tab while this one has
        // it open, and the server-side guard answers that with a toast for
        // a mistake this page invited.
        if (isSyncRunning) return;
        submit({ submitType: "sync-customers" }, { method: "POST" });
    }, [submit, isSyncRunning]);

    const handleDetails = useCallback((customerId) => {
        setNavigatingTo(customerId);
        navigate(`/app/customers/${customerId}`);
    }, [navigate]);

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    return {
        customers, totalCount, totalPages,
        page, pageSize, search, sortBy,
        localSearch, loaderError: error,
        isSyncRunning, isLoading, navigatingTo,
        syncJobId, syncJobStatus, syncProgress,
        localCustomerCount: localCustomerCount ?? 0,
        shopifyCustomerCount: countFetcher.data?.shopifyCustomerCount ?? null,
        shopifyCountPrecision: countFetcher.data?.shopifyCountPrecision ?? null,
        isCounting, openSyncModal,
        pollExpired, resumePolling,
        handleSearch, handleSearchSubmit, handleSearchKeyDown, handleSortChange,
        handlePageChange, handlePageSizeChange,
        handleSync, handleDetails,
    };
}
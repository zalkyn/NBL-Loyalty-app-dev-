/**
 * @file jobs/route.jsx
 *
 * Admin page for viewing and manually handling background jobs (the Job
 * table used by orderPaidJob.js, orderReversalJob.js, customerSyncJob.js).
 * Every status has single, bulk (selected), and group-wise (all-of-type)
 * operations — see _action.server.js for the shared transition() helper
 * and BULK_ACTIONS_BY_STATUS below for which action(s) apply to the
 * currently filtered status.
 *
 * Every action (single/bulk/group) goes through one shared confirmation
 * modal before actually submitting — nothing here fires on a single
 * accidental click.
 *
 *   _loader.server.js  -> prisma queries (filtered list, full set)
 *   _action.server.js  -> handleCancel / handleRetry / handleForceReset / handleDelete
 *   components/JobsTable.jsx -> table markup + per-row single actions
 *
 * Bulk/group actions are scoped to whatever `status` filter is active,
 * since bulk-selecting across mixed statuses would be ambiguous. When
 * "All statuses" is selected, bulk/group actions are hidden.
 *
 * Related background jobs (see server/jobManager/jobConfig.js):
 *   job_cleanup     — deletes old COMPLETED rows (jobCleanupJob.js)
 *   job_auto_retry  — auto-revives FAILED jobs with transient errors (jobAutoRetryJob.js)
 */

import { useState, useMemo } from "react";
import { useLoaderData, useSearchParams, useFetcher } from "react-router";
import { authenticate } from "shopify-server";

import Pagination from "@app/components/pagination/Pagination";

import { loadJobsData, DEFAULT_PAGE_SIZE } from "./_loader.server";
import {
    handleCancel,
    handleRetry,
    handleForceReset,
    handleDelete,
    handleSaveDiscountDeleteSettings,
} from "./_action.server";
import { JobsTable } from "./components/JobsTable";

const STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"];

// Shared id for the single confirmation modal — every trigger button
// (row/bulk/group) references this via commandFor to open it declaratively.
const MODAL_ID = "jobs-confirm-modal";

// Which bulk/group action(s) are offered for each status filter, and the
// confirmation copy shown in the shared modal for each.
const BULK_ACTIONS_BY_STATUS = {
    PENDING: [{ intent: "cancel", label: "Cancel", tone: "critical", verb: "cancelled" }],
    PROCESSING: [{ intent: "forceReset", label: "Force reset", verb: "reset to PENDING" }],
    FAILED: [
        { intent: "retry", label: "Retry", verb: "re-queued as PENDING" },
        { intent: "cancel", label: "Cancel", tone: "critical", verb: "cancelled" },
    ],
    CANCELLED: [{ intent: "retry", label: "Requeue", verb: "re-queued as PENDING" }],
    COMPLETED: [{ intent: "delete", label: "Delete", tone: "critical", verb: "permanently deleted" }],
};

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);

    const url = new URL(request.url);
    // "ALL" is an explicit sentinel for "no filter" — deliberately not an
    // empty string. An empty-string option value round-tripping through
    // URLSearchParams + the <s-select> web component was unreliable
    // (selecting "All statuses"/"All types" sometimes silently failed to
    // update the list) — a distinct non-empty value sidesteps that
    // entirely and is what both the URL and the loader now use uniformly.
    const status = url.searchParams.get("status") || "ALL";
    const type = url.searchParams.get("type") || "ALL";
    const page = Number(url.searchParams.get("page")) || 1;
    const perPage = Number(url.searchParams.get("perPage")) || DEFAULT_PAGE_SIZE;

    const data = await loadJobsData({
        shop: session.shop,
        status: status === "ALL" ? undefined : status,
        type: type === "ALL" ? undefined : type,
        page,
        perPage,
    });
    return { ...data, status, type };
};

// ─── Action — thin dispatcher; per-intent logic lives in _action.server.js ────

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent");

    switch (intent) {
        case "cancel": return handleCancel({ formData, session });
        case "retry": return handleRetry({ formData, session });
        case "forceReset": return handleForceReset({ formData, session });
        case "delete": return handleDelete({ formData, session });
        case "saveDiscountDeleteSettings": return handleSaveDiscountDeleteSettings({ formData, session });
        default: return { ok: false, message: "Unknown intent." };
    }
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function JobsPage() {
    const { jobs, total, page, perPage, types, status, type, discountDeleteSettings } = useLoaderData();
    const [searchParams, setSearchParams] = useSearchParams();
    const fetcher = useFetcher();
    const settingsFetcher = useFetcher();

    const [onRewardCancel, setOnRewardCancel] = useState(discountDeleteSettings.onRewardCancel);
    const [onRewardUsed, setOnRewardUsed] = useState(discountDeleteSettings.onRewardUsed);

    function handleSaveSettings() {
        settingsFetcher.submit(
            { intent: "saveDiscountDeleteSettings", onRewardCancel: String(onRewardCancel), onRewardUsed: String(onRewardUsed) },
            { method: "post" }
        );
    }

    const [selectedIds, setSelectedIds] = useState([]);
    const [pendingAction, setPendingAction] = useState(null);

    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const startIndex = (page - 1) * perPage;

    const bulkActions = BULK_ACTIONS_BY_STATUS[status] || [];

    const selectableIdsOnPage = useMemo(
        () => (bulkActions.length ? jobs.map((j) => j.id) : []),
        [jobs, bulkActions.length]
    );
    const allPageSelected = selectableIdsOnPage.length > 0 &&
        selectableIdsOnPage.every((id) => selectedIds.includes(id));

    // IMPORTANT: always .set() (never .delete()) so an explicitly-chosen
    // empty value (e.g. "All statuses") stays distinguishable in the URL
    // from "no filter specified yet" — see the loader's `.has()` check.
    function updateParam(key, value) {
        const next = new URLSearchParams(searchParams);
        next.set(key, value);
        next.set("page", "1"); // reset to page 1 on filter change
        setSearchParams(next);
        setSelectedIds([]);
    }

    // Adapter for the shared Pagination component, which calls these the
    // same way it would a plain useState setter (direct value OR updater
    // function) — here they update the URL (server-side page) instead.
    function setCurrentPage(valueOrFn) {
        const newPage = typeof valueOrFn === "function" ? valueOrFn(page) : valueOrFn;
        const next = new URLSearchParams(searchParams);
        next.set("page", String(newPage));
        setSearchParams(next);
    }

    function setPerPage(valueOrFn) {
        const newPerPage = typeof valueOrFn === "function" ? valueOrFn(perPage) : valueOrFn;
        const next = new URLSearchParams(searchParams);
        next.set("perPage", String(newPerPage));
        next.set("page", "1"); // reset to page 1 when page size changes
        setSearchParams(next);
    }

    function toggleSelect(id) {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        );
    }

    function toggleSelectAllPage() {
        setSelectedIds((prev) =>
            allPageSelected
                ? prev.filter((id) => !selectableIdsOnPage.includes(id))
                : [...new Set([...prev, ...selectableIdsOnPage])]
        );
    }

    // ── Shared confirm-modal flow ──────────────────────────────────────────
    // The modal's OPEN action is handled declaratively — every trigger
    // button carries commandFor={MODAL_ID} command="--show" directly (see
    // JobsTable's RowActions and the bulk/group buttons below), which is
    // the browser's own native Invoker Commands mechanism (no ref/JS
    // needed to open it, matching the pattern most Polaris examples use).
    // requestAction() only needs to update the *content* — heading/text —
    // which flows through as normal reactive props/children.
    function requestAction(payload) {
        setPendingAction(payload);
    }

    function confirmPendingAction() {
        if (pendingAction) {
            const { confirmHeading, confirmText, ...formPayload } = pendingAction;
            fetcher.submit(formPayload, { method: "post" });
        }
        setPendingAction(null);
        setSelectedIds([]);
        // Closing is handled declaratively too — the Confirm button also
        // carries commandFor={MODAL_ID} command="--hide".
    }

    function requestBulkAction({ intent, verb }) {
        requestAction({
            intent,
            mode: "many",
            jobIds: selectedIds.join(","),
            fromStatus: status,
            confirmHeading: `${intent === "delete" ? "Delete" : "Update"} ${selectedIds.length} job(s)?`,
            confirmText: `${selectedIds.length} selected job(s) will be ${verb}.`,
        });
    }

    function requestGroupAction({ intent, verb }) {
        requestAction({
            intent,
            mode: "group",
            type,
            fromStatus: status,
            confirmHeading: `${intent === "delete" ? "Delete" : "Update"} all ${status} "${type}" jobs?`,
            confirmText: `Every ${status} job of type "${type}" will be ${verb}. The exact count is checked at the time this runs.`,
        });
    }

    return (
        <s-page heading="Background Jobs">
            <s-section heading="Discount Code Cleanup">
                <s-paragraph tone="subdued">
                    When on, a background job (DISCOUNT_DELETE, listed below once
                    any run) deletes the Shopify discount code for a reward in the
                    matching situation. Off by default for both — a discount code
                    left behind is just clutter in Shopify admin's discount list,
                    not a functional problem, so this is opt-in.
                </s-paragraph>
                <s-box paddingBlockStart="base">
                    <s-stack direction="block" gap="extra-small">
                        <s-checkbox
                            label="Delete when a redeemed reward is cancelled"
                            checked={onRewardCancel}
                            onChange={() => setOnRewardCancel((prev) => !prev)}
                        ></s-checkbox>
                        <s-checkbox
                            label="Delete once a voucher is used at checkout"
                            checked={onRewardUsed}
                            onChange={() => setOnRewardUsed((prev) => !prev)}
                        ></s-checkbox>
                    </s-stack>
                </s-box>
                <s-box paddingBlockStart="base">
                    <s-button
                        variant="secondary"
                        loading={settingsFetcher.state !== "idle" ? true : undefined}
                        onClick={handleSaveSettings}
                    >
                        Save
                    </s-button>
                </s-box>
                {settingsFetcher.data?.message && (
                    <s-paragraph tone={settingsFetcher.data.ok ? "success" : "critical"}>
                        {settingsFetcher.data.message}
                    </s-paragraph>
                )}
            </s-section>

            <s-section heading="Filters">
                <s-stack direction="inline" gap="base">
                    <s-select
                        label="Status"
                        value={status}
                        onChange={(e) => updateParam("status", e.currentTarget.value)}
                    >
                        <s-option value="ALL" selected={status === "ALL"}>All statuses</s-option>
                        {STATUSES.map((s) => (
                            <s-option key={s} value={s} selected={status === s}>{s}</s-option>
                        ))}
                    </s-select>
                    <s-select
                        label="Type"
                        value={type}
                        onChange={(e) => updateParam("type", e.currentTarget.value)}
                    >
                        <s-option value="ALL" selected={type === "ALL"}>All types</s-option>
                        {types.map((t) => (
                            <s-option key={t} value={t} selected={type === t}>{t}</s-option>
                        ))}
                    </s-select>
                </s-stack>

                {status === "ALL" && (
                    <s-paragraph tone="subdued">
                        Bulk and group actions are only available when filtered to a
                        specific status — pick one above to select rows or act on a
                        whole type at once.
                    </s-paragraph>
                )}

                {fetcher.data?.message && (
                    <s-paragraph tone={fetcher.data.ok ? "success" : "critical"}>
                        {fetcher.data.message}
                    </s-paragraph>
                )}
            </s-section>

            <s-section heading={`${total} job(s)`}>
                {bulkActions.length > 0 && (
                    <s-stack direction="inline" gap="base">
                        {bulkActions.map((a) => (
                            <s-button
                                key={`bulk-${a.intent}`}
                                variant="secondary"
                                tone={a.tone}
                                disabled={selectedIds.length === 0}
                                commandFor={MODAL_ID}
                                command="--show"
                                onClick={() => requestBulkAction(a)}
                            >
                                {a.label} selected ({selectedIds.length})
                            </s-button>
                        ))}

                        {type !== "ALL" && bulkActions.map((a) => (
                            <s-button
                                key={`group-${a.intent}`}
                                variant="secondary"
                                tone={a.tone}
                                commandFor={MODAL_ID}
                                command="--show"
                                onClick={() => requestGroupAction(a)}
                            >
                                {a.label} all {status} "{type}" jobs
                            </s-button>
                        ))}
                    </s-stack>
                )}

                <JobsTable
                    jobs={jobs}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    onToggleSelectAllPage={toggleSelectAllPage}
                    allPageSelected={allPageSelected}
                    onRequestAction={requestAction}
                />

                <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    totalItems={total}
                    perPage={perPage}
                    startIndex={startIndex}
                    setCurrentPage={setCurrentPage}
                    setPerPage={setPerPage}
                    label="jobs"
                />
            </s-section>

            {/* ── Shared confirmation modal — every trigger button above opens
                   this declaratively via commandFor={MODAL_ID} command="--show".
                   No ref/JS needed to open or close — matches the documented
                   Polaris pattern directly, avoiding any custom imperative
                   show/hide logic. ── */}
            <s-modal
                id={MODAL_ID}
                heading={pendingAction?.confirmHeading || "Confirm action"}
                accessibilityLabel={pendingAction?.confirmHeading || "Confirm action"}
            >
                <s-text>{pendingAction?.confirmText}</s-text>
                <s-button
                    slot="primary-action"
                    variant="primary"
                    commandFor={MODAL_ID}
                    command="--hide"
                    onClick={confirmPendingAction}
                >
                    Confirm
                </s-button>
                <s-button
                    slot="secondary-actions"
                    variant="secondary"
                    commandFor={MODAL_ID}
                    command="--hide"
                    onClick={() => setPendingAction(null)}
                >
                    Cancel
                </s-button>
            </s-modal>
        </s-page>
    );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmit, useNavigation, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

import { VALID_STATUSES, DEFAULT_PER_PAGE, isActionable, restoreRemaining } from "./_data";

/**
 * Encapsulates all page-level state for the Subscription Cancellations
 * page: URL-param driven tab/pagination, the settings toggle (with an
 * optimistic flip that reverts on error), row selection for bulk reset,
 * and their handlers.
 */
export function useSubscriptionCancellationsPage(loaderData, actionData) {
    const submit = useSubmit();
    const navigation = useNavigation();
    const shopify = useAppBridge();
    const [searchParams, setSearchParams] = useSearchParams();

    const [selectedIds, setSelectedIds] = useState(new Set());
    // Optimistic local override so the switch flips instantly on click,
    // instead of waiting for the loader to re-run after the action commits.
    // Reset back to null (defer to loaderData) once the action settles.
    const [pendingSettingsEnabled, setPendingSettingsEnabled] = useState(null);

    // Shared confirm modal — turning auto-reset OFF, a single reset, and a
    // bulk reset all route through this one modal/ref, same "target state +
    // ref" shape as physical-prizes-claims-manage's ConfirmActionModal.
    const modalRef = useRef(null);
    const [confirmTarget, setConfirmTarget] = useState(null);
    // Editable amount for the "restore" confirm target only — a controlled
    // <input> needs a string value to live somewhere; kept here rather than
    // inside ConfirmModal so it can be pre-filled/reset from this hook.
    const [restoreAmountInput, setRestoreAmountInput] = useState("");

    const activeTab = VALID_STATUSES.includes(searchParams.get("status")) ? searchParams.get("status") : "ALL";

    const { page: currentPage, perPage, totalItems, totalPages } = loaderData?.pagination ?? {
        page: 1, perPage: DEFAULT_PER_PAGE, totalItems: 0, totalPages: 1,
    };
    const startIndex = (currentPage - 1) * perPage;

    const events = loaderData?.events ?? [];
    const stats = loaderData?.stats ?? { total: 0, applied: 0, needsAction: 0 };
    const settingsEnabled = pendingSettingsEnabled ?? loaderData?.settings?.enabled ?? true;

    const isSubmitting = navigation.state === "submitting";
    const pendingEventId = navigation.formData?.get("eventId");
    const isBusy = (id) => isSubmitting && Number(pendingEventId) === Number(id);

    // ── Search param helpers ──────────────────────────────────────────────────

    const updateParams = useCallback((updates) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            Object.entries(updates).forEach(([k, v]) => {
                if (v === "" || v == null) next.delete(k);
                else next.set(k, String(v));
            });
            if (!("page" in updates)) next.set("page", "1");
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    // Pagination.jsx's Prev/Next buttons call setCurrentPage with a React
    // useState-style functional updater (e.g. (p) => p + 1), matching how
    // usePagination.js's real useState setter works elsewhere on this site.
    // This setCurrentPage is URL-param-driven instead, so it must resolve
    // that updater itself against the current page before writing the URL —
    // otherwise the updater function gets stringified straight into
    // ?page=..., fails parseIntParam's Number.isFinite check, and silently
    // resets to page 1 on every Prev/Next click.
    const setCurrentPage = useCallback((p) => {
        const nextPage = typeof p === "function" ? p(currentPage) : p;
        updateParams({ page: nextPage });
    }, [updateParams, currentPage]);
    const setPerPage = useCallback((pp) => updateParams({ perPage: pp }), [updateParams]);
    const setActiveTab = useCallback((s) => {
        updateParams({ status: s });
        setSelectedIds(new Set());
    }, [updateParams]);

    // ── Action result side-effects ──────────────────────────────────────────
    useEffect(() => {
        if (!actionData) return;

        shopify.toast.show(actionData.message, { isError: actionData.status === "error" });

        if (actionData.submitType === "updateSettings") {
            // Settled — defer back to loaderData's fresh value either way.
            setPendingSettingsEnabled(null);
        }
        if (actionData.status === "success" && (actionData.submitType === "resetPoints" || actionData.submitType === "bulkResetPoints")) {
            setSelectedIds(new Set());
        }
    }, [actionData, shopify]);

    // ── Settings toggle ───────────────────────────────────────────────────────
    // Both directions are confirmed first — neither actually commits until
    // the admin confirms in the modal. The switch's visual state must NOT
    // change on click either: the DOM element flips itself instantly on
    // click regardless of what we do here (native toggle behavior), so
    // SettingsCard.jsx force-resyncs it back to `settingsEnabled` on every
    // render via a ref — see that file. `settingsEnabled` itself never
    // moves until handleConfirm below actually submits.
    const handleToggleSettings = useCallback((checked) => {
        setConfirmTarget({ type: "toggle", nextEnabled: checked });
        requestAnimationFrame(() => modalRef.current?.showOverlay());
    }, []);

    // ── Reset actions — both open the shared confirm modal; the actual
    // submit happens in handleConfirm below once the admin confirms ────────
    const handleResetOne = useCallback((event) => {
        setConfirmTarget({ type: "resetOne", event });
        requestAnimationFrame(() => modalRef.current?.showOverlay());
    }, []);

    const handleBulkReset = useCallback(() => {
        if (!selectedIds.size) return;
        setConfirmTarget({ type: "resetBulk" });
        requestAnimationFrame(() => modalRef.current?.showOverlay());
    }, [selectedIds]);

    // ── Restore action — opens the shared confirm modal with an editable
    // amount, pre-filled with whatever's still restorable for this event
    // (what its reset actually removed, minus whatever's already been
    // restored — see restoreRemaining in _data.js). Capping the
    // input itself happens server-side (handleRestorePoints) — this is only
    // a sane default, not the enforcement.
    const handleRestore = useCallback((event) => {
        setRestoreAmountInput(String(restoreRemaining(event)));
        setConfirmTarget({ type: "restore", event });
        requestAnimationFrame(() => modalRef.current?.showOverlay());
    }, []);

    const handleConfirm = useCallback(() => {
        modalRef.current?.hideOverlay();
        if (!confirmTarget) return;

        if (confirmTarget.type === "toggle") {
            setPendingSettingsEnabled(confirmTarget.nextEnabled);
            submit({ submitType: "updateSettings", enabled: String(confirmTarget.nextEnabled) }, { method: "post" });
        } else if (confirmTarget.type === "resetOne") {
            submit({ submitType: "resetPoints", eventId: String(confirmTarget.event.id) }, { method: "post" });
        } else if (confirmTarget.type === "resetBulk") {
            submit({ submitType: "bulkResetPoints", eventIds: JSON.stringify([...selectedIds]) }, { method: "post" });
        } else if (confirmTarget.type === "restore") {
            submit({ submitType: "restorePoints", eventId: String(confirmTarget.event.id), amount: restoreAmountInput }, { method: "post" });
        }
        setConfirmTarget(null);
    }, [confirmTarget, selectedIds, restoreAmountInput, submit]);

    const closeConfirmModal = useCallback(() => setConfirmTarget(null), []);

    // ── Selection helpers (only rows that are actually actionable) ────────────
    const selectableIds = events.filter(isActionable).map((e) => e.id);
    const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

    const toggleSelect = useCallback((id) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }, []);

    const toggleSelectAll = useCallback(() => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            const all = selectableIds.every((id) => next.has(id));
            selectableIds.forEach((id) => all ? next.delete(id) : next.add(id));
            return next;
        });
    }, [selectableIds]);

    const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

    return {
        events, stats, settingsEnabled,
        activeTab, setActiveTab,
        currentPage, perPage, totalItems, totalPages, startIndex, setCurrentPage, setPerPage,
        isSubmitting, isBusy,
        selectedIds, selectableIds, allSelected, toggleSelect, toggleSelectAll, clearSelection,
        handleToggleSettings, handleResetOne, handleBulkReset, handleRestore,
        modalRef, confirmTarget, handleConfirm, closeConfirmModal,
        restoreAmountInput, setRestoreAmountInput,
        loaderError: loaderData?.loaderError ?? null,
    };
}

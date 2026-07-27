import { useEffect, useCallback, useState } from "react";
import { useSubmit, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useFormState } from "@app/hooks/useFormState";

import { EMPTY_SHADOW_RULE_DATA, buildFormShape, validate, PER_PAGE } from "./_data";
import { DELETE_MODAL_ID } from "./components/DeleteConfirmModal";

/**
 * Encapsulates all page-level state for the Shadow Rules list/create/edit
 * page: view routing (list/create/edit), table pagination, the rule form
 * itself, and every submit/navigate handler.
 *
 * No file upload here (unlike usePhysicalPrizesPage), so submits are plain
 * objects via useSubmit — no FormData/formRef/multipart needed, same
 * shape as dev-config/index/route.jsx's own settingsFetcher.submit().
 */
export function useShadowRulesPage(loaderData, actionData) {
    const submitRR = useSubmit();
    const navigation = useNavigation();
    const shopify = useAppBridge();

    // ── View state ────────────────────────────────────────────────────────────
    const [view, setView] = useState("list");
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    // How many customers the rule currently being edited has already
    // awarded — locks the rate/currency fields in the form when > 0. See
    // route.jsx's action for the server-side enforcement of the same rule.
    const [editingEntryCount, setEditingEntryCount] = useState(0);

    // ── Submission state ──────────────────────────────────────────────────────
    const pendingSubmitType = navigation.formData?.get("submitType") ?? null;
    const isSubmitting = navigation.state === "submitting";

    // The per-action flags stay tied to "submitting" — they drive spinners
    // on the specific button that was pressed, and that button's work
    // genuinely ends when the action returns.
    const isSaving = isSubmitting && pendingSubmitType === "createShadowRule";
    const isUpdating = isSubmitting && pendingSubmitType === "updateShadowRule";
    const isDeleting = isSubmitting && pendingSubmitType === "deleteShadowRule";

    // The page-wide lock does NOT. A submit navigation runs "submitting"
    // then "loading" while the loader re-reads the rules, and gating this
    // on "submitting" alone re-enabled every button during that second
    // phase — so the table was still showing the pre-save list while
    // inviting the merchant to act on it.
    const isAnyBusy = navigation.state !== "idle";

    const busy = isSaving || isUpdating;

    // ── Form state ────────────────────────────────────────────────────────────
    const fs = useFormState(EMPTY_SHADOW_RULE_DATA, buildFormShape, { validate });

    // ── ACTION DATA EFFECT ────────────────────────────────────────────────────
    useEffect(() => {
        if (!actionData) return;
        shopify.toast.show(actionData.message, { isError: actionData.status === "error" });

        if (actionData.status === "success") {
            if (actionData.submitType === "createShadowRule" || actionData.submitType === "updateShadowRule") {
                setView("list");
                fs.reset();
            }
            if (actionData.submitType === "deleteShadowRule") {
                // Closed here rather than by a command="--hide" on the
                // confirm button, so the modal stays open (and keeps its
                // spinner and the rule's name) while the delete is in
                // flight, and stays open on rejection instead of vanishing
                // behind a toast. See DeleteConfirmModal.jsx.
                document.getElementById(DELETE_MODAL_ID)?.hide?.();
                setDeleteTarget(null);
            }
        }
        // fs is intentionally omitted — stable across this effect's lifetime,
        // including it would re-fire on every keystroke.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [actionData, shopify]);

    useEffect(() => { setCurrentPage(1); }, [loaderData?.rules?.length]);

    // ── DERIVED ───────────────────────────────────────────────────────────────
    const rules = loaderData?.rules ?? [];
    const totalPages = Math.max(1, Math.ceil(rules.length / PER_PAGE));
    const paginatedRules = rules.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

    // ── NAVIGATION HELPERS ────────────────────────────────────────────────────
    const goToCreate = useCallback(() => {
        // Same reasoning as usePhysicalPrizesPage's own goToCreate: force a
        // true blank slate via syncAfterSave rather than fs.reset(), which
        // would revert to whatever was last edited instead. Pre-fill
        // currencyCode from the shop's live currency so the form's
        // (disabled) currency field shows something meaningful even before
        // the first save — the actual value saved is always re-derived
        // server-side regardless (see route.jsx's action).
        fs.syncAfterSave({ ...EMPTY_SHADOW_RULE_DATA, currencyCode: loaderData?.shopCurrencyCode ?? null });
        setEditingEntryCount(0);
        setView("create");
    }, [fs, loaderData?.shopCurrencyCode]);

    const goToEdit = useCallback((rule) => {
        fs.syncAfterSave(rule);
        setEditingEntryCount(rule.entryCount ?? 0);
        setView("edit");
    }, [fs]);

    const goToList = useCallback(() => {
        setView("list");
        fs.reset();
    }, [fs]);

    // ── SUBMIT HELPERS ────────────────────────────────────────────────────────
    const buildPayload = useCallback((submitType) => ({
        submitType,
        rule: JSON.stringify(fs.form),
    }), [fs.form]);

    const handleSave = useCallback(async () => {
        const valid = await fs.submit();
        if (!valid) return;
        submitRR(buildPayload("createShadowRule"), { method: "post" });
    }, [fs, buildPayload, submitRR]);

    const handleUpdate = useCallback(async () => {
        const valid = await fs.submit();
        if (!valid) return;
        submitRR(buildPayload("updateShadowRule"), { method: "post" });
    }, [fs, buildPayload, submitRR]);

    const handleDelete = useCallback(() => {
        if (!deleteTarget || isAnyBusy) return;
        submitRR({ submitType: "deleteShadowRule", ruleId: deleteTarget.id }, { method: "post" });
    }, [deleteTarget, isAnyBusy, submitRR]);

    const handleDiscard = useCallback(() => {
        fs.reset();
    }, [fs]);

    return {
        fs,
        view,
        deleteTarget, setDeleteTarget,
        currentPage, setCurrentPage,
        editingEntryCount,
        isSaving, isUpdating, isDeleting, isAnyBusy, busy,
        paginatedRules, totalPages,
        goToCreate, goToEdit, goToList,
        handleSave, handleUpdate, handleDelete, handleDiscard,
    };
}

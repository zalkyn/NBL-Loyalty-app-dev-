// ─────────────────────────────────────────────────────────────────────────────
// PAGE HEADING
//
// Emits only slotted elements for <s-page> (heading text is the page's own
// `heading`, see pageTitle below), per Shopify's page pattern: one primary
// action, secondary actions in their own slot, back navigation as a breadcrumb.
//
// "list" view    -> primary action "Create New Rule".
// "create"/"edit" -> breadcrumb back to the list, Cancel, and Save/Update.
// ─────────────────────────────────────────────────────────────────────────────

export const pageTitle = (view) =>
    view === "list" ? "Reward Rules" : view === "edit" ? "Edit Rule" : "Create New Rule";

export function PageHeading({
    view,
    fs,
    isAnyBusy,
    isSaving,
    isUpdating,
    onCreate,
    onCancel,
    onSave,
    onUpdate,
}) {
    if (view === "list") {
        return (
            <s-button slot="primary-action" variant="primary" onClick={onCreate} disabled={isAnyBusy}>
                Create New Rule
            </s-button>
        );
    }

    const isEdit = view === "edit";
    return (
        <>
            <s-button slot="breadcrumb-actions" onClick={onCancel} disabled={isAnyBusy}>
                Rules
            </s-button>
            <s-button slot="secondary-actions" onClick={onCancel} disabled={isAnyBusy}>
                Cancel
            </s-button>
            {isEdit ? (
                <s-button
                    slot="primary-action"
                    variant="primary"
                    onClick={onUpdate}
                    loading={isUpdating}
                    disabled={isUpdating || !fs.isDirty}
                >
                    Update Rule
                </s-button>
            ) : (
                <s-button
                    slot="primary-action"
                    variant="primary"
                    onClick={onSave}
                    loading={isSaving}
                    disabled={isSaving || !fs.form.rewardType || !fs.form.title?.trim()}
                >
                    Save Rule
                </s-button>
            )}
        </>
    );
}

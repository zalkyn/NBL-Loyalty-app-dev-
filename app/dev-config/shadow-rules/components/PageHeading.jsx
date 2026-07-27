/**
 * Header bar — "Points Backfill Rules + Add Points Backfill Rule" on the list view, or a
 * breadcrumb ("Points Backfill Rules › Add Points Backfill Rule" / "Points Backfill Rules › Edit
 * Points Backfill Rule") on the create/edit views.
 */
export function PageHeading({ view, isAnyBusy, onCreate, onBackToList }) {
    if (view === "list") {
        return (
            <s-grid gridTemplateColumns="1fr auto" gap="large" alignItems="center">
                <h2 style={{ marginBlock: "0" }}>Points Backfill Rules</h2>
                <s-button variant="primary" onClick={onCreate} disabled={isAnyBusy}>
                    Add Points Backfill Rule
                </s-button>
            </s-grid>
        );
    }

    const isEdit = view === "edit";
    return (
        <s-stack direction="inline" gap="small" alignItems="center">
            <s-button
                variant="plain" onClick={onBackToList} disabled={isAnyBusy}
                style={{ padding: 0, minHeight: "unset" }}
            >
                Points Backfill Rules
            </s-button>
            <s-text tone="subdued">›</s-text>
            <h2 style={{ marginBlock: "0" }}>{isEdit ? "Edit Points Backfill Rule" : "Add Points Backfill Rule"}</h2>
        </s-stack>
    );
}

/**
 * Page actions for <s-page> (the title is the page's own `heading`, see
 * pageTitle): "Add Points Backfill Rule" as the primary action on the list
 * view, or a breadcrumb back to the list on the create/edit views.
 */
export const pageTitle = (view) =>
    view === "list" ? "Points Backfill Rules" : view === "edit" ? "Edit Points Backfill Rule" : "Add Points Backfill Rule";

export function PageHeading({ view, isAnyBusy, onCreate, onBackToList }) {
    if (view === "list") {
        return (
            <s-button slot="primary-action" variant="primary" onClick={onCreate} disabled={isAnyBusy}>
                Add Points Backfill Rule
            </s-button>
        );
    }

    return (
        <s-button slot="breadcrumb-actions" onClick={onBackToList} disabled={isAnyBusy}>
            Points Backfill Rules
        </s-button>
    );
}

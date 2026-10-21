/**
 * Page actions for <s-page> (the title is the page's own `heading`, see
 * pageTitle): "Add New Prize" as the primary action on the list view, or a
 * breadcrumb back to the list on the create/edit views.
 */
export const pageTitle = (view) =>
    view === "list" ? "Physical Prizes" : view === "edit" ? "Edit Prize" : "Add New Prize";

export function PageHeading({ view, isAnyBusy, onCreate, onBackToList }) {
    if (view === "list") {
        return (
            <s-button slot="primary-action" variant="primary" onClick={onCreate} disabled={isAnyBusy}>
                Add New Prize
            </s-button>
        );
    }

    return (
        <s-button slot="breadcrumb-actions" onClick={onBackToList} disabled={isAnyBusy}>
            Prizes
        </s-button>
    );
}

// Emits only the page's primary action (slot for <s-page>); the title is the
// page's own `heading`.
export function PageHeading({ showAddForm, isAnyBusy, onToggle }) {
    return (
        <s-button
            slot="primary-action"
            icon={showAddForm ? "minus" : "plus"}
            variant={showAddForm ? "secondary" : "primary"}
            disabled={isAnyBusy}
            onClick={onToggle}
        >
            {showAddForm ? "Cancel" : "Add New Event"}
        </s-button>
    );
}

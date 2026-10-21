// Emits only the page's primary action (slot for <s-page>); the title is the
// page's own `heading`.
export function PageHeader() {
    return (
        <s-button
            slot="primary-action"
            variant="primary"
            commandFor="event-selector-modal"
            command="--show"
        >
            Add New Rule
        </s-button>
    );
}

/**
 * Dismissible banner that surfaces unseen claims since the admin's last
 * visit, with a shortcut to jump straight to the "New" filter tab.
 * Page-wide: direct child of <s-page>, supplemental-start slot, next step as
 * a secondary action.
 */
export function NewClaimsBanner({ stats, newDismissed, onDismiss, onViewNew }) {
    if (newDismissed || !stats.new || stats.new === 0) return null;
    return (
        <s-banner
            slot="supplemental-start"
            tone="info"
            heading={`${stats.new} new prize request${stats.new > 1 ? "s" : ""} since your last visit`}
            dismissible
            onDismiss={onDismiss}
        >
            <s-text>
                {stats.new} new {stats.new > 1 ? "requests need" : "request needs"} your attention.
            </s-text>
            <s-button slot="secondary-actions" variant="secondary" onClick={onViewNew}>
                View new requests
            </s-button>
        </s-banner>
    );
}

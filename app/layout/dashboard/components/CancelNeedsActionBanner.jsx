import { useNavigate } from "react-router";

/**
 * Surfaces pending Subscription Cancellations "Needs Action" items on the
 * main dashboard — previously only visible by navigating to that page
 * directly. Renders nothing when there's nothing to act on, so it never
 * adds permanent clutter for a shop with auto-reset on and nothing pending.
 *
 * A page-wide banner: direct child of <s-page> in its supplemental-start
 * slot, next step as a secondary action.
 */
export function CancelNeedsActionBanner({ count }) {
    const navigate = useNavigate();

    if (!count) return null;

    return (
        <s-banner slot="supplemental-start" tone="warning" heading="Subscription cancellations need attention">
            <s-text>
                {count.toLocaleString()} cancelled subscription{count > 1 ? "s" : ""} {count > 1 ? "haven't" : "hasn't"} had their points balance reset yet.
            </s-text>
            <s-button slot="secondary-actions" variant="secondary" onClick={() => navigate("/app/subscription-cancellations")}>
                Review
            </s-button>
        </s-banner>
    );
}

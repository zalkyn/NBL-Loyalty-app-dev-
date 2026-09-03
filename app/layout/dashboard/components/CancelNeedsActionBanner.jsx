import { useNavigate } from "react-router";

/**
 * Surfaces pending Subscription Cancellations "Needs Action" items on the
 * main dashboard — previously only visible by navigating to that page
 * directly. Renders nothing when there's nothing to act on, so it never
 * adds permanent clutter for a shop with auto-reset on and nothing pending.
 */
export function CancelNeedsActionBanner({ count }) {
    const navigate = useNavigate();

    if (!count) return null;

    return (
        <s-section>
            <s-banner tone="warning" heading="Subscription cancellations need attention">
                <s-stack direction="inline" gap="base" alignItems="center">
                    <s-text>
                        {count.toLocaleString()} cancelled subscription{count > 1 ? "s" : ""} {count > 1 ? "haven't" : "hasn't"} had their points balance reset yet.
                    </s-text>
                    <s-button variant="primary" onClick={() => navigate("/app/subscription-cancellations")}>
                        Review
                    </s-button>
                </s-stack>
            </s-banner>
        </s-section>
    );
}

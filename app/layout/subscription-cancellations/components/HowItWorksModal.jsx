export const HOW_IT_WORKS_MODAL_ID = "subscription-cancel-how-it-works-modal";

/**
 * Read-only explainer for this page, opened from the info button in
 * route.jsx's header section (commandFor + command="--show" — no React
 * state needed). Every statement here mirrors actual behavior in
 * subscriptionCancelledJob.js (automatic path) and _data.server.js (manual
 * reset / restore) — keep it in sync if either changes.
 */
export function HowItWorksModal() {
    return (
        <s-modal
            id={HOW_IT_WORKS_MODAL_ID}
            heading="How subscription cancellations work"
            accessibilityLabel="How subscription cancellations work"
            size="large"
        >
            <s-stack direction="block" gap="base">

                <s-stack direction="block" gap="small-300">
                    <s-heading>When a subscription is cancelled</s-heading>
                    <s-paragraph>
                        Appstle notifies the app as soon as a customer&apos;s subscription is cancelled. Every
                        cancellation is recorded on this page, whether or not points were reset.
                    </s-paragraph>
                </s-stack>

                <s-divider />

                <s-stack direction="block" gap="small-300">
                    <s-heading>Auto-reset points on cancellation</s-heading>
                    <s-unordered-list>
                        <s-list-item>
                            <s-text type="strong">ON:</s-text> the customer&apos;s current points balance is reset to 0
                            automatically.
                        </s-list-item>
                        <s-list-item>
                            <s-text type="strong">OFF:</s-text> nothing is deducted. The cancellation goes to
                            &quot;Needs Action&quot; so you can decide later.
                        </s-list-item>
                        <s-list-item>Lifetime points are never changed, either way.</s-list-item>
                    </s-unordered-list>
                </s-stack>

                <s-divider />

                <s-stack direction="block" gap="small-300">
                    <s-heading>What each status means</s-heading>
                    <s-unordered-list>
                        <s-list-item>
                            <s-badge tone="success">Yes</s-badge> Points were reset to 0 for this cancellation.
                            &quot;Manually reset&quot; means an admin applied it from this page.
                        </s-list-item>
                        <s-list-item>
                            <s-badge tone="warning">No</s-badge> <s-text type="strong">Auto-reset was off</s-text>:
                            not reset because the toggle was off at the time. Use &quot;Reset Now&quot; to apply it.
                        </s-list-item>
                        <s-list-item>
                            <s-badge tone="warning">No</s-badge> <s-text type="strong">Not enrolled in loyalty
                            program</s-text>: the customer has no loyalty account, so there are no points to reset.
                            &quot;Reset Now&quot; will work if they join later.
                        </s-list-item>
                        <s-list-item>
                            <s-badge tone="warning">No</s-badge> <s-text type="strong">Balance was already 0</s-text>:
                            nothing to deduct. No action needed.
                        </s-list-item>
                        <s-list-item>
                            <s-badge tone="warning">No</s-badge> <s-text type="strong">Balance is negative</s-text>:
                            the customer owes points from a cancelled or refunded order. Left untouched on purpose so
                            that debt isn&apos;t cleared.
                        </s-list-item>
                    </s-unordered-list>
                </s-stack>

                <s-divider />

                <s-stack direction="block" gap="small-300">
                    <s-heading>Tabs</s-heading>
                    <s-unordered-list>
                        <s-list-item><s-text type="strong">All:</s-text> every recorded cancellation.</s-list-item>
                        <s-list-item>
                            <s-text type="strong">Needs Action:</s-text> cancellations still waiting for a reset.
                        </s-list-item>
                        <s-list-item>
                            <s-text type="strong">Reset Applied:</s-text> cancellations where points were reset.
                        </s-list-item>
                    </s-unordered-list>
                </s-stack>

                <s-divider />

                <s-stack direction="block" gap="small-300">
                    <s-heading>Reset Now and bulk reset</s-heading>
                    <s-unordered-list>
                        <s-list-item>
                            Resets the customer&apos;s balance as it is at the moment you click, including any points
                            earned after the cancellation.
                        </s-list-item>
                        <s-list-item>
                            If the balance is already 0, the cancellation is marked as resolved and nothing is
                            deducted.
                        </s-list-item>
                        <s-list-item>Negative balances and customers who aren&apos;t enrolled are skipped.</s-list-item>
                        <s-list-item>
                            Bulk reset deducts real points. Select only the customers you intend to reset.
                        </s-list-item>
                    </s-unordered-list>
                </s-stack>

                <s-divider />

                <s-stack direction="block" gap="small-300">
                    <s-heading>Restore Points</s-heading>
                    <s-unordered-list>
                        <s-list-item>Only available on cancellations where points were actually deducted.</s-list-item>
                        <s-list-item>
                            You can restore part or all of it, up to the points that reset actually removed. This can be
                            more than &quot;Points at Cancellation&quot; when the reset was applied later and the customer
                            had earned more in between.
                        </s-list-item>
                        <s-list-item>
                            To give back more than that, use &quot;Adjust Points&quot; on the customer&apos;s profile.
                        </s-list-item>
                    </s-unordered-list>
                </s-stack>

                <s-divider />

                <s-stack direction="block" gap="small-300">
                    <s-heading>Customers with more than one cancellation</s-heading>
                    <s-paragraph>
                        Each cancellation is listed separately (for example, when a customer cancels two
                        subscriptions). Once one of them resets the balance, the others show &quot;Balance was
                        already 0&quot; and have no Restore button. Restore from the row marked &quot;Yes&quot;, so
                        points are never given back twice.
                    </s-paragraph>
                </s-stack>

            </s-stack>

            <s-button slot="primary-action" variant="primary" commandFor={HOW_IT_WORKS_MODAL_ID} command="--hide">
                Got it
            </s-button>
        </s-modal>
    );
}

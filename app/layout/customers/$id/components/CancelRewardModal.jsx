/**
 * Confirmation modal for admin-initiated reward cancellation.
 * Only ever shown for rewards that are ACTIVE and not yet used at checkout —
 * RewardsTable.jsx only renders the trigger button for eligible rewards, and
 * the server-side handleCancelReward action re-checks this independently.
 */
export function CancelRewardModal({ modalRef, target, isSubmitting, onConfirm, onHide }) {
    const title = target?.title || "this reward";
    const pts = Number(target?.pointsCost ?? 0).toLocaleString();

    return (
        <s-modal
            ref={modalRef}
            id="cancel-reward-modal"
            heading="Cancel Reward"
            accessibilityLabel="Cancel Reward"
            onHide={onHide}
        >
            <s-stack direction="block" gap="base">
                <s-banner tone="warning" heading="Points will be refunded">
                    {pts} points will be returned to the customer's account automatically.
                </s-banner>
                <s-text>
                    Are you sure you want to cancel "{title}"? The voucher code will stop working immediately.
                </s-text>
            </s-stack>
            <s-button slot="secondary-actions" variant="secondary" commandFor="cancel-reward-modal" command="--hide" disabled={isSubmitting}>
                Go Back
            </s-button>
            <s-button
                slot="primary-action"
                variant="primary"
                tone="critical"
                onClick={onConfirm}
                loading={isSubmitting}
                disabled={isSubmitting}
            >
                Cancel &amp; Refund {pts} pts
            </s-button>
        </s-modal>
    );
}

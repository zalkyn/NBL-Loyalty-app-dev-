import { totalPoints } from "../_data.js";

export const DECISION_MODAL_ID = "referral-decision-modal";

/**
 * Asks before points are awarded or withheld, and says exactly what will
 * happen — to the points, and to what the customers are told.
 */
export function ConfirmDecisionModal({ decision, rows, busy, onConfirm }) {
    const count = rows.length;
    const approve = decision === "approve";
    const pts = totalPoints(rows);

    return (
        <s-modal id={DECISION_MODAL_ID} heading={approve ? `Approve ${count} referral${count === 1 ? "" : "s"}?` : `Reject ${count} referral${count === 1 ? "" : "s"}?`} size="small">
            <s-stack gap="base">
                {approve ? (
                    <>
                        <s-text>
                            This awards <strong>{pts.referrer.toLocaleString()}</strong> points to the referrer{count === 1 ? "" : "s"} and{" "}
                            <strong>{pts.friend.toLocaleString()}</strong> points to the referred customer{count === 1 ? "" : "s"}.
                        </s-text>
                        <s-text color="subdued">Both customers see the points in their widget straight away.</s-text>
                    </>
                ) : (
                    <>
                        <s-text>No points will be awarded for {count === 1 ? "this referral" : "these referrals"}. The referred customer keeps the discount they already used.</s-text>
                        <s-text color="subdued">The referrer is told the reward wasn&apos;t approved. You can&apos;t undo a rejection.</s-text>
                    </>
                )}
            </s-stack>
            <s-button slot="secondary-actions" commandFor={DECISION_MODAL_ID} command="--hide" disabled={busy}>
                Cancel
            </s-button>
            <s-button
                slot="primary-action"
                variant="primary"
                tone={approve ? undefined : "critical"}
                onClick={onConfirm}
                commandFor={DECISION_MODAL_ID}
                command="--hide"
                loading={busy || undefined}
                disabled={busy}
            >
                {approve ? "Approve and award points" : "Reject"}
            </s-button>
        </s-modal>
    );
}

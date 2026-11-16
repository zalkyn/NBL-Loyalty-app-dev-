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
    // New claims have no order or points yet — approving creates the discount code.
    const claims = rows.length > 0 && rows.every((r) => r.status === "PENDING_APPROVAL");

    return (
        <s-modal id={DECISION_MODAL_ID} heading={approve ? `Approve ${count} referral${count === 1 ? "" : "s"}?` : `Reject ${count} referral${count === 1 ? "" : "s"}?`} size="small">
            <s-stack gap="base">
                {claims ? (
                    approve ? (
                        <>
                            <s-text>This creates the referral discount code for {count === 1 ? "this customer" : "these customers"}.</s-text>
                            <s-text color="subdued">They are told it&apos;s ready and can use it at checkout. Referral points are awarded later, as usual, after their order.</s-text>
                        </>
                    ) : (
                        <>
                            <s-text>No discount code will be created for {count === 1 ? "this claim" : "these claims"}, and no referral points will be awarded.</s-text>
                            <s-text color="subdued">The customer is told their request wasn&apos;t approved. You can&apos;t undo a rejection.</s-text>
                        </>
                    )
                ) : approve ? (
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
                {approve ? (claims ? "Approve and create code" : "Approve and award points") : "Reject"}
            </s-button>
        </s-modal>
    );
}

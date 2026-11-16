import { totalPoints } from "../_data.js";

export const DECISION_MODAL_ID = "referral-decision-modal";

/**
 * Asks before points are awarded or withheld, and says exactly what will
 * happen — to the points, and to what the customers are told.
 */
export function ConfirmDecisionModal({ decision, rows, busy, onConfirm }) {
    const count = rows.length;
    const approve = decision === "approve";
    const release = decision === "release";
    const pts = totalPoints(rows);
    // New claims have no order or points yet — approving creates the discount code.
    const claims = rows.length > 0 && rows.every((r) => r.status === "PENDING_APPROVAL");
    // Held on the promo order: approving does not pay yet, the reward still waits for the full-price payment.
    const deferred = rows.length > 0 && rows.every((r) => r.metadata?.hold?.deferred);

    return (
        <s-modal id={DECISION_MODAL_ID} heading={release ? `Release ${count} reward${count === 1 ? "" : "s"} now?` : approve ? `Approve ${count} referral${count === 1 ? "" : "s"}?` : `Reject ${count} referral${count === 1 ? "" : "s"}?`} size="small">
            <s-stack gap="base">
                {release ? (
                    <>
                        <s-text>
                            This pays <strong>{pts.referrer.toLocaleString()}</strong> points to the referrer{count === 1 ? "" : "s"} and{" "}
                            <strong>{pts.friend.toLocaleString()}</strong> points to the new member{count === 1 ? "" : "s"} now, without waiting for a full-price payment.
                        </s-text>
                        <s-text color="subdued">Use this when you know the customer deserves the reward already. It can&apos;t be undone, and a later full-price payment will not pay it again.</s-text>
                    </>
                ) : claims ? (
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
                ) : approve && deferred ? (
                    <>
                        <s-text>
                            This clears the review. {count === 1 ? "The reward is" : "The rewards are"} still paid only on the customer&apos;s first payment at the full price
                            ({pts.referrer.toLocaleString()} points for the referrer{count === 1 ? "" : "s"}, {pts.friend.toLocaleString()} for the new member{count === 1 ? "" : "s"}).
                        </s-text>
                    </>
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
                tone={approve || release ? undefined : "critical"}
                onClick={onConfirm}
                commandFor={DECISION_MODAL_ID}
                command="--hide"
                loading={busy || undefined}
                disabled={busy}
            >
                {release ? "Release and pay points" : approve ? (claims ? "Approve and create code" : deferred ? "Approve" : "Approve and award points") : "Reject"}
            </s-button>
        </s-modal>
    );
}

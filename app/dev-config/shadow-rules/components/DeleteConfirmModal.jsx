/**
 * Confirmation modal shown before deleting a points backfill rule. The delete
 * button that opens this is already disabled in ShadowRuleTable.jsx when
 * entryCount > 0, and route.jsx's action re-checks the same thing
 * server-side (backed by the Restrict FK constraint on
 * PointsBackfillEntry.shadowRuleId as a last resort) — this modal only
 * ever confirms a delete that's actually safe.
 */
export const DELETE_MODAL_ID = "delete-shadow-rule-modal";

export function DeleteConfirmModal({ deleteTarget, isDeleting, onConfirm }) {
    return (
        <s-modal id={DELETE_MODAL_ID} heading="Delete Points Backfill Rule" size="small">
            <s-paragraph color="subdued">
                Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
            </s-paragraph>
            <s-button
                slot="secondary-actions"
                commandFor={DELETE_MODAL_ID} command="--hide"
                disabled={isDeleting}
            >
                Cancel
            </s-button>
            {/* Deliberately NO command="--hide" here.
                It used to carry one alongside loading={isDeleting}, which
                cancelled the two out: the modal closed on the same click
                that started the delete, so the spinner it was asked to
                show could never be seen, and a delete that took a moment —
                or was rejected server-side — looked like a click that did
                nothing. _hooks.js closes this on success instead, so a
                rejected delete keeps its explanation on screen. Same
                pattern as points-backfill's CreateSegmentModal. */}
            <s-button
                slot="primary-action" variant="primary" destructive
                onClick={onConfirm}
                loading={isDeleting || undefined} disabled={isDeleting}
            >
                {isDeleting ? "Deleting…" : "Yes, Delete"}
            </s-button>
        </s-modal>
    );
}

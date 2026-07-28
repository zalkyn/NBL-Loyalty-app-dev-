/**
 * @file dev-config/points-backfill/components/ConfirmStartModal.jsx
 * @description The one confirmation modal this page uses — opened via
 * commandFor={MODAL_ID} command="--show" from the Start Backfill button.
 * Same shape as customer-sync's own ConfirmActionModal.jsx.
 */

import { MODAL_ID } from "../_hooks";

export function ConfirmStartModal({ pendingAction, onConfirm, onCancel }) {
    return (
        <s-modal
            id={MODAL_ID}
            heading={pendingAction?.confirmHeading || "Confirm action"}
            accessibilityLabel={pendingAction?.confirmHeading || "Confirm action"}
        >
            <s-text>{pendingAction?.confirmText}</s-text>
            <s-button
                slot="primary-action"
                variant="primary"
                destructive
                commandFor={MODAL_ID}
                command="--hide"
                onClick={onConfirm}
            >
                Start Backfill
            </s-button>
            <s-button
                slot="secondary-actions"
                variant="secondary"
                commandFor={MODAL_ID}
                command="--hide"
                onClick={onCancel}
            >
                Cancel
            </s-button>
        </s-modal>
    );
}

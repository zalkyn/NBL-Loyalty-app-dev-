/**
 * @file dev-config/customer-sync/components/ConfirmActionModal.jsx
 * @description The one shared confirmation modal every trigger button on
 * this page opens via commandFor={MODAL_ID} command="--show" — nothing on
 * this page executes on a single accidental click. See _hooks.js's
 * pendingAction state / confirmPendingAction() for how a button "stages"
 * an action here before it actually runs.
 */

import { MODAL_ID } from "../_hooks";

export function ConfirmActionModal({ pendingAction, onConfirm, onCancel }) {
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
                commandFor={MODAL_ID}
                command="--hide"
                onClick={onConfirm}
            >
                Confirm
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

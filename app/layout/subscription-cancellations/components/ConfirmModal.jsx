import { restorableTotal, restoreRemaining as getRestoreRemaining } from "../_data";

/**
 * One shared modal for every consequential action on this page — toggling
 * auto-reset (either direction), a single manual reset, a bulk reset, and
 * restoring points (editable, partial amounts). Nothing actually commits
 * until the admin confirms here — see _hooks.js's
 * handleToggleSettings/handleConfirm and SettingsCard.jsx's comment on why
 * the switch itself must not visually flip before that.
 */
export function ConfirmModal({
    modalRef, confirmTarget, selectedCount, isSubmitting, onConfirm, onHide,
    restoreAmountInput, onRestoreAmountChange,
}) {
    const type = confirmTarget?.type;
    const isToggle = type === "toggle";
    const isToggleOff = isToggle && confirmTarget?.nextEnabled === false;
    const isToggleOn = isToggle && confirmTarget?.nextEnabled === true;
    const isResetOne = type === "resetOne";
    const isResetBulk = type === "resetBulk";
    const isRestore = type === "restore";

    const event = confirmTarget?.event;
    const customerName = event?.customerName || "this customer";
    // Prefer the customer's LIVE current balance over event.previousBalance
    // (a snapshot from when the cancellation was first recorded, which can
    // be stale by the time an admin manually resolves it — e.g. they've
    // earned or redeemed points since). createTransaction always resets
    // from the live balance regardless, so this only affects what the
    // preview number says, not what actually gets reset — but showing the
    // stale figure here would be misleading either way.
    const pts = Number(event?.customer?.points ?? event?.previousBalance ?? 0).toLocaleString();

    // How much is still restorable for THIS cancellation — the hard cap
    // handleRestorePoints enforces server-side. Shown here so the admin
    // isn't guessing, and to validate the input before they even submit.
    const restoreRemaining = event ? getRestoreRemaining(event) : 0;
    const restoreAmountNum = Number(restoreAmountInput);
    const restoreAmountValid = Number.isFinite(restoreAmountNum) && restoreAmountNum > 0 && restoreAmountNum <= restoreRemaining;

    const modalHeading = isToggleOff
        ? "Turn Off Auto-Reset"
        : isToggleOn
            ? "Turn On Auto-Reset"
            : isResetBulk
                ? "Reset Selected Customers"
                : isRestore
                    ? "Restore Points"
                    : "Reset Points to 0";

    return (
        <s-modal
            ref={modalRef}
            id="confirm-subscription-cancel-modal"
            heading={modalHeading}
            accessibilityLabel={modalHeading}
            onHide={onHide}
        >
            <s-stack direction="block" gap="base">
                {isToggleOff && (
                    <>
                        <s-banner tone="warning" heading="Cancellations won't auto-reset anymore">
                            New subscription cancellations will land in &quot;Needs Action&quot; instead of resetting points
                            automatically. Nothing already reset is affected, and you can still reset any of them
                            manually from this page.
                        </s-banner>
                        <s-text>Turn off automatic points reset on cancellation?</s-text>
                    </>
                )}
                {isToggleOn && (
                    <>
                        <s-banner tone="info" heading="Cancellations will auto-reset again">
                            New subscription cancellations from now on will have the customer&apos;s points balance
                            reset to 0 automatically. Lifetime points are never affected.
                        </s-banner>
                        <s-text>Turn on automatic points reset on cancellation?</s-text>
                    </>
                )}
                {isResetOne && (
                    <>
                        <s-banner tone="warning" heading="Points will be reset to 0">
                            {pts} points will be removed from {customerName}&apos;s current balance. Lifetime points are
                            never affected.
                        </s-banner>
                        <s-text>Reset {customerName}&apos;s points balance to 0?</s-text>
                    </>
                )}
                {isResetBulk && (
                    <>
                        <s-banner tone="warning" heading="Points will be reset to 0">
                            Every selected customer&apos;s current points balance will be reset to 0. Lifetime points
                            are never affected.
                        </s-banner>
                        <s-text>Reset {selectedCount} selected customer{selectedCount > 1 ? "s" : ""} to 0 points?</s-text>
                    </>
                )}
                {isRestore && (
                    <>
                        <s-banner tone="info" heading="Points will be added back">
                            Restores points to {customerName}&apos;s current balance. Lifetime points are never
                            affected — this only undoes part or all of the earlier reset.
                        </s-banner>
                        <s-text>
                            Up to {restoreRemaining.toLocaleString()} pts are still restorable for this cancellation
                            (of {(event ? restorableTotal(event) : 0).toLocaleString()} pts this reset removed).
                        </s-text>
                        <s-number-field
                            label="Points to restore"
                            placeholder="0"
                            min="1"
                            max={String(restoreRemaining)}
                            step="1"
                            value={restoreAmountInput}
                            onInput={(e) => onRestoreAmountChange(e.target.value)}
                            error={
                                restoreAmountInput && !restoreAmountValid
                                    ? `Enter a whole number between 1 and ${restoreRemaining.toLocaleString()}.`
                                    : undefined
                            }
                        />
                    </>
                )}
            </s-stack>
            <s-button slot="secondary-actions" variant="secondary" commandFor="confirm-subscription-cancel-modal" command="--hide" disabled={isSubmitting}>
                Go Back
            </s-button>
            <s-button
                slot="primary-action"
                variant="primary"
                tone={isToggleOff ? "critical" : undefined}
                onClick={onConfirm}
                loading={isSubmitting}
                disabled={isSubmitting || (isRestore && !restoreAmountValid)}
            >
                {isToggleOff ? "Turn Off"
                    : isToggleOn ? "Turn On"
                        : isResetBulk ? `Reset ${selectedCount} to 0`
                            : isRestore ? `Restore ${restoreAmountInput || 0} pts`
                                : "Reset to 0"}
            </s-button>
        </s-modal>
    );
}

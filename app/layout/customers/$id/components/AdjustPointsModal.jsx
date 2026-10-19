import { useState, useCallback, useRef } from "react";

const MODAL_ID = "adjust-points-modal";
const REASON_MAX = 200;

// One-tap amounts and reasons, so the common cases don't need typing.
const QUICK_AMOUNTS = [100, 500, 1000, 5000];
const REASONS = {
    add: ["Goodwill gesture", "Order issue", "Referral reward", "Correction"],
    remove: ["Correction", "Order refunded", "Duplicate points", "Fraud review"],
};

/**
 * AdjustPointsModal — merchant-friendly points adjustment.
 *
 * UX:
 *   - Add / Remove choice — the merchant always enters a positive number
 *   - One-tap quick amounts and reasons for the common cases
 *   - Live "before → after" balance card
 *   - Says plainly what the customer will see
 *   - Validation: amount must be > 0; Remove blocked if it exceeds the balance
 */
export function AdjustPointsModal({ customer, isAdjusting, onConfirm }) {
    const modalRef = useRef(null);

    const [mode, setMode] = useState("add");   // "add" | "remove"
    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("");

    const currentPoints = customer?.points ?? 0;
    const parsedAmount = Math.max(0, parseInt(amount, 10) || 0);
    const adding = mode === "add";

    const previewBalance = adding
        ? currentPoints + parsedAmount
        : Math.max(0, currentPoints - parsedAmount);

    const insufficientBalance = !adding && parsedAmount > currentPoints;
    const isValid = parsedAmount > 0 && !insufficientBalance;
    const removesEverything = !adding && parsedAmount > 0 && parsedAmount === currentPoints;

    const reset = useCallback(() => {
        setMode("add");
        setAmount("");
        setReason("");
    }, []);

    const handleConfirm = useCallback(() => {
        if (!isValid) return;
        modalRef.current?.hideOverlay();
        onConfirm({ mode, amount: parsedAmount, reason: reason.trim() });
        reset();
    }, [isValid, mode, parsedAmount, reason, onConfirm, reset]);

    const addQuick = (n) => setAmount(String((parsedAmount || 0) + n));

    return (
        <s-modal
            ref={modalRef}
            id={MODAL_ID}
            heading={`Adjust points — ${customer?.name || customer?.email || "customer"}`}
            size="base"
            onHide={reset}
        >
            <s-stack direction="block" gap="base">
                {/* ── Add / Remove ── */}
                <s-grid gridTemplateColumns="1fr 1fr" gap="small">
                    <s-button
                        variant={adding ? "primary" : "secondary"}
                        inlineSize="fill"
                        icon="plus-circle"
                        onClick={() => setMode("add")}
                    >
                        Add points
                    </s-button>
                    <s-button
                        variant={!adding ? "primary" : "secondary"}
                        tone={!adding ? "critical" : undefined}
                        inlineSize="fill"
                        icon="minus-circle"
                        onClick={() => setMode("remove")}
                    >
                        Remove points
                    </s-button>
                </s-grid>

                {/* ── Amount ── */}
                <s-number-field
                    label="Points"
                    placeholder="0"
                    min="1"
                    step="1"
                    suffix="pts"
                    value={amount}
                    onInput={(e) => setAmount(e.target.value)}
                    error={
                        amount && !isValid
                            ? insufficientBalance
                                ? `This customer only has ${currentPoints.toLocaleString()} points.`
                                : "Points must be greater than 0."
                            : undefined
                    }
                />
                <s-stack direction="inline" gap="small" alignItems="center">
                    <s-text tone="subdued">Quick add:</s-text>
                    {QUICK_AMOUNTS.map((n) => (
                        <s-button key={n} size="small" variant="secondary" onClick={() => addQuick(n)}>
                            +{n.toLocaleString()}
                        </s-button>
                    ))}
                    {!adding && currentPoints > 0 && (
                        <s-button size="small" variant="secondary" onClick={() => setAmount(String(currentPoints))}>
                            All ({currentPoints.toLocaleString()})
                        </s-button>
                    )}
                </s-stack>

                {/* ── Before → after ── */}
                <s-box padding="base" background="subdued" borderRadius="base">
                    <s-grid gridTemplateColumns="1fr auto 1fr" gap="base" alignItems="center">
                        <s-stack direction="block" gap="small-500">
                            <s-text tone="subdued">Now</s-text>
                            <s-heading>{currentPoints.toLocaleString()} pts</s-heading>
                        </s-stack>
                        <s-text tone="subdued">→</s-text>
                        <s-stack direction="block" gap="small-500">
                            <s-text tone="subdued">After this change</s-text>
                            <s-heading>
                                <span style={{ color: parsedAmount === 0 ? undefined : adding ? "var(--p-color-text-success, #0c5132)" : "var(--p-color-text-critical, #d82c0d)" }}>
                                    {previewBalance.toLocaleString()} pts
                                </span>
                            </s-heading>
                        </s-stack>
                    </s-grid>
                </s-box>

                {removesEverything && (
                    <s-banner tone="warning">
                        <s-text>This takes the customer&apos;s balance to zero.</s-text>
                    </s-banner>
                )}

                {/* ── Reason ── */}
                <s-stack direction="block" gap="small">
                    <s-text-area
                        label="Reason (optional)"
                        placeholder="Why are you changing this balance?"
                        rows={2}
                        maxLength={REASON_MAX}
                        value={reason}
                        onInput={(e) => setReason(e.target.value)}
                        details={`${reason.length}/${REASON_MAX} — saved with the transaction so you and your team can see why.`}
                    />
                    <s-stack direction="inline" gap="small" alignItems="center">
                        <s-text tone="subdued">Common reasons:</s-text>
                        {REASONS[mode].map((r) => (
                            <s-button key={r} size="small" variant="tertiary" onClick={() => setReason(r)}>
                                {r}
                            </s-button>
                        ))}
                    </s-stack>
                </s-stack>

                <s-text tone="subdued">
                    The customer will see &quot;Admin {adding ? "added" : "removed"} {parsedAmount > 0 ? parsedAmount.toLocaleString() : "N"} points&quot; in their loyalty widget.
                </s-text>
            </s-stack>

            <s-button slot="secondary-actions" commandFor={MODAL_ID} command="--hide" disabled={isAdjusting}>
                Cancel
            </s-button>
            <s-button
                slot="primary-action"
                variant="primary"
                tone={adding ? undefined : "critical"}
                icon={adding ? "plus-circle" : "minus-circle"}
                disabled={!isValid || isAdjusting}
                loading={isAdjusting || undefined}
                onClick={handleConfirm}
            >
                {adding ? "Add points" : "Remove points"}
            </s-button>
        </s-modal>
    );
}

import { useEffect, useRef } from "react";
import { MANUAL_RESET_MODE_OPTIONS } from "../_data";

/**
 * Controls whether a customer's points balance is automatically reset to 0
 * when their subscription is cancelled. Every cancellation is still
 * recorded below regardless of this setting — turning it off only means
 * new cancellations land in the "Needs Action" tab instead of resetting
 * automatically, so nothing is ever silently missed.
 *
 * Both directions are confirmed in a modal before anything actually
 * commits (see _hooks.js's handleToggleSettings) — so the switch must NOT
 * visually flip on click. `<s-switch>` is a native web component that
 * flips its own internal `checked` state immediately on click, independent
 * of React's render cycle; if `enabled` (the real, unconfirmed value)
 * hasn't changed, React has no prop diff to react to and won't force the
 * DOM back — leaving the switch showing the wrong state until the admin
 * confirms or cancels. The ref + effect below force-writes `.checked`
 * back to the true `enabled` value on every render, closing that gap.
 *
 * The manual reset mode below works the same way: a change is confirmed in
 * the modal first, and the choice list is forced back to the saved value
 * (`manualResetMode`) until then.
 */
export function SettingsCard({ enabled, manualResetMode, isSubmitting, onChange, onModeChange }) {
    const switchRef = useRef(null);
    const modeRef = useRef(null);

    useEffect(() => {
        if (switchRef.current) switchRef.current.checked = enabled;
        if (modeRef.current) modeRef.current.values = [manualResetMode];
    });

    return (
        <s-section>
            <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
                <s-stack direction="block" gap="none">
                    <s-heading>Auto-reset points on cancellation</s-heading>
                    <s-text tone="subdued" variant="bodySm">
                        When ON, a customer&apos;s points balance resets to 0 automatically the moment their subscription
                        is cancelled. Lifetime points are never affected either way.
                    </s-text>
                </s-stack>
                <s-switch
                    ref={switchRef}
                    labelAccessibilityVisibility="exclusion"
                    label={enabled ? "On" : "Off"}
                    checked={enabled}
                    disabled={isSubmitting}
                    onChange={(e) => onChange(e.target.checked)}
                />
            </s-stack>

            <s-box paddingBlockStart="base">
                <s-divider />
            </s-box>

            <s-box paddingBlockStart="base">
                <s-stack direction="block" gap="small-300">
                    <s-heading>When you reset manually</s-heading>
                    <s-text tone="subdued" variant="bodySm">
                        Applies to Reset Now and bulk reset. A manual reset can happen days after the cancellation,
                        when the customer may have earned more points. The automatic reset happens at the moment of
                        cancellation, so this setting doesn&apos;t change it.
                    </s-text>
                    <s-choice-list
                        ref={modeRef}
                        name="manualResetMode"
                        label="When you reset manually"
                        labelAccessibilityVisibility="exclusive"
                        disabled={isSubmitting}
                        onChange={(e) => onModeChange(e.currentTarget.values?.[0])}
                    >
                        {MANUAL_RESET_MODE_OPTIONS.map((o) => (
                            <s-choice key={o.value} value={o.value} selected={manualResetMode === o.value} details={o.details}>
                                {o.label}{o.value === "FULL_BALANCE" ? " (default)" : ""}
                            </s-choice>
                        ))}
                    </s-choice-list>
                </s-stack>
            </s-box>
        </s-section>
    );
}

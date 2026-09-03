import { useEffect, useRef } from "react";

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
 */
export function SettingsCard({ enabled, isSubmitting, onChange }) {
    const switchRef = useRef(null);

    useEffect(() => {
        if (switchRef.current) switchRef.current.checked = enabled;
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
        </s-section>
    );
}

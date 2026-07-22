// =============================================================================
// loox-setup/components/CopyField.jsx
// Read-only value (URL, JSON body, header name...) with a one-click Copy
// button. Shows "Copied!" feedback for a couple seconds after a successful
// copy. `multiline` renders a monospace block (for the JSON body template)
// instead of a single-line value.
// =============================================================================

import { useState } from "react";

const COPIED_FEEDBACK_MS = 2000;

const MONO_STYLE = { fontFamily: "monospace", fontSize: 12.5, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 };

export function CopyField({ label, value, multiline = false }) {
    const [copied, setCopied] = useState(false);

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
        } catch {
            // Clipboard API unavailable/blocked (rare in an embedded admin
            // iframe) — the value is still fully visible and selectable,
            // so the merchant can still select-and-copy manually.
        }
    }

    return (
        <s-stack direction="block" gap="small-200">
            {label && <s-text tone="subdued">{label}</s-text>}
            <s-stack direction="inline" gap="small" alignItems="start">
                <s-box
                    padding="small-300"
                    background="subdued"
                    borderWidth="base"
                    borderColor="base"
                    borderRadius="base"
                >
                    {multiline ? (
                        <pre style={MONO_STYLE}>{value}</pre>
                    ) : (
                        <span style={MONO_STYLE}>{value}</span>
                    )}
                </s-box>
                <s-button variant="secondary" onClick={handleCopy}>
                    {copied ? "Copied!" : "Copy"}
                </s-button>
            </s-stack>
        </s-stack>
    );
}

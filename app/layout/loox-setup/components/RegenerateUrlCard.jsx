// =============================================================================
// loox-setup/components/RegenerateUrlCard.jsx
// Lets the merchant invalidate the current webhook URL and issue a new one
// — e.g. if they suspect it leaked. Requires re-pasting the new URL into
// their Flow workflow afterward, so this is framed as a deliberate,
// slightly-scary action rather than a casual button.
// =============================================================================

export function RegenerateUrlCard({ busy, onRegenerate }) {
    return (
        <s-section heading="Reset connection">
            <s-paragraph>
                If you think your webhook URL has been shared or exposed
                somewhere it shouldn't have been, you can generate a new one.
                Your existing Shopify Flow workflow will stop working until
                you update it with the new URL from this page.
            </s-paragraph>
            <s-box paddingBlockStart="base">
                <s-button variant="secondary" tone="critical" loading={busy} disabled={busy} onClick={onRegenerate}>
                    Generate a new URL
                </s-button>
            </s-box>
        </s-section>
    );
}

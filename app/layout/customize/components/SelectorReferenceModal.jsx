import { useMemo, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

import { COMMON_CSS_SELECTORS } from "../constants/customCssSelectors";
import { WIDGET_SELECTOR_GROUPS } from "../constants/widgetSelectors.generated";

// ─────────────────────────────────────────────────────────────────────────────
// SELECTOR REFERENCE MODAL (Custom CSS tab → "View selectors")
//
// "Most used": hand-picked selectors with descriptions
// (constants/customCssSelectors.js). "All selectors": every class in the
// widget's stylesheet, generated at widget build time
// (scripts/generate-widget-selectors.js), so it always matches the CSS.
// Read-only; Copy puts a selector on the clipboard.
// ─────────────────────────────────────────────────────────────────────────────

export const SELECTOR_MODAL_ID = "custom-css-selector-reference";

const CODE_STYLE = { fontFamily: "monospace", fontSize: 13, wordBreak: "break-all" };

const TOTAL = WIDGET_SELECTOR_GROUPS.reduce((n, g) => n + g.selectors.length, 0);

function CopyButton({ value, onCopy }) {
    return (
        <s-button variant="tertiary" accessibilityLabel={`Copy ${value}`} onClick={() => onCopy(value)}>
            Copy
        </s-button>
    );
}

function SelectorRow({ selector, description, onCopy }) {
    return (
        <s-grid gridTemplateColumns="minmax(0, 1fr) auto" gap="small" alignItems="center">
            <s-stack direction="block" gap="none">
                <span style={CODE_STYLE}>{selector}</span>
                {description && <s-text tone="subdued">{description}</s-text>}
            </s-stack>
            <CopyButton value={selector} onCopy={onCopy} />
        </s-grid>
    );
}

export function SelectorReferenceModal() {
    const shopify = useAppBridge();
    const [query, setQuery] = useState("");

    async function handleCopy(value) {
        try {
            await navigator.clipboard.writeText(value);
            shopify.toast.show(`Copied ${value}`);
        } catch {
            // Clipboard blocked (rare in the admin iframe) — the selector is
            // still on screen to select and copy by hand.
            shopify.toast.show("Couldn't copy — select the selector and copy it manually.", { isError: true });
        }
    }

    const q = query.trim().toLowerCase();

    const common = useMemo(
        () => (q ? COMMON_CSS_SELECTORS.filter((s) => s.selector.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)) : COMMON_CSS_SELECTORS),
        [q]
    );

    const groups = useMemo(() => {
        if (!q) return WIDGET_SELECTOR_GROUPS;
        return WIDGET_SELECTOR_GROUPS
            .map((g) => (g.label.toLowerCase().includes(q) ? g : { ...g, selectors: g.selectors.filter((s) => s.toLowerCase().includes(q)) }))
            .filter((g) => g.selectors.length > 0);
    }, [q]);

    const nothingFound = common.length === 0 && groups.length === 0;

    return (
        <s-modal id={SELECTOR_MODAL_ID} heading="CSS selectors" accessibilityLabel="CSS selectors" size="large">
            <s-stack direction="block" gap="base">
                <s-paragraph>
                    Use these in the Custom CSS box. They&apos;re already scoped to the Loyalty page and full screen,
                    so write them exactly as shown — for example <span style={CODE_STYLE}>.nbl-header__title {"{"} font-size: 22px; {"}"}</span>.
                </s-paragraph>

                <s-text-field
                    label="Search selectors"
                    labelAccessibilityVisibility="exclusive"
                    placeholder="Search, e.g. header, button, referral"
                    value={query}
                    onInput={(e) => setQuery(e.target.value)}
                    autocomplete="off"
                />

                {nothingFound && <s-paragraph>No selectors match &quot;{query}&quot;.</s-paragraph>}

                {common.length > 0 && (
                    <s-stack direction="block" gap="small">
                        <s-heading>Most used</s-heading>
                        {common.map((s) => (
                            <SelectorRow key={s.selector} selector={s.selector} description={s.description} onCopy={handleCopy} />
                        ))}
                    </s-stack>
                )}

                {groups.length > 0 && (
                    <s-stack direction="block" gap="small">
                        <s-divider />
                        <s-heading>All selectors ({TOTAL})</s-heading>
                        <s-text tone="subdued">
                            Every class in the widget&apos;s stylesheet, by area. Some only appear in certain states (for
                            example a reward being claimed).
                        </s-text>
                        {groups.map((g) => (
                            <s-stack key={g.label} direction="block" gap="small-300">
                                <s-text type="strong">{g.label}</s-text>
                                {g.selectors.map((sel) => (
                                    <SelectorRow key={sel} selector={sel} onCopy={handleCopy} />
                                ))}
                            </s-stack>
                        ))}
                    </s-stack>
                )}
            </s-stack>

            <s-button slot="primary-action" variant="primary" commandFor={SELECTOR_MODAL_ID} command="--hide">
                Done
            </s-button>
        </s-modal>
    );
}

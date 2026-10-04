import { CUSTOM_CSS_MAX_LENGTH } from "../constants/customCss";
import { SelectorReferenceModal, SELECTOR_MODAL_ID } from "./SelectorReferenceModal";

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM CSS PANEL (Custom CSS tab)
//
// Free-form CSS for the page block and full-screen widget only. Stored as
// widgetConfig.customCss through the normal config change → save bar flow,
// so dirty tracking / Discard / Save need nothing extra.
//
// Validation lives in constants/customCss.js and runs live (the `error`
// prop below) and again at save time + server-side. No maxLength on the
// field on purpose: it would silently truncate a long paste, whereas the
// error tells the merchant exactly what's wrong.
// ─────────────────────────────────────────────────────────────────────────────

const PLACEHOLDER = `/* Applies to the Loyalty page and full screen only */
.nbl-header__title { font-size: 22px; }
.nbl-nav__item { font-size: 15px; }`;

export function CustomCssPanel({ value, error, onChange, disabled }) {
    const length = value?.length ?? 0;

    return (
        <s-section>
            <s-stack direction="block" gap="base">
                <s-stack direction="block" gap="small-300">
                    <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
                        <s-heading>Custom CSS (page &amp; full screen)</s-heading>
                        <s-button icon="code" commandFor={SELECTOR_MODAL_ID} command="--show">
                            View selectors
                        </s-button>
                    </s-grid>
                    <s-paragraph>
                        Applies only to the Loyalty &amp; Rewards page block and the full-screen widget — never to
                        the small floating widget. You don&apos;t need to add any prefix; rules are scoped automatically
                        to elements inside the widget.
                    </s-paragraph>
                    <s-paragraph>
                        To style the widget box itself, start the rule with <code>&amp;</code> (for example{" "}
                        <code>&amp; {"{"} border-radius: 0; {"}"}</code>). To target only one of the two, use{" "}
                        <code>&amp;.nbl-widget-container--page</code> or <code>&amp;.nbl-widget-container--fullscreen</code>{" "}
                        before your selector. Custom CSS needs an up-to-date browser; older browsers ignore it and show
                        the default look.
                    </s-paragraph>
                </s-stack>

                <s-banner tone="info">
                    The live preview switches to full screen while you&apos;re on this tab and updates as you type.
                    Rules aimed only at the Loyalty page (<code>&amp;.nbl-widget-container--page</code>) show on your
                    live page, not in the preview.
                </s-banner>

                <s-banner tone="warning">
                    Custom CSS can break the widget&apos;s layout if it&apos;s wrong. Check the live page after saving,
                    and clear this box to go back to the default look.
                </s-banner>

                <s-text-area
                    label="Custom CSS"
                    rows={10}
                    placeholder={PLACEHOLDER}
                    value={value ?? ""}
                    error={error ?? undefined}
                    details={`${length.toLocaleString()} / ${CUSTOM_CSS_MAX_LENGTH.toLocaleString()} characters. Useful classes: .nbl-header__title, .nbl-header__points, .nbl-nav__item, .nbl-widget-body, .nbl-home-nav__item.`}
                    disabled={disabled}
                    onInput={(e) => onChange(e.target.value)}
                />
            </s-stack>
            <SelectorReferenceModal />
        </s-section>
    );
}

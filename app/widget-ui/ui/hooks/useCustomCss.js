// =============================================================================
// app/widget-ui/ui/hooks/useCustomCss.js
// Merchant custom CSS (Customize > Advanced > "Custom CSS (page & full
// screen)", stored as widgetConfig.customCss) -> a <style> in the shadow root.
//
// SCOPED to page + full screen: the merchant's rules are wrapped in a nested
// :is(.nbl-widget-container--page, .nbl-widget-container--fullscreen) block,
// so they can never touch the small floating widget, and the merchant doesn't
// have to prefix anything. Full screen is a class toggled at runtime on the
// same container, so the scope follows it with no extra wiring. The :is()
// also adds a class's worth of specificity, so overrides beat ui.css's base
// rules without !important.
//
// SAFETY: the same validateCustomCss() the admin form and action run. It
// matters here for one reason beyond defence in depth — an unbalanced "}"
// would close the scoping block early and let the remaining rules apply to
// the floating widget too. Invalid CSS is simply not applied. textContent
// (never innerHTML) means nothing in it can become markup.
//
// Reacts to widgetConfig changes, so the admin live preview (bridge
// setWidgetConfig) updates as the merchant types.
// =============================================================================

import { useEffect } from 'preact/hooks';
import { validateCustomCss } from '../../../layout/customize/constants/customCss.js';

var SCOPE = ':is(.nbl-widget-container--page, .nbl-widget-container--fullscreen)';

export function useCustomCss(css, hostEl) {
    useEffect(function () {
        var root = hostEl && hostEl.shadowRoot;
        if (!root) return;

        var styleEl = root.querySelector('style[data-nbl-custom-css]');
        var text = typeof css === 'string' ? css.trim() : '';

        if (!text || validateCustomCss(text)) {
            if (styleEl) styleEl.remove();
            return;
        }

        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.setAttribute('data-nbl-custom-css', '');
            // Appended last, after ui.css's <style>, so equal-specificity
            // rules from the merchant also win on source order.
            root.appendChild(styleEl);
        }
        styleEl.textContent = SCOPE + ' {\n' + text + '\n}';
    }, [css, hostEl]);
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM CSS — shared validation (client + server)
//
// Customize > Advanced > "Custom CSS (page & full screen)". Stored as
// widgetConfig.customCss, synced to the shop config metafield, and injected
// by the storefront widget into its shadow root, scoped to the page / full
// screen containers only (see app/widget-ui/ui/hooks/useCustomCss.js).
//
// The same validateCustomCss() runs in the browser before saving (inline
// error + toast, save blocked) and again in the action, so a crafted request
// can't store something the form would have refused.
//
// Client-safe: no server imports.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hard cap on stored length. The CSS travels inside the shop config JSON
 * metafield, which Shopify limits to 128KB from Admin API 2026-04 on; the
 * rest of that config is ~15KB today, so 10k characters leaves wide margin
 * and is far more than a page's worth of overrides needs.
 */
export const CUSTOM_CSS_MAX_LENGTH = 10000;

/**
 * Validates merchant-entered custom CSS.
 *
 * Rules:
 *  - must be a string, at most CUSTOM_CSS_MAX_LENGTH characters
 *  - no "</" and no "<!--": the config is emitted into a <script> tag on
 *    every storefront page (loyalty.liquid's `appConfig | json`), and those
 *    are the sequences that can end or derail a script element early. A
 *    plain "<" is allowed — media range syntax (`width < 750px`) and string
 *    content legitimately use it.
 *  - "{" and "}" balanced the way a CSS parser sees them: backslash escapes,
 *    "..." / '...' strings, /* comments *\/ and unquoted url(...) are all
 *    skipped, so a brace hidden in any of them doesn't count — and an
 *    escaped quote (\') can't be mistaken for the start of a string. A stray
 *    "}" would close the widget's page / full-screen scoping block early and
 *    let the rest apply to the floating widget. (The widget also re-checks
 *    the parsed result before applying — see useCustomCss.js.)
 *
 * @param {unknown} css
 * @returns {string|null} An error message for the merchant, or null if valid.
 */
export function validateCustomCss(css) {
    if (css == null || css === "") return null;
    if (typeof css !== "string") return "Custom CSS must be text.";

    if (css.length > CUSTOM_CSS_MAX_LENGTH) {
        return `Custom CSS is too long: ${css.length.toLocaleString()} of ${CUSTOM_CSS_MAX_LENGTH.toLocaleString()} characters allowed.`;
    }

    if (css.includes("</") || css.includes("<!--")) {
        return 'Custom CSS can\'t contain "</" or "<!--".';
    }

    let depth = 0;
    for (let i = 0; i < css.length; i++) {
        const ch = css[i];

        // Escape: the next character is literal (a CSS escape like \' or \}),
        // never a quote, brace or comment start.
        if (ch === "\\") {
            i++;
            continue;
        }

        if (ch === "/" && css[i + 1] === "*") {
            const close = css.indexOf("*/", i + 2);
            if (close === -1) return "Custom CSS has a comment that's never closed (missing */).";
            i = close + 1;
            continue;
        }

        if (ch === '"' || ch === "'") {
            let j = i + 1;
            while (j < css.length && css[j] !== ch) {
                if (css[j] === "\\") j++;
                else if (css[j] === "\n") return "Custom CSS has a text string that's never closed (missing quote).";
                j++;
            }
            if (j >= css.length) return "Custom CSS has a text string that's never closed (missing quote).";
            i = j;
            continue;
        }

        // Unquoted url(...): its contents are raw text up to ")".
        if ((ch === "u" || ch === "U") && /^url\(\s*[^"'\s)]/i.test(css.slice(i, i + 64))) {
            let j = css.indexOf("(", i) + 1;
            while (j < css.length && css[j] !== ")") {
                if (css[j] === "\\") j++;
                j++;
            }
            if (j >= css.length) return "Custom CSS has a url( that's never closed (missing ).";
            i = j;
            continue;
        }

        if (ch === "{") depth++;
        if (ch === "}") {
            depth--;
            if (depth < 0) return 'Custom CSS has a "}" without a matching "{".';
        }
    }
    if (depth > 0) return `Custom CSS is missing ${depth} closing "}".`;

    return null;
}

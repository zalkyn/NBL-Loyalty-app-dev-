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
 *  - no "<" at all: the config is emitted into a <script> tag on every
 *    storefront page (loyalty.liquid's `appConfig | json`), so "</script>"
 *    would end that tag early and let the rest run as HTML. CSS itself never
 *    needs "<" (the child combinator is ">").
 *  - "{" and "}" balanced (comments and quoted strings ignored), so one
 *    missing brace can't swallow every rule after it
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

    if (css.includes("<")) {
        return 'Custom CSS can\'t contain the "<" character.';
    }

    // Brace balance, skipping /* comments */ and "..." / '...' strings so a
    // brace inside content: "{" doesn't count.
    let depth = 0;
    for (let i = 0; i < css.length; i++) {
        const ch = css[i];
        if (ch === "/" && css[i + 1] === "*") {
            const end = css.indexOf("*/", i + 2);
            if (end === -1) return "Custom CSS has a comment that's never closed (missing */).";
            i = end + 1;
            continue;
        }
        if (ch === '"' || ch === "'") {
            let j = i + 1;
            while (j < css.length && css[j] !== ch) {
                if (css[j] === "\\") j++;
                j++;
            }
            if (j >= css.length) return "Custom CSS has a text string that's never closed (missing quote).";
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

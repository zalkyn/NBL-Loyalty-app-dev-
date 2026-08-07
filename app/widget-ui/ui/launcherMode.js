// =============================================================================
// app/widget-ui/ui/launcherMode.js
// Mirrors the launcher's non-CSS config values from the cssVars payload onto
// the shadow host as data-* attributes.
//
// WHY THIS EXISTS
// --nbl-launcher-compact and --nbl-launcher-badge look like CSS custom
// properties and are stored/transported as such, but nothing in ui.css can
// actually read them: their job is to switch whole rule sets on and off, and
// a custom property can only supply a value to a property that is already
// being declared. --nbl-launcher-position and --nbl-launcher-icon have the
// same shape and the same limitation — they're config values riding on the
// cssVars payload for convenience, and each is translated into something CSS
// or Preact can act on at the point of use.
//
// Those two are handled inside App.jsx because they feed component state.
// These two feed CSS selectors instead, so they land on the host element as
// attributes and the stylesheet keys off :host([data-nbl-compact="..."]).
//
// Kept in its own module rather than in utils.js (which is documented as
// "no side effects, no DOM") and rather than inline in both call sites: it
// runs once at boot from main.preact.jsx and again on every live-preview
// cssVars message from App.jsx, and two copies of the parsing/validation
// below is exactly the kind of duplication that drifts.
// =============================================================================

// Allow-lists, not free-form pass-through. The values reach here from a
// merchant-editable config blob, and writing an unvalidated string into a DOM
// attribute that a stylesheet keys off means a typo (or a stale value from an
// older app version) silently produces a launcher that matches no rule at all.
// Falling back to the documented default instead means the worst case is
// "the merchant's setting didn't apply", not "the button rendered wrong".
const COMPACT_MODES = ['never', 'mobile', 'always'];
const BADGE_MODES = ['count', 'dot', 'none'];

// cssVars values for this family arrive single-quoted (e.g. "'mobile'"), the
// same convention --nbl-launcher-icon uses — see cssVarsConfig.js's
// parseValue/displayValue pair for that field.
function unquote(v) {
    return typeof v === 'string' ? v.replace(/^'|'$/g, '').trim().toLowerCase() : '';
}

function pick(value, allowed, fallback) {
    const v = unquote(value);
    return allowed.indexOf(v) !== -1 ? v : fallback;
}

/**
 * Writes data-nbl-compact / data-nbl-badge onto the shadow host.
 *
 * Always writes both, including when the incoming vars are missing or
 * unrecognised — the attributes are then set to their defaults rather than
 * left at whatever a previous call put there. That matters for the live
 * preview, where "Reset all" sends a cssVars payload with these keys absent
 * and the launcher has to go back to the default look, not keep the last
 * value the merchant tried.
 *
 * @param {HTMLElement} host      shadow host element
 * @param {object}      cssVars   the --nbl-* payload (may be null/partial)
 */
export function applyLauncherModeAttrs(host, cssVars) {
    if (!host || typeof host.setAttribute !== 'function') return;
    const vars = cssVars && typeof cssVars === 'object' ? cssVars : {};

    host.setAttribute('data-nbl-compact', pick(vars['--nbl-launcher-compact'], COMPACT_MODES, 'never'));
    host.setAttribute('data-nbl-badge', pick(vars['--nbl-launcher-badge'], BADGE_MODES, 'count'));
}

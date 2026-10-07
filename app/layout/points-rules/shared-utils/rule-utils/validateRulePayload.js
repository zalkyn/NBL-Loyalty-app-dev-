// ─────────────────────────────────────────────────────────────────────────────
// Server-side checks for the points-rule actions (order / referral / review).
//
// The forms validate before submitting, but until now the actions trusted
// whatever arrived — a stale tab, a browser quirk or a hand-made request
// could store a rule with 0 or negative points, so customers would silently
// earn nothing. These run the SAME validate() the form uses (each route's
// ./_data.js) on the submitted payload, which carries the form's own
// event-specific key ({ order } / { referral } / { review }), so the two
// can't drift apart.
// ─────────────────────────────────────────────────────────────────────────────

const INVALID_PAYLOAD = "Invalid rule data. Please reload the page and try again.";

/**
 * JSON.parse that returns null instead of throwing — a malformed payload
 * should come back as an error message, not take the page down.
 *
 * @param {string|null} raw
 * @returns {Object|null}
 */
export function parseRulePayload(raw) {
    try {
        const value = JSON.parse(raw || "{}");
        return value && typeof value === "object" ? value : null;
    } catch {
        return null;
    }
}

/**
 * @param {function(Object): Object} validate - The route's form validator.
 * @param {Object|null} payload
 * @returns {string|null} The first validation message, or null if valid.
 */
export function validateRulePayload(validate, payload) {
    if (!payload) return INVALID_PAYLOAD;
    try {
        const errors = validate(payload) || {};
        return Object.values(errors).find(Boolean) || null;
    } catch {
        // validate() reads nested fields (payload.order.rate.points…) — a
        // payload missing them is malformed, not a validation message.
        return INVALID_PAYLOAD;
    }
}

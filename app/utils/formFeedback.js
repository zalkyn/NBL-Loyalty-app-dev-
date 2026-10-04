// =============================================================================
// app/utils/formFeedback.js
// What a form tells the user when Save is clicked but validation fails.
//
// Field errors alone aren't enough since the Save button moved to Shopify's
// contextual save bar at the top of the admin: the field that failed can be
// far down the page, so a click that "does nothing" looked broken. This adds
// an error toast saying how many fields need fixing, and scrolls the first
// field showing an error into view.
//
// Wired in through useFormState's `onInvalid` option:
//   useFormState(data, buildFormShape, {
//       validate,
//       onInvalid: (errors) => notifyInvalidForm(shopify, errors),
//   });
// =============================================================================

/**
 * Polaris web-component fields that render an `error` attribute. React sets
 * a string prop on a custom element as an attribute, so a field currently
 * showing an error matches `[error]`.
 */
const FIELD_ERROR_SELECTOR = [
    "s-text-field", "s-number-field", "s-text-area", "s-select", "s-money-field",
    "s-email-field", "s-url-field", "s-password-field", "s-date-field",
    "s-choice-list", "s-checkbox", "s-switch", "s-color-field", "s-drop-zone",
].map((tag) => `${tag}[error]`).join(", ");

/**
 * Counts the leaf error messages in an errors object, flat
 * ({ "a.b": "msg" }) or nested ({ a: { b: "msg" } }).
 *
 * @param {Object} errors
 * @returns {number}
 */
export function countErrors(errors) {
    if (!errors || typeof errors !== "object") return 0;
    let n = 0;
    for (const value of Object.values(errors)) {
        if (value && typeof value === "object") n += countErrors(value);
        else if (value) n += 1;
    }
    return n;
}

/**
 * Scrolls the first field showing an error into view and focuses it. Runs
 * after two animation frames so the re-render that adds the error
 * attributes has been committed.
 */
export function scrollToFirstFieldError() {
    if (typeof document === "undefined" || typeof requestAnimationFrame === "undefined") return;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const el = document.querySelector(FIELD_ERROR_SELECTOR);
            if (!el) return;
            el.scrollIntoView?.({ behavior: "smooth", block: "center" });
            el.focus?.();
        });
    });
}

/**
 * Error toast + scroll to the first error, for a Save that failed validation.
 *
 * @param {{ toast: { show: Function } }} shopify - App Bridge global (useAppBridge())
 * @param {Object} errors
 */
export function notifyInvalidForm(shopify, errors) {
    const n = countErrors(errors) || 1;
    shopify?.toast?.show(`Please fix ${n} field${n === 1 ? "" : "s"} before saving.`, { isError: true });
    scrollToFirstFieldError();
}

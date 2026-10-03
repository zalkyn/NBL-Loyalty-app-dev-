/**
 * @fileoverview SaveBar — Shopify's contextual save bar (App Bridge).
 *
 * Wraps App Bridge's `SaveBar` (the `ui-save-bar` element) so pages keep
 * the same props they used with the previous in-app floating bar. The bar
 * is rendered by the Shopify admin itself, in its top bar outside the app
 * iframe — so admin UI such as the Sidekick input can no longer cover it,
 * which is why the custom bottom-center bar was replaced.
 *
 * While it is showing, the admin also asks the merchant to confirm before
 * navigating away from the app with unsaved changes.
 *
 * Limitations of the official bar (per @shopify/app-bridge-types):
 *   - Only two buttons: Save (variant="primary") and Discard (no variant).
 *   - No custom message text, icon, position or styling — `message`,
 *     `position`, `icon`, `variant` and `className` are accepted for
 *     backwards compatibility and ignored.
 *
 * @example
 *   <SaveBar
 *     visible={isDirty}
 *     primaryLabel="Save"
 *     secondaryLabel="Discard"
 *     onPrimary={handleSave}
 *     onSecondary={handleDiscard}
 *     loading={saving}
 *   />
 *
 * @module SaveBar
 */

import { useCallback, useId } from "react";
import { SaveBar as AppBridgeSaveBar } from "@shopify/app-bridge-react";

/**
 * @param {object}   props
 * @param {boolean}  props.visible                 Show / hide the save bar.
 * @param {string}   [props.primaryLabel="Save"]   Save button label.
 * @param {string}   [props.secondaryLabel="Discard"] Discard button label.
 * @param {function} [props.onPrimary]             Fired when Save is clicked.
 * @param {function} [props.onSecondary]           Fired when Discard is clicked (after confirmation, if enabled).
 * @param {boolean}  [props.loading=false]         Shows a spinner on Save and disables both buttons.
 * @param {boolean}  [props.disabled=false]        Disables both buttons.
 * @param {boolean}  [props.discardConfirmation=true]
 *   Ask the merchant to confirm before discarding. On by default so an
 *   accidental Discard click can't throw away their changes.
 */
export function SaveBar({
    visible = false,
    primaryLabel = "Save",
    secondaryLabel = "Discard",
    onPrimary,
    onSecondary,
    loading = false,
    disabled = false,
    discardConfirmation = true,
}) {
    // App Bridge identifies save bars by id — useId keeps each instance
    // unique; colons stripped so the id is also a plain, selector-safe string.
    const id = `app-save-bar-${useId().replace(/:/g, "")}`;

    // discardConfirmation is set as a DOM property (the element exposes a
    // getter/setter for it) rather than a JSX attribute — React 18 doesn't
    // reliably reflect boolean props onto custom elements.
    const saveBarRef = useCallback((el) => {
        if (el) el.discardConfirmation = discardConfirmation;
    }, [discardConfirmation]);

    return (
        <AppBridgeSaveBar id={id} open={visible} ref={saveBarRef}>
            {/* Boolean `loading` is passed as an empty-string attribute —
                React 18 drops `true` for non-standard attributes on <button>. */}
            <button
                variant="primary"
                onClick={onPrimary}
                loading={loading ? "" : undefined}
                disabled={disabled || loading}
            >
                {primaryLabel}
            </button>
            <button onClick={onSecondary} disabled={disabled || loading}>
                {secondaryLabel}
            </button>
        </AppBridgeSaveBar>
    );
}

export default SaveBar;

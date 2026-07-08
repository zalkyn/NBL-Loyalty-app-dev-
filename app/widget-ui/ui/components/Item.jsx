// =============================================================================
// modules/components/Item.jsx
// Generic clickable "card" shell — reusable for every item in the widget
// (reward item, points item, prize item, active reward item, prize claim
// item, etc). All of these are the SAME visual component; the only layout
// distinction is `variant` ("card" bordered vs "row" flush/divided). Hover,
// spacing, and state styling come entirely from the shared .nbl-item CSS —
// no per-context flags, no per-context classes.
// =============================================================================

import { h } from 'preact';

export function Item({
    variant = 'card',
    selfSpaced = false,
    active,
    leading,
    content,
    trailing,
    onClick,
    extraClass,
    dataAttrs,
}) {
    const stateClass = active === true ? ' active' : active === false ? ' inactive' : '';

    const variantClass = variant === 'row' ? ' nbl-item--row' : ' nbl-item--card';

    const classes =
        'nbl-item' +
        variantClass +
        (selfSpaced ? ' nbl-item--self-spaced' : '') +
        stateClass +
        (extraClass ? ' ' + extraClass : '');

    return (
        <div class={classes} onClick={onClick} {...(dataAttrs || {})}>
            {leading}
            {content}
            {trailing}
        </div>
    );
}

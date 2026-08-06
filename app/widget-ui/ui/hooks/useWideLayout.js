// =============================================================================
// app/widget-ui/ui/hooks/useWideLayout.js
//
// "Is this widget wide enough for the multi-column layout?" — measured from
// the element itself, not from the viewport.
//
// WHY NOT A MEDIA QUERY
// Page mode's width is a merchant setting. A widget set to 400px on a 1600px
// monitor is narrow, and a viewport media query would confidently tell it
// otherwise — which is how the Home shortcuts ended up as three ~100px
// columns with labels breaking mid-word ("Brows / e Rewar / ds").
//
// WHY NOT A CSS CONTAINER QUERY
// That is the textbook answer and it cannot be used here. `container-type:
// inline-size` applies inline-size containment, which makes the element's
// intrinsic width resolve as if it had no contents at all. Theme sections
// routinely leave this block's ancestors shrink-to-fit — sized BY their
// contents — so containment zeroed the only input those ancestors had and the
// whole widget collapsed to a 0px-wide sliver. Containment also makes the
// element a containing block for fixed-position descendants, which would trap
// the notification sheet and image preview that are fixed precisely so they
// can escape a tall block.
//
// So: measure. A ResizeObserver on the container costs one callback per
// resize, has no layout side effects whatsoever, and answers the same
// question a container query would have.
// =============================================================================

import { useState, useEffect } from 'preact/hooks';

// Where three shortcut cards stop being cramped. Below this the base
// 390px-panel layout is already correct and is simply left alone.
const WIDE_THRESHOLD_PX = 620;

/**
 * @param {object}  ref     - ref to the widget container element
 * @param {boolean} enabled - only page mode needs this; floating is always
 *                            narrow and full screen is always wide, both
 *                            statically known, so neither pays for an observer
 * @returns {boolean} true when the container is at least WIDE_THRESHOLD_PX wide
 */
export function useWideLayout(ref, enabled) {
    const [isWide, setIsWide] = useState(false);

    useEffect(function () {
        if (!enabled) {
            // Reset rather than leave the last measurement behind: mode can't
            // change today, but a stale `true` here would silently apply the
            // wide layout to a 390px floating panel if it ever could.
            setIsWide(false);
            return;
        }
        const el = ref.current;
        if (!el) return;

        function measure(width) {
            // setState with the same value is a no-op in Preact, so this is
            // safe to call on every observer tick — no re-render unless the
            // answer actually changed.
            setIsWide(width >= WIDE_THRESHOLD_PX);
        }

        measure(el.getBoundingClientRect().width);

        if (typeof ResizeObserver === 'undefined') {
            // Old browser: fall back to the viewport. Wrong for a narrow
            // widget on a wide screen, but that's the pre-existing behaviour
            // and strictly better than never applying the wide layout at all.
            const onResize = function () { measure(window.innerWidth); };
            onResize();
            window.addEventListener('resize', onResize);
            return function () { window.removeEventListener('resize', onResize); };
        }

        const observer = new ResizeObserver(function (entries) {
            if (!entries.length) return;
            measure(entries[0].contentRect.width);
        });
        observer.observe(el);
        return function () { observer.disconnect(); };
    }, [enabled]);

    return isWide;
}

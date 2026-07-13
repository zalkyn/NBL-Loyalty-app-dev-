// =============================================================================
// modules/components/Nav.jsx
// Nav rail — purono html.js-er navHTML + widget.js Section 5/8b-er replacement.
// =============================================================================

import { h } from 'preact';
import { useRef, useEffect } from 'preact/hooks';
import { useNavChevrons } from '../hooks/useNavChevrons.js';

const NAV_ITEMS = [
    { key: 'home', labelKey: 'navHome' },
    { key: 'points', labelKey: 'navEarn' },
    { key: 'rewards', labelKey: 'navRewards' },
    { key: 'prizes', labelKey: 'navPrizes' },
    { key: 'referral', labelKey: 'navReferral', fallback: 'Referral' },
    { key: 'activities', labelKey: 'navActivity' },
    { key: 'active-rewards', labelKey: 'navMyRewards' },
    { key: 'my-prizes', labelKey: 'navMyPrizes' },
];

export function Nav({ activeTab, onChange, lbl }) {
    const scrollRef = useRef(null);
    const { atStart, atEnd, scrollBy } = useNavChevrons(scrollRef, activeTab);

    const showChevrons = NAV_ITEMS.length > 3;

    useEffect(() => {
        const scrollEl = scrollRef.current;
        if (!scrollEl) return;
        const activeEl = scrollEl.querySelector('[data-nav="' + activeTab + '"]');
        if (!activeEl) return;
        const itemCenter = activeEl.offsetLeft + activeEl.offsetWidth / 2;
        const scrollCenter = scrollEl.clientWidth / 2;
        scrollEl.scrollTo({ left: Math.max(0, itemCenter - scrollCenter), behavior: 'smooth' });
    }, [activeTab]);

    // Mouse-wheel over the nav rail scrolls it horizontally instead of the
    // page scrolling vertically — a native `wheel` listener is required for
    // this (there's no CSS-only way to remap scroll axis), and it's scoped
    // to exactly this element, so it only ever applies while the pointer is
    // actually over the nav — everywhere else in the widget scrolls
    // normally. Only intercepts the event when there's real horizontal
    // overflow to scroll (nav fits without it on most stores with 3 tabs),
    // so hovering a non-scrollable nav never blocks the page's own scroll.
    //
    // IMPORTANT: this container has `scroll-snap-type: x mandatory` and
    // `scroll-behavior: smooth` in ui.css (same as the chevron buttons and
    // the activeTab-centering effect above both already rely on). An
    // earlier version of this effect wrote directly to `scrollLeft` on
    // every animation frame to get a custom eased motion — that fights the
    // browser's own snap-point tracking when it's actively re-settling the
    // container, and could leave the whole element stuck (not just to wheel
    // input — to the chevron buttons' scrollBy() too, since they share the
    // same snap state). Batching wheel deltas into a single native
    // `scrollBy({behavior:'smooth'})` call instead — same API the chevrons
    // already use successfully — avoids that fight entirely: the browser's
    // own smooth+snap animation handles the motion, we just decide when and
    // how far to ask it to move.
    useEffect(() => {
        const scrollEl = scrollRef.current;
        if (!scrollEl) return;

        let pending = 0;
        let flushTimer = null;

        function flush() {
            flushTimer = null;
            if (pending === 0) return;
            scrollEl.scrollBy({ left: pending, behavior: 'smooth' });
            pending = 0;
        }

        function onWheel(e) {
            const maxScroll = scrollEl.scrollWidth - scrollEl.clientWidth;
            if (maxScroll <= 0) return; // nothing to scroll
            // Prefer deltaX when the input device already sends horizontal
            // motion (e.g. a trackpad swipe) — fall back to deltaY for a
            // standard vertical mouse wheel, the common case this is for.
            const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            if (delta === 0) return;
            e.preventDefault();
            // Accumulate rapid wheel ticks and flush as one scrollBy shortly
            // after they stop — calling scrollBy on every single tick would
            // restart the browser's smooth-scroll animation each time,
            // producing the same stutter a naive per-event scrollBy has.
            pending += delta;
            if (flushTimer === null) {
                flushTimer = setTimeout(flush, 60);
            }
        }

        scrollEl.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            scrollEl.removeEventListener('wheel', onWheel);
            if (flushTimer !== null) clearTimeout(flushTimer);
        };
    }, []);

    return (
        <div class="nbl-nav">
            <button
                class={`nbl-nav__chevron${!showChevrons ? ' hidden' : ''}${showChevrons && atStart ? ' disabled' : ''}`}
                aria-label="Scroll nav left"
                disabled={showChevrons && atStart}
                onClick={() => scrollBy(-100)}
                dangerouslySetInnerHTML={{
                    __html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
                }}
            />
            <div class="nbl-nav__scroll" ref={scrollRef}>
                {NAV_ITEMS.map((item) => (
                    <button
                        key={item.key}
                        class={`nbl-nav__item${activeTab === item.key ? ' active' : ''}`}
                        data-nav={item.key}
                        role="tab"
                        onClick={() => onChange(item.key)}
                    >
                        {lbl(item.labelKey) || item.fallback || item.key}
                    </button>
                ))}
            </div>
            <button
                class={`nbl-nav__chevron${!showChevrons ? ' hidden' : ''}${showChevrons && atEnd ? ' disabled' : ''}`}
                aria-label="Scroll nav right"
                disabled={showChevrons && atEnd}
                onClick={() => scrollBy(100)}
                dangerouslySetInnerHTML={{
                    __html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
                }}
            />
        </div>
    );
}

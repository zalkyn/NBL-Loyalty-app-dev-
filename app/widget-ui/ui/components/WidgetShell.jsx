// =============================================================================
// app/widget-ui/ui/components/WidgetShell.jsx
// Widget container + scroll wrapper + header + body — purono html.js-er
// widgetHTML structure-er replacement.
// =============================================================================

import { h } from 'preact';
import { useRef } from 'preact/hooks';
import { Header } from './Header.jsx';
import { useCompactHeader } from '../hooks/useCompactHeader.js';
import { useWideLayout } from '../hooks/useWideLayout.js';

export function WidgetShell({ isOpen, isLoggedIn, customerName, points, position, activeTab, onNavChange, onClose, lbl, pointsPending, navConfig, mode, showFullscreenToggle, onToggleFullscreen, pageHref, onPageLinkClick, children, notificationSlot, previewSlot, provisionSlot, updateBannerSlot }) {
    const wrapperRef = useRef(null);
    const containerRef = useRef(null);
    const scrolledCompact = useCompactHeader(wrapperRef);
    // 'floating' | 'fullscreen' | 'page'.
    const effectiveMode = mode || 'floating';
    const isPage = effectiveMode === 'page';
    // The compact header exists to claw back vertical space in a 520px panel,
    // where the greeting would otherwise eat a tenth of the visible area. In
    // full screen there's no shortage of height, so collapsing the greeting on
    // scroll just makes the customer lose track of whose account they're
    // looking at. Page mode has no shortage of height either, AND its wrapper
    // doesn't scroll at all (the page does — see ui.css's --page block), so
    // the hook could never fire there in the first place; gating on
    // 'floating' rather than listing the two exclusions keeps this correct
    // for any future mode by default. The hook still runs unconditionally
    // (hooks can't be called behind a branch) — only its result is ignored.
    const compact = scrolledCompact && effectiveMode === 'floating';
    // Page mode's width is a merchant setting, so whether the multi-column
    // layout fits can only be answered by measuring. Floating is always narrow
    // and full screen always wide — both statically known, so neither pays for
    // an observer. See useWideLayout.js for why this isn't a container query.
    const isWide = useWideLayout(containerRef, isPage);

    return (
        <div
            ref={containerRef}
            class={`nbl-widget-container nbl-widget-container--${effectiveMode}${isWide ? ' nbl-page-wide' : ''}${isOpen ? ' active' : ''} pos-${position}`}
            // Page mode is a labelled landmark in someone else's document, so
            // screen reader users can find it and know what it is among the
            // merchant's own page sections. The floating panel needs neither:
            // it's an overlay the customer just opened on purpose.
            //
            // Deliberately NOT aria-live: this region contains a points
            // balance that updates on claim, a background resync indicator
            // and whole tabs that swap out — a live region here would
            // announce all of it, continuously. Tab state is conveyed where
            // it belongs instead, on the tabs themselves (Nav.jsx's
            // aria-selected).
            role={isPage ? 'region' : undefined}
            aria-label={isPage ? (lbl('launcherTitle') || 'Loyalty & Rewards') : undefined}
        >
            <div class="nbl-widget-scroll-area">
                <div class="nbl-widget-wrapper" ref={wrapperRef}>
                    <div class="nbl-sticky-top">
                        <Header
                            isLoggedIn={isLoggedIn}
                            customerName={customerName}
                            points={points}
                            compact={compact}
                            activeTab={activeTab}
                            onNavChange={onNavChange}
                            onClose={onClose}
                            lbl={lbl}
                            pointsPending={pointsPending}
                            navConfig={navConfig}
                            mode={effectiveMode}
                            showFullscreenToggle={showFullscreenToggle}
                            isFullscreen={effectiveMode === 'fullscreen'}
                            onToggleFullscreen={onToggleFullscreen}
                            pageHref={pageHref}
                            onPageLinkClick={onPageLinkClick}
                        />
                        {/* Sits inside the same sticky wrapper as the header,
                            so it stays pinned right below it as tab content
                            scrolls underneath — can't be missed or scrolled
                            past. One place to implement, automatically
                            visible regardless of which tab is active. */}
                        {updateBannerSlot}
                    </div>
                    {/* Guest body full-bleed — no .nbl-widget-body side padding.
                        Logged-in tabs keep the padded body as before. Mixing the
                        two in one wrapper caused the guest hero/orbs to render
                        with an extra 14px gap on the sides (right-edge "padding"
                        bug) and clipped the decorative orb circles at that edge. */}
                    {isLoggedIn ? (
                        <div class="nbl-widget-body">
                            <div>{children}</div>
                        </div>
                    ) : (
                        children
                    )}
                </div>
            </div>
            {/* notification-er positioning context eta-i — onClick overlay, claim panel,
                shob eই container-er bhitorে thakar kotha (age html.js-eo eikhane chilo) */}
            <div class="nbl-notification-slot" id="nbl-notification-wrapper">
                {notificationSlot}
            </div>
            {/* image preview-o eki convention follow kore — notification-er moto
                shei container-er bhitore-i absolute sibling, alada z-index-e stack hoy */}
            {previewSlot}
            {/* provision overlay — pura widget cover kore rakhe jotokkhon silent
                customer-provisioning চলে। Highest z-index, sob kichur upore. */}
            {provisionSlot}
        </div>
    );
}
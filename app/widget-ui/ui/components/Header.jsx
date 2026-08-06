// =============================================================================
// app/widget-ui/ui/components/Header.jsx
// Header-top (title+points / guest title) + Nav — purono html.js headerTopHTML
// + navHTML-er replacement. compact prop -> useCompactHeader hook theke ashe.
// =============================================================================

import { h, Fragment } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { Nav } from './Nav.jsx';
import { Heading } from './Heading.jsx';
import { Button } from './Button.jsx';
import { Icon } from './Icon.jsx';
import { Text } from './Text.jsx';
import { usePointsBump } from '../hooks/usePointsBump.js';
import { formatNumber } from '../utils.js';

export function Header({ isLoggedIn, customerName, points, compact, activeTab, onNavChange, onClose, lbl, pointsPending, navConfig, mode, showFullscreenToggle, isFullscreen, onToggleFullscreen, pageHref, onPageLinkClick }) {
    // In page mode the widget IS the page — there's nothing to close it back
    // into and nothing bigger to expand it to, so both corner controls go.
    // App.jsx already guarantees showFullscreenToggle/pageHref are falsy
    // there; this is the second half of the same decision, kept here so the
    // close button (which App.jsx says nothing about) is handled in the same
    // place and by the same rule.
    const isPage = mode === 'page';
    const bump = usePointsBump(points);
    const [ready, setReady] = useState(false);

    // Purono code: requestAnimationFrame(() => requestAnimationFrame(() => add class))
    // Eta deliberately ekta frame wait kore, jate CSS entrance transition skip na hoy.
    useEffect(() => {
        const raf1 = requestAnimationFrame(() => {
            requestAnimationFrame(() => setReady(true));
        });
        return () => cancelAnimationFrame(raf1);
    }, []);

    const titleTemplate = isLoggedIn ? (lbl('headerLabel') || 'Welcome, [name]') : '';
    const [titleBefore, titleAfter] = titleTemplate.split('[name]');

    const pointsLabelTemplate = lbl('pointsLabel') || '[points] pts';
    const [ptsBefore, ptsAfter] = pointsLabelTemplate.split('[points]');

    return (
        <div class={`nbl-header${compact ? ' compact' : ''}${ready ? ' ready' : ''}${isLoggedIn ? '' : ' nbl-header--standalone'}`}>
            {/* A real anchor, not a button with a location assignment:
                middle-click, cmd/ctrl-click, "open in new tab" and "copy
                link address" are all things customers genuinely do with a
                control that navigates, and all of them silently do nothing
                on a <button>. It carries the current tab (App.jsx builds the
                href), so expanding from Rewards lands on Rewards. */}
            {!isPage && pageHref && (
                <a
                    class="nbl-button--bare-reset nbl-header__expand nbl-header__expand--link"
                    href={pageHref}
                    onClick={onPageLinkClick}
                    aria-label={lbl('expandToPageAria') || 'Open the full rewards page'}
                >
                    <Icon name="open-page" px={13} />
                </a>
            )}
            {!isPage && showFullscreenToggle && (
                <Button
                    bare
                    extraClass="nbl-header__expand"
                    aria-label={isFullscreen ? 'Exit full screen' : 'Expand to full screen'}
                    onClick={onToggleFullscreen}
                >
                    <Icon name={isFullscreen ? 'collapse' : 'expand'} px={13} />
                </Button>
            )}
            {!isPage && (
            <Button bare extraClass="nbl-header__close" aria-label="Close" onClick={onClose}>
                <span
                    class="nbl-icon"
                    style={{ '--nbl-icon-size-override': '13px' }}
                    dangerouslySetInnerHTML={{
                        __html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
                    }}
                />
            </Button>
            )}
            <div>
                <div class="nbl-header__top">
                    {isLoggedIn ? (
                        <>
                            <Heading as="h3" bare extraClass="nbl-header__title">
                                {titleBefore}
                                {customerName}
                                {titleAfter || ''}
                            </Heading>
                            <div class={`nbl-header__points${bump ? ' bump' : ''}`}>
                                {pointsPending ? (
                                    // Same rule, same visual language as
                                    // LauncherButton.jsx — see App.jsx's
                                    // pointsPending for why this and the
                                    // launcher button now always agree
                                    // instead of one hiding the number and
                                    // the other showing it with just a
                                    // small dot next to it.
                                    <span class="nbl-spinner nbl-spinner--sync" aria-label="Updating" />
                                ) : (
                                    <>
                                        {ptsBefore}
                                        <Text as="span" bare extraClass="nbl-customer-points">{formatNumber(points)}</Text>
                                        {ptsAfter || ''}
                                    </>
                                )}
                            </div>
                        </>
                    ) : (
                        <Heading as="h3" bare extraClass="nbl-header__title">NBL Loyalty Program</Heading>
                    )}
                </div>
                {isLoggedIn && <Nav activeTab={activeTab} onChange={onNavChange} lbl={lbl} navConfig={navConfig} />}
            </div>
        </div>
    );
}
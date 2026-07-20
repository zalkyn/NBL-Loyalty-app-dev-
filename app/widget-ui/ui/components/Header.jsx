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
import { Text } from './Text.jsx';
import { usePointsBump } from '../hooks/usePointsBump.js';
import { formatNumber } from '../utils.js';

export function Header({ isLoggedIn, customerName, points, compact, activeTab, onNavChange, onClose, lbl, pointsPending }) {
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
            <Button bare extraClass="nbl-header__close" aria-label="Close" onClick={onClose}>
                <span
                    class="nbl-icon"
                    style={{ '--nbl-icon-size-override': '13px' }}
                    dangerouslySetInnerHTML={{
                        __html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
                    }}
                />
            </Button>
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
                {isLoggedIn && <Nav activeTab={activeTab} onChange={onNavChange} lbl={lbl} />}
            </div>
        </div>
    );
}

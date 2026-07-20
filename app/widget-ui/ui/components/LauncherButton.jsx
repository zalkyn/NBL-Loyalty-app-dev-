// =============================================================================
// app/widget-ui/ui/components/LauncherButton.jsx
// Floating open/close button — purono html.js-er btnHTML replacement.
// =============================================================================

import { h, Fragment } from 'preact';
import { launcherIcon } from '../icons.js';
import { Button } from './Button.jsx';
import { Text } from './Text.jsx';
import { formatNumber } from '../utils.js';

export function LauncherButton({ isLoggedIn, points, pointsPending, position, launcherIconName, onClick, lbl }) {
    // Defense in depth: every other lbl() call site in the widget has a
    // matching hardcoded fallback (see GuestPanel.jsx, JoinProgramPanel.jsx,
    // etc.) — these two were the one place that didn't, so a widgetConfig
    // missing/empty `labels` object (e.g. this exact class of bug — see
    // _action.server.js's handleResetAll/handleClearAll comments) rendered
    // a bare icon with no title text at all, and "0" with no "pts" suffix.
    const subtitleTemplate = lbl('launcherSubtitle') || '[points] pts';
    const [subBefore, subAfter] = subtitleTemplate.split('[points]');

    return (
        <div class={`nbl-launcher pos-${position}`}>
            <Button
                bare
                extraClass={`nbl-launcher__button${isLoggedIn ? '' : ' guest'}`}
                aria-label="Open loyalty widget"
                onClick={onClick}
            >
                <div class="nbl-launcher__icon" dangerouslySetInnerHTML={{ __html: launcherIcon(launcherIconName) }} />
                <div class="nbl-launcher__label">
                    <Text as="span" bare extraClass="nbl-launcher__title">{lbl('launcherTitle') || 'Loyalty & Rewards'}</Text>
                    {isLoggedIn && (
                        <Text as="span" bare extraClass="nbl-launcher__sub">
                            {pointsPending ? (
                                // Points intentionally NOT shown — an
                                // update banner is waiting on a click, or a
                                // resync is actively running, so the
                                // number on screen could be seconds away
                                // from changing. A small spinner (same
                                // visual language as the header's own sync
                                // indicator — see ui.css's
                                // .nbl-header__sync-indicator) reads as
                                // "something's updating" instead of
                                // silently showing a figure that might
                                // already be wrong.
                                <span class="nbl-spinner nbl-spinner--sync nbl-launcher__sync-spinner" aria-label="Updating" />
                            ) : (
                                <>
                                    {subBefore}
                                    <Text as="span" bare extraClass="nbl-customer-points">{formatNumber(points)}</Text>
                                    {subAfter || ''}
                                </>
                            )}
                        </Text>
                    )}
                </div>
            </Button>
        </div>
    );
}

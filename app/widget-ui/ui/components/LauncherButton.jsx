// =============================================================================
// app/widget-ui/ui/components/LauncherButton.jsx
// Floating open/close button — purono html.js-er btnHTML replacement.
// =============================================================================

import { h, Fragment } from 'preact';
import { launcherIcon } from '../icons.js';
import { Button } from './Button.jsx';
import { Text } from './Text.jsx';
import { formatNumber } from '../utils.js';

export function LauncherButton({ isLoggedIn, points, pointsPending, position, launcherIconName, onClick, lbl, hidden }) {
    // Defense in depth: every other lbl() call site in the widget has a
    // matching hardcoded fallback (see GuestPanel.jsx, JoinProgramPanel.jsx,
    // etc.) — these two were the one place that didn't, so a widgetConfig
    // missing/empty `labels` object (e.g. this exact class of bug — see
    // _action.server.js's handleResetAll/handleClearAll comments) rendered
    // a bare icon with no title text at all, and "0" with no "pts" suffix.
    const subtitleTemplate = lbl('launcherSubtitle') || '[points] pts';
    const [subBefore, subAfter] = subtitleTemplate.split('[points]');
    const title = lbl('launcherTitle') || 'Loyalty & Rewards';

    // In compact (icon-only) mode both the title and the balance are hidden,
    // so a screen reader would get nothing but "Open loyalty widget" — the
    // merchant's own wording for their programme, and the customer's balance,
    // silently gone. Folding both into the accessible name keeps the button
    // saying the same thing whichever mode it renders in.
    //
    // Deliberately NOT conditional on compact state: this component has no way
    // to know it (see the badge note below), and the fuller label is an
    // improvement in the expanded state too — sighted users read the title off
    // the button face, and screen reader users now hear the same thing instead
    // of a generic phrase.
    const ariaLabel = isLoggedIn
        ? `${title} — ${formatNumber(points)}. Open loyalty widget`
        : `${title}. Open loyalty widget`;

    return (
        <div class={`nbl-launcher pos-${position}${hidden ? ' nbl-launcher--hidden' : ''}`}>
            <Button
                bare
                extraClass={`nbl-launcher__button${isLoggedIn ? '' : ' guest'}`}
                aria-label={ariaLabel}
                onClick={onClick}
            >
                <div class="nbl-launcher__icon" dangerouslySetInnerHTML={{ __html: launcherIcon(launcherIconName) }} />
                <div class="nbl-launcher__label">
                    <Text as="span" bare extraClass="nbl-launcher__title">{title}</Text>
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

                {/* Compact-mode balance badge. Rendered whenever the customer is
                    logged in, and left entirely to CSS to show or hide — see
                    ui.css's .nbl-launcher__badge.

                    NOT gated on compact mode here, because this component
                    cannot know whether compact mode is active: with the setting
                    on "On mobile only" that answer is a media query, and reading
                    a media query from a component means a matchMedia listener,
                    a piece of state and a re-render on every resize — all to
                    decide whether to render one <span>. Rendering it always and
                    letting the stylesheet collapse it costs a single hidden node
                    on the expanded pill, and keeps every viewport decision in
                    CSS where the rest of the launcher's responsive behaviour
                    already lives.

                    aria-hidden because the balance is already part of the
                    button's accessible name above; without it a screen reader
                    announces the number twice.

                    The pointsPending branch mirrors the subtitle's exactly — a
                    compact button has no subtitle, so this is the only place
                    left for the "your points are being updated" signal. */}
                {isLoggedIn && (
                    <span class="nbl-launcher__badge" aria-hidden="true">
                        {pointsPending ? (
                            <span class="nbl-spinner nbl-spinner--sync" />
                        ) : (
                            formatNumber(points)
                        )}
                    </span>
                )}
            </Button>
        </div>
    );
}

// =============================================================================
// modules/components/NotificationPanel.jsx
// ONE unified, content-driven notification panel — replaces the old split
// RewardPanel + InfoPanel. State-driven, no DOM query/bus, no badges.
//
// A single slide-up panel renders whatever slots the notification carries:
//   heading        — short title line
//   code + copy    — voucher code box with a Copy button (reward flow)
//   text / html    — body message
//   rows           — key/value detail rows
//   claim button   — action button (claim flow, supports loading + error)
//   tracking link  — order tracking row
//   contact link   — contact-us link
//   note           — muted footnote
//
// Every visual surface reads from exactly ONE set of vars (see ui.css):
//   --nbl-notify-bg, --nbl-notify-text-color, --nbl-notify-border-color,
//   --nbl-notify-btn-bg, --nbl-notify-btn-text-color, --nbl-notify-btn-border-color
//
// This makes the panel 100% reusable: adding a future notification type means
// passing new content, never adding a new component or a new set of vars.
// =============================================================================

import { h, Fragment } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { Icon } from './Icon.jsx';
import { Button } from './Button.jsx';
import { Text } from './Text.jsx';
import { Link } from './Link.jsx';

export function NotificationPanel({ notification, claimState, claimErrorMsg, onClose, onClaim, lbl }) {
    const [copied, setCopied] = useState(false);

    // Reset the copied state whenever the notification changes.
    useEffect(() => { setCopied(false); }, [notification]);

    if (!notification) return null;

    const isLoading = claimState === 'loading';
    const isError = claimState === 'error';

    // Normalize both flows (reward / info) into one flat content shape. `type`
    // is kept only so App.jsx's existing openReward/openInfo callers don't have
    // to change — the panel itself renders purely from these fields.
    const {
        heading = '',
        code = '',
        text = '',
        isHtml = false,
        rows = [],
        note: noteText = '',
        claim = false,
        data = null,
        claimLabel = '',
        trackingUrl = '',
        trackingLabel = 'Track your order',
        trackingText = '',
        contactUrl = '',
        contactText = 'Contact us',
    } = notification;

    function handleOverlayClick() {
        if (isLoading) return; // can't close mid-claim
        onClose();
    }

    function handleCopy() {
        if (navigator.clipboard) navigator.clipboard.writeText(code);
        setCopied(true);
    }

    return (
        <>
            <div class="nbl-notify-overlay active" onClick={handleOverlayClick} />

            <div class="nbl-notify-panel active" role="dialog" aria-modal="true">
                <Button bare extraClass="nbl-notify-panel__close" onClick={onClose} aria-label="Close">
                    <Icon name="close" px={12} />
                </Button>

                <div class="nbl-notify-panel__body">
                    {heading && <div class="nbl-notify-panel__heading">{heading}</div>}

                    {/* Reward code + copy */}
                    {code && (
                        <div class="nbl-notify-panel__code-row">
                            {copied ? (
                                <div class="nbl-notify-panel__copied">
                                    <span class="nbl-notify-panel__copied-check" aria-hidden="true">
                                        <Icon name="check" px={14} />
                                    </span>
                                    <Text as="span" bare>{lbl('notifyCopiedText') || 'Copied!'}</Text>
                                    <Button bare extraClass="nbl-notify-panel__btn nbl-notify-panel__copied-close" onClick={onClose}>
                                        {lbl('notifyCloseBtn') || 'Close'}
                                    </Button>
                                </div>
                            ) : (
                                <>
                                    <div class="nbl-notify-panel__code">{code}</div>
                                    <Button bare extraClass="nbl-notify-panel__btn nbl-notify-panel__copy-btn" onClick={handleCopy}>
                                        {lbl('notifyRewardCopyBtn') || 'Copy'}
                                    </Button>
                                </>
                            )}
                        </div>
                    )}

                    {/* Detail rows */}
                    {rows.length > 0 && (
                        <div class="nbl-notify-panel__rows">
                            {rows.map((row, i) => (
                                <div class="nbl-notify-panel__row" key={i}>
                                    <Text as="span" bare extraClass="nbl-notify-panel__row-key">{row.key}</Text>
                                    <Text as="span" bare extraClass="nbl-notify-panel__row-val">{row.val}</Text>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Body text */}
                    {text &&
                        (isHtml ? (
                            <div class="nbl-notify-panel__text" dangerouslySetInnerHTML={{ __html: text }} />
                        ) : (
                            <div class="nbl-notify-panel__text">{text}</div>
                        ))}

                    {/* Muted footnote */}
                    {noteText && <div class="nbl-notify-panel__note">{noteText}</div>}

                    {/* Tracking link */}
                    {(trackingUrl || trackingText) && (
                        <div class="nbl-notify-panel__tracking">
                            <Icon name="purchase" px={15} />
                            {trackingUrl ? (
                                <Link bare href={trackingUrl} target="_blank" rel="noopener">
                                    {trackingLabel}
                                </Link>
                            ) : (
                                trackingText
                            )}
                        </div>
                    )}

                    {/* Error line (claim flow) */}
                    {isError && <div class="nbl-notify-panel__error">{claimErrorMsg}</div>}

                    {/* Claim / action button */}
                    {claim && (
                        <Button
                            bare
                            extraClass="nbl-notify-panel__btn nbl-notify-panel__action-btn"
                            disabled={isLoading}
                            loading={isLoading}
                            loadingLabel={lbl('claimingLabel') || 'Processing...'}
                            onClick={() => onClaim(data)}
                        >
                            {isError
                                ? (lbl('claimRetryLabel') || 'Try again')
                                : (claimLabel || lbl('notifyInfoClaimBtn') || 'Claim')}
                        </Button>
                    )}

                    {/* Contact link */}
                    {contactUrl && (
                        <Link bare extraClass="nbl-notify-panel__contact-btn" href={contactUrl} target="_blank" rel="noopener">
                            {contactText}
                        </Link>
                    )}
                </div>
            </div>
        </>
    );
}
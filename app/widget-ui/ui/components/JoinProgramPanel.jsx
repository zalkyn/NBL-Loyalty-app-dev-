// =============================================================================
// app/widget-ui/ui/components/JoinProgramPanel.jsx
// Logged-in-but-not-yet-joined view — shown instead of the normal tabs in
// two cases (see App.jsx's needsJoin):
//   1. autoProvisionCustomer is turned off (merchant wants explicit opt-in).
//   2. autoProvisionCustomer is on but the silent background attempt failed
//      — `fromAutoFailure` softens the copy for this case ("we couldn't set
//      this up automatically") instead of the generic first-time wording,
//      so the customer isn't confused about why they're seeing a manual
//      step they didn't expect.
// Same visual language as GuestPanel.jsx (hero + icon + perks strip), swapped
// to a single "Join our program" action wired to useJoinProgram.js.
// =============================================================================

import { h } from 'preact';
import { Icon } from './Icon.jsx';
import { Heading } from './Heading.jsx';
import { Text } from './Text.jsx';
import { Button } from './Button.jsx';

function JoinPerk({ iconName, label }) {
    return (
        <div class="nbl-guest-perk">
            <span class="nbl-guest-perk__icon">
                <Icon name={iconName} px={18} />
            </span>
            <Text as="span" bare extraClass="nbl-guest-perk__label">{label}</Text>
        </div>
    );
}

export function JoinProgramPanel({ joining, error, onJoin, fromAutoFailure, lbl }) {
    const title = fromAutoFailure
        ? (lbl('joinProgramAutoFailTitle') || lbl('joinProgramTitle') || 'One More Step')
        : (lbl('joinProgramTitle') || 'You\u2019re Almost In!');

    const subtitle = fromAutoFailure
        ? (lbl('joinProgramAutoFailSubtitle')
            || 'We couldn\u2019t set up your account automatically. Tap below to join — it only takes a second.')
        : (lbl('joinProgramSubtitle')
            || 'You\u2019re signed in, but not enrolled in the loyalty program yet. Join now to start earning points.');

    return (
        <div class="nbl-guest">
            <div class="nbl-guest__hero">
                <div class="nbl-guest__icon-wrap">
                    <span class="nbl-guest__ring" />
                    <span class="nbl-guest__ring nbl-guest__ring--2" />
                    <div class="nbl-guest__icon">
                        <Icon name="gift" px={42} />
                    </div>
                </div>
                <Heading as="h2" bare extraClass="nbl-guest__title">{title}</Heading>
                <Text as="p" bare extraClass="nbl-guest__subtitle">{subtitle}</Text>
            </div>

            <div class="nbl-guest__perks">
                <JoinPerk iconName="lightning" label={lbl('guestPerkEarn') || 'Earn on every order'} />
                <div class="nbl-guest__perk-divider" />
                <JoinPerk iconName="tag" label={lbl('guestPerkRedeem') || 'Redeem for discounts'} />
                <div class="nbl-guest__perk-divider" />
                <JoinPerk iconName="referral" label={lbl('guestPerkRefer') || 'Refer & earn more'} />
            </div>

            <div class="nbl-guest__actions">
                <Button
                    variant="primary"
                    size="lg"
                    full
                    loading={joining}
                    loadingLabel={lbl('joinProgramJoining') || 'Joining...'}
                    onClick={onJoin}
                >
                    {lbl('joinProgramCta') || 'Join Our Program'}
                </Button>
                {error && (
                    <div class="nbl-join__error">{error}</div>
                )}
            </div>
        </div>
    );
}

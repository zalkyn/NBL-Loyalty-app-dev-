// =============================================================================
// app/widget-ui/ui/components/GuestPanel.jsx
// Logged-out (guest) view — hero card + perks strip + Create Account / Sign In.
// Purono modules-main/html.js guestBodyHTML()-er Preact component replacement.
// Renders full-bleed (no .nbl-widget-body padding) — see WidgetShell.jsx.
// =============================================================================

import { h } from 'preact';
import { Icon } from './Icon.jsx';
import { Heading } from './Heading.jsx';
import { Text } from './Text.jsx';
import { Link } from './Link.jsx';

// Same "come back to this page and reopen automatically" pattern already
// used by the referral modal's login flow (see useReferralModal.js's
// handleLogin / savePendingCode) — here for the main Create Account / Sign
// In buttons instead. We stash a short-lived flag in localStorage right
// before navigating away; App.jsx's boot effect looks for it on the next
// load and, if found (and not stale), reopens the widget automatically.
const REOPEN_WIDGET_KEY = 'NBL_ReopenWidget';

function markReopenWidget() {
    try {
        localStorage.setItem(REOPEN_WIDGET_KEY, JSON.stringify({ savedAt: Date.now() }));
    } catch (e) { /* ignore — storage unavailable/blocked */ }
}

// Deliberately NOT loginUrl/signupUrl (routes.login_url / routes.register_url
// — Shopify's older /account/login, /account/register stubs). Those don't
// reliably carry return_to through on stores using the unified Customer
// Accounts system — same reasoning as useReferralModal.js's handleLogin,
// which for the same reason always goes straight to
// /customer_authentication/login instead of the theme's own routes. That
// endpoint is also Shopify's single passwordless entry point for BOTH
// sign-in and registration, so Create Account and Sign In both land here —
// there's no separate "register" route to send Create Account to on this
// system.
function buildAuthUrl() {
    const returnTo = window.location.pathname + window.location.search + window.location.hash;
    return '/customer_authentication/login?return_to=' + encodeURIComponent(returnTo);
}

function GuestPerk({ iconName, label }) {
    return (
        <div class="nbl-guest-perk">
            <span class="nbl-guest-perk__icon">
                <Icon name={iconName} px={18} />
            </span>
            <Text as="span" bare extraClass="nbl-guest-perk__label">{label}</Text>
        </div>
    );
}

export function GuestPanel({ loginUrl, signupUrl, lbl }) {
    // loginUrl/signupUrl (routes.login_url/register_url) are still accepted
    // as props for backward compatibility, but intentionally unused below —
    // see buildAuthUrl()'s comment above for why.
    const title = lbl('guestTitle') || 'Earn & Redeem Rewards';
    const subtitle = lbl('guestSubtitle') || 'Join the loyalty program and start earning points on every purchase.';

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
                <GuestPerk iconName="lightning" label={lbl('guestPerkEarn') || 'Earn on every order'} />
                <div class="nbl-guest__perk-divider" />
                <GuestPerk iconName="tag" label={lbl('guestPerkRedeem') || 'Redeem for discounts'} />
                <div class="nbl-guest__perk-divider" />
                <GuestPerk iconName="referral" label={lbl('guestPerkRefer') || 'Refer & earn more'} />
            </div>

            <div class="nbl-guest__actions">
                <Link bare extraClass="nbl-guest__btn nbl-guest__btn--primary" href={buildAuthUrl()} onClick={markReopenWidget}>
                    <span class="nbl-guest__btn-label">{lbl('guestCreateAccount') || 'Create Account'}</span>
                    <span class="nbl-guest__btn-hint">{lbl('guestCreateAccountHint') || 'Free & takes 30 seconds'}</span>
                </Link>
                <Link bare extraClass="nbl-guest__btn nbl-guest__btn--secondary" href={buildAuthUrl()} onClick={markReopenWidget}>
                    <span class="nbl-guest__btn-label">{lbl('guestSignIn') || 'Sign In'}</span>
                    <span class="nbl-guest__btn-hint">{lbl('guestSignInHint') || 'Already have an account?'}</span>
                </Link>
            </div>
        </div>
    );
}
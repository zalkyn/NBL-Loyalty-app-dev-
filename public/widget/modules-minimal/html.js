// =============================================================================
// modules/html.js
// Builds and injects the full widget DOM into document.body.
// Uses the shared component builders in builder.js (custom tag names +
// attributes, no class-soup) instead of hardcoded HTML strings.
//
// This module only builds STATIC SHELL markup + empty mount points
// (nbl-panel, nbl-list, nbl-table, nbl-load-more shells, etc.) — the
// actual list/table contents are filled in at runtime by each tabs/*.js
// module via the event bus + pagination engine, exactly as before. This
// mirrors the reference architecture's structure, but stays a live,
// stateful app rather than a one-shot static render.
// =============================================================================

import { getStore } from './store.js';
import { getConfig, lbl } from './config.js';
import { escapeText } from './utils.js';
import { el, text, iconEl, sectionHeader, shareButton, shareRow, loadMore, stepItem, stepList, copyField, emptyState } from './builder.js';

// ── Tab definitions ──────────────────────────────────────────────────────────
// Order here drives nbl-tab-list rendering. Visibility of the last three
// (activity / my-rewards / my-prizes) can be toggled at runtime by other
// modules via data-hidden, same as before.

var TAB_DEFS = [
    { id: 'home', labelKey: 'navHome', fallback: 'Home' },
    { id: 'points', labelKey: 'navEarn', fallback: 'Earn' },
    { id: 'rewards', labelKey: 'navRewards', fallback: 'Rewards' },
    { id: 'prizes', labelKey: 'navPrizes', fallback: 'Prizes' },
    { id: 'referral', labelKey: 'navReferral', fallback: 'Referral' },
    { id: 'activities', labelKey: 'navActivity', fallback: 'Activity' },
    { id: 'active-rewards', labelKey: 'navMyRewards', fallback: 'My Rewards' },
    { id: 'my-prizes', labelKey: 'navMyPrizes', fallback: 'My Prizes' },
];

// ── Small local builders (shell-only, no data) ──────────────────────────────

function homeNavCard(navKey, iconName, label) {
    return el('nbl-action-button', { 'data-nav': navKey }, [
        iconEl(iconName),
        document.createTextNode(label),
    ]);
}

// ── Header ────────────────────────────────────────────────────────────────────

function pointsTemplateChildren(template) {
    var parts = (template || '[points] pts').split('[points]');
    var children = [];
    if (parts[0]) children.push(document.createTextNode(parts[0]));
    children.push(text('nbl-points', '0'));
    if (parts[1]) children.push(document.createTextNode(parts[1]));
    return children;
}

function buildHeader(isLoggedIn, headingLabel, pointsLabelTemplate) {
    var children = [
        el('nbl-close-button', { 'aria-label': 'Close' }, [iconEl('close')]),
    ];

    if (isLoggedIn) {
        children.push(text('nbl-header-title', headingLabel));
        children.push(el('nbl-balance-pill', {}, pointsTemplateChildren(pointsLabelTemplate)));
    } else {
        children.push(text('nbl-header-title', 'NBL Loyalty Program'));
    }

    return el('nbl-header', {}, children);
}

// ── Tab navigation ───────────────────────────────────────────────────────────

function buildTabNav() {
    var tabItems = TAB_DEFS.map(function (tab, i) {
        return el('nbl-tab-item', {
            'data-tab': tab.id,
            active: i === 0 ? true : undefined,
        }, [document.createTextNode(lbl(tab.labelKey) || tab.fallback)]);
    });

    return el('nbl-tab-nav', { 'visible-tabs': 4 }, [
        el('nbl-tab-nav-arrow', { direction: 'prev', 'aria-label': 'Previous tabs' }, [iconEl('chevron-left')]),
        el('nbl-tab-list', {}, tabItems),
        el('nbl-tab-nav-arrow', { direction: 'next', 'aria-label': 'Next tabs' }, [iconEl('chevron-right')]),
    ]);
}

// ── Home panel (shell only — contents filled by tabs/home.js) ──────────────

function buildHomePanel() {
    var WIDGET_CONFIG = getConfig();

    var quickActions = el('nbl-section', {}, [
        homeNavCard('rewards', 'rewards', lbl('homeCardBrowse') || 'Browse Rewards'),
        homeNavCard('points', 'lightning', lbl('homeCardEarn') || 'Earn Points'),
        homeNavCard('referral', 'referral', lbl('homeCardRefer') || 'Refer Friends'),
    ]);

    var boxes = [];

    if (WIDGET_CONFIG.showHomeRewardsSection) {
        boxes.push(el('nbl-section-box', { 'data-home-section': 'rewards' }, [
            sectionHeader({ icon: 'reward-discount', title: lbl('sectionActiveRewards') || 'Active Rewards' }),
            el('nbl-list', { 'data-list': 'home-rewards' }, [emptyState(lbl('emptyRewards') || 'No active rewards available')]),
            loadMore('home-rewards'),
        ]));
    }

    if (WIDGET_CONFIG.showHomePrizeRequestsSection !== false) {
        boxes.push(el('nbl-section-box', { 'data-home-section': 'prize-requests' }, [
            sectionHeader({ icon: 'reward-discount', title: lbl('sectionPrizeRequests') || 'My Prize Requests' }),
            el('nbl-list', { 'data-list': 'home-prize-requests' }, [emptyState(lbl('emptyMyPrizes') || 'You have no prize requests yet')]),
            loadMore('home-prize-requests'),
        ]));
    }

    if (WIDGET_CONFIG.showHomeActivitiesSection) {
        boxes.push(el('nbl-section-box', { 'data-home-section': 'activities' }, [
            sectionHeader({ icon: 'lightning', title: lbl('sectionRecentActivity') || 'Recent Activity' }),
            el('nbl-table', { 'data-table': 'home-activities' }, []),
            loadMore('home-activities'),
        ]));
    }

    return el('nbl-panel', { 'data-tab': 'home', active: true }, [quickActions].concat(boxes));
}

// ── Simple list-shell panel (Earn) ──────────────────────────────────────────

function buildListPanel(tabId, listKey, emptyMessage) {
    return el('nbl-panel', { 'data-tab': tabId }, [
        el('nbl-section', {}, [
            el('nbl-list', { 'data-list': listKey }, [emptyState(emptyMessage)]),
        ]),
    ]);
}

// ── Rewards panel — catalog list + its own Active Rewards section box ──────

function buildRewardsPanel() {
    return el('nbl-panel', { 'data-tab': 'rewards' }, [
        el('nbl-section', {}, [
            el('nbl-list', { 'data-list': 'rewards' }, [emptyState(lbl('emptyRewardsCatalog') || 'No rewards available')]),
        ]),
        el('nbl-section-box', { 'data-home-section': 'rewards-tab-active-rewards' }, [
            sectionHeader({ icon: 'reward-discount', title: lbl('sectionActiveRewards') || 'Active Rewards' }),
            el('nbl-list', { 'data-list': 'rewards-tab-active-rewards' }, [emptyState(lbl('emptyRewards') || 'No active rewards available')]),
            loadMore('rewards-tab-active-rewards'),
        ]),
    ]);
}

// ── Prizes panel — catalog list + its own Prize Requests section box ───────

function buildPrizesPanel() {
    return el('nbl-panel', { 'data-tab': 'prizes' }, [
        el('nbl-section', {}, [
            el('nbl-list', { 'data-list': 'prizes' }, [emptyState(lbl('emptyPrizes') || 'No prizes available')]),
        ]),
        el('nbl-section-box', { 'data-home-section': 'prizes-tab-active-prizes' }, [
            sectionHeader({ icon: 'reward-discount', title: lbl('sectionPrizeRequests') || 'My Prize Requests' }),
            el('nbl-list', { 'data-list': 'prizes-tab-active-prizes' }, [emptyState(lbl('emptyMyPrizes') || 'You have no prize requests yet')]),
            loadMore('prizes-tab-active-prizes'),
        ]),
    ]);
}

// ── Referral panel (shell — contents filled by tabs/referral.js) ───────────

function buildReferralPanel(referralLink) {
    return el('nbl-panel', { 'data-tab': 'referral' }, [
        el('nbl-section', {}, [
            sectionHeader({
                plain: true,
                title: 'Invite Friends & Earn',
                subtitle: 'Share your link — you earn points, your friend gets a discount voucher',
            }),

            el('div', { 'data-list': 'referral-rewards', style: 'display:contents' }),

            sectionHeader({ plain: true, title: 'How It Works' }),
            stepList([
                stepItem(1, 'Share your link', 'Send your unique referral link to friends'),
                stepItem(2, 'Friend makes a purchase', 'They click your link and complete a qualifying order'),
                stepItem(3, 'You both get rewarded', 'Points for you, a discount voucher for them'),
            ]),

            sectionHeader({ plain: true, title: 'Your Referral Link' }),
            copyField(referralLink, lbl('notifyRewardCopyBtn') || 'Copy'),

            sectionHeader({ plain: true, title: 'Share Via' }),
            shareRow([
                shareButton('whatsapp', 'WhatsApp'),
                shareButton('email', 'Email'),
                shareButton('messenger', 'Messenger'),
                shareButton('sms', 'SMS'),
            ]),
        ]),
    ]);
}

// ── Activity / My Rewards / My Prizes (full-list tabs) ──────────────────────

function buildActivityPanel() {
    return el('nbl-panel', { 'data-tab': 'activities' }, [
        el('nbl-section', {}, [
            el('nbl-table', { 'data-table': 'full-activities' }, []),
            loadMore('full-activities'),
        ]),
    ]);
}

function buildActiveRewardsPanel() {
    return el('nbl-panel', { 'data-tab': 'active-rewards' }, [
        el('nbl-section', {}, [
            el('nbl-list', { 'data-list': 'full-rewards' }, [emptyState(lbl('emptyRewards') || 'No active rewards available')]),
            loadMore('full-rewards'),
        ]),
    ]);
}

function buildMyPrizesPanel() {
    return el('nbl-panel', { 'data-tab': 'my-prizes' }, [
        el('nbl-section', {}, [
            el('nbl-list', { 'data-list': 'my-prizes' }, [emptyState(lbl('emptyMyPrizes') || 'You have no prize requests yet')]),
            loadMore('my-prizes'),
        ]),
    ]);
}

function buildFaqPanel() {
    return el('nbl-panel', { 'data-tab': 'faq' });
}

// ── Guest (logged-out) body ──────────────────────────────────────────────────

function actionLink(href, label) {
    var a = document.createElement('a');
    a.setAttribute('nbl-action-button', '');
    a.href = href;
    a.textContent = label;
    return a;
}

function buildGuestPanel(loginUrl, signupUrl) {
    return el('nbl-panel', { 'data-tab': 'home', active: true }, [
        el('nbl-section', {}, [
            sectionHeader({
                plain: true,
                icon: 'reward-discount',
                title: 'Earn & Redeem Rewards',
                subtitle: 'Join the loyalty program and start earning points on every purchase.',
            }),
            actionLink(signupUrl, 'Create Account'),
            actionLink(loginUrl, 'Sign In'),
        ]),
    ]);
}

// ── Notification + toast roots are built by notifications.js itself into
//    the #nbl-notification-wrapper mount point below, not here. ────────────

// ── Root build + mount ───────────────────────────────────────────────────────

/**
 * Builds and injects the full widget DOM into document.body.
 * Call once at boot after initStore() and initConfig().
 */
export function buildHTML() {
    var { loyaltyApp, appConfig } = getStore();
    var liquidData = loyaltyApp.liquidData || {};
    var isLoggedIn = !!(liquidData.isLoggedIn || (loyaltyApp.customer && loyaltyApp.customer.id));

    var savedCssVars = (appConfig.styles && appConfig.styles.cssVars) || {};
    var posFromCssVars = (savedCssVars['--nbl-launcher-position'] || '').toLowerCase();
    var posFromLiquid = (liquidData.buttonPosition || '').toLowerCase();
    var position = (posFromCssVars === 'left' || posFromCssVars === 'right')
        ? posFromCssVars
        : (posFromLiquid === 'right' ? 'right' : 'left');

    var customerName = escapeText((loyaltyApp.customer && loyaltyApp.customer.name) || liquidData.customerName || '');
    var headingLabel = (liquidData.headerLabel || lbl('headerLabel') || 'Welcome, [name]').replace('[name]', customerName);
    var pointsLabelTemplate = liquidData.pointsLabel || lbl('pointsLabel') || '[points] pts';
    var referralLink = (liquidData.shopUrl || '') + '/?nbl-referral=' + (liquidData.referralCode || '');
    var loginUrl = (loyaltyApp.routes && loyaltyApp.routes.login_url) || '/account/login';
    var signupUrl = (loyaltyApp.routes && loyaltyApp.routes.register_url) || '/account/register';

    // ── Launcher ───────────────────────────────────────────────────────────
    var launcherSubtitleTemplate = lbl('launcherSubtitle') || '[points] pts';
    var launcher = el('nbl-launcher', {}, [
        el('nbl-launcher-button', {}, [
            iconEl('reward-discount'),
            el('nbl-launcher-content', {}, [
                text('nbl-launcher-title', lbl('launcherTitle') || 'Loyalty Rewards'),
                isLoggedIn ? el('nbl-launcher-subtitle', {}, pointsTemplateChildren(launcherSubtitleTemplate)) : null,
            ]),
        ]),
    ]);

    // ── Header ─────────────────────────────────────────────────────────────
    var header = buildHeader(isLoggedIn, headingLabel, pointsLabelTemplate);

    // ── Panels ─────────────────────────────────────────────────────────────
    var panels = isLoggedIn
        ? [
            buildHomePanel(),
            buildListPanel('points', 'earn-points', 'No ways to earn points yet'),
            buildRewardsPanel(),
            buildPrizesPanel(),
            buildReferralPanel(referralLink),
            buildActivityPanel(),
            buildActiveRewardsPanel(),
            buildMyPrizesPanel(),
            buildFaqPanel(),
        ]
        : [buildGuestPanel(loginUrl, signupUrl)];

    var panelArea = el('nbl-panel-area', {}, panels);

    // ── Widget ─────────────────────────────────────────────────────────────
    var widgetChildren = [header];
    if (isLoggedIn) widgetChildren.push(buildTabNav());
    widgetChildren.push(panelArea);
    widgetChildren.push(el('div', { id: 'nbl-notification-wrapper' }));

    var widget = el('nbl-widget', { hidden: true }, widgetChildren);

    // ── Root ───────────────────────────────────────────────────────────────
    var root = el('nbl-widget-container', { position: position === 'left' ? 'left' : undefined }, [launcher, widget]);

    document.body.append(root);
}

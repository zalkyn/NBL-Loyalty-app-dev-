// =============================================================================
// modules/html.js
// All HTML builders — buildHTML() is the only public export.
// Injects the full widget shell into document.body.
// =============================================================================

import { getStore } from './store.js';
import { getConfig, lbl } from './config.js';
import { icon, launcherIcon } from './icons.js';
import { escapeText, escapeAttribute, formatNumber, formatDiscount } from './utils.js';

// ── Private helpers ───────────────────────────────────────────────────────────

function paginationHTML(key, mode) {
    var WIDGET_CONFIG = getConfig();
    mode = mode || WIDGET_CONFIG.paginationMode || 'pagination';
    var inner = mode === 'loadmore'
        ? `<div class="nbl-pagination-info-v1"></div>
           <button class="nbl-loadmore-btn-v1">
               <span class="nbl-loadmore-text-v1">${lbl('loadMoreBtn')}</span>
               <span class="nbl-loadmore-dots-v1"><span></span><span></span><span></span></span>
               <span class="nbl-loadmore-done-v1">${icon('check')} ${lbl('loadMoreDone')}</span>
           </button>`
        : `<button class="nbl-pagination-btn-v1 nbl-pagination-prev-v1" disabled>
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
           </button>
           <div class="nbl-pagination-info-v1"></div>
           <div class="nbl-pagination-dots-row-v1"></div>
           <button class="nbl-pagination-btn-v1 nbl-pagination-next-v1" disabled>
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
           </button>`;
    return `<div class="nbl-pagination-v1" data-pagination="${key}" data-pg-mode="${mode}" style="display:none">${inner}</div>`;
}

function homeNavCard(navKey, iconName, label) {
    return `<div data-nav="${navKey}" class="nbl-home-nav-itm-v1">
        <div class="nbl-nav-icon-wrap">${icon(iconName)}</div>
        <span class="nbl-wct-hb-text-v1">${label}</span>
        <div class="nbl-wchb-cai-v1">${icon('chevron-right')}</div>
    </div>`;
}

function refStep(num, title, desc) {
    return `<div class="nbl-referral-step-v1">
        <div class="nbl-referral-step-num-v1">${num}</div>
        <div class="nbl-referral-step-content-v1">
            <h4>${title}</h4>
            <p>${desc}</p>
        </div>
    </div>`;
}

function accordion(tabKey, heading, openByDefault, bodyInner) {
    return `<div class="nbl-home-tab-v1${openByDefault ? ' active' : ''}" data-tab="${tabKey}">
        <div class="nbl-home-tab-header-v1">
            <div class="nbl-hth-heading-v1">${heading}</div>
            <button class="nbl-hth-toggle-btn-v1">${openByDefault ? 'Hide' : 'Show'}</button>
        </div>
        <div class="nbl-home-tab-body-v1">${bodyInner}</div>
    </div>`;
}

function guestBodyHTML() {
    var { loyaltyApp } = getStore();
    var loginUrl = escapeAttribute((loyaltyApp.routes && loyaltyApp.routes.login_url) || '/account/login');
    var signupUrl = escapeAttribute((loyaltyApp.routes && loyaltyApp.routes.register_url) || '/account/register');
    return `<div class="nbl-guest-wrapper-v1">
        <div class="nbl-guest-hero-v1">
            <div class="nbl-guest-hero-orb-v1"></div>
            <div class="nbl-guest-hero-orb-v1 nbl-guest-hero-orb2-v1"></div>
            <div class="nbl-guest-hero-icon-wrap-v1">
                <span class="nbl-guest-hero-ring-v1"></span>
                <span class="nbl-guest-hero-ring-v1 nbl-guest-hero-ring2-v1"></span>
                <div class="nbl-guest-hero-icon-v1">${icon('gift')}</div>
            </div>
            <h2 class="nbl-guest-hero-title-v1">Earn &amp; Redeem Rewards</h2>
            <p class="nbl-guest-hero-sub-v1">Join the loyalty program and start earning points on every purchase.</p>
        </div>
        <div class="nbl-guest-perks-v1">
            <div class="nbl-guest-perk-v1"><span class="nbl-guest-perk-icon-v1">${icon('lightning')}</span><span class="nbl-guest-perk-label-v1">Earn on every order</span></div>
            <div class="nbl-guest-perk-divider-v1"></div>
            <div class="nbl-guest-perk-v1"><span class="nbl-guest-perk-icon-v1">${icon('tag')}</span><span class="nbl-guest-perk-label-v1">Redeem for discounts</span></div>
            <div class="nbl-guest-perk-divider-v1"></div>
            <div class="nbl-guest-perk-v1"><span class="nbl-guest-perk-icon-v1">${icon('referral')}</span><span class="nbl-guest-perk-label-v1">Refer &amp; earn more</span></div>
        </div>
        <div class="nbl-guest-actions-v1">
            <a class="nbl-guest-btn-primary-v1" href="${signupUrl}">
                <span class="nbl-guest-btn-label-v1">Create Account</span>
                <span class="nbl-guest-btn-hint-v1">Free &amp; takes 30 seconds</span>
            </a>
            <a class="nbl-guest-btn-secondary-v1" href="${loginUrl}">
                <span class="nbl-guest-btn-label-v1">Sign In</span>
                <span class="nbl-guest-btn-hint-v1">Already have an account?</span>
            </a>
        </div>
    </div>`;
}

function referralTabHTML(referralLink) {
    var { appConfig } = getStore();
    var pointRules = appConfig.pointRules || [];
    var refRule = pointRules.find(function (r) { return r.event && r.event.type === 'REFERRAL'; });
    var refCond = (refRule && refRule.conditions && refRule.conditions.referral) || {};
    var trigger = refCond.trigger || 'oneTime';
    var isSubscription = trigger === 'subscription' || trigger === 'both';

    var step2Title = trigger === 'subscription' ? 'Friend subscribes'
        : trigger === 'both' ? 'Friend makes a purchase or subscribes'
            : 'Friend makes a one-time purchase';
    var step2Desc = trigger === 'subscription'
        ? 'They click your link and start a subscription'
        : trigger === 'both'
            ? 'They click your link and place a one-time or subscription order'
            : 'They click your link and place a one-time purchase';

    return `<div class="nbl-referral-wrapper-v1">
        <div class="nbl-referral-header-v1">
            <h2 class="nbl-referral-title-v1">Invite Friends &amp; Earn</h2>
            <p class="nbl-referral-subtitle-v1">Share your link — you earn points, your friend gets a discount voucher</p>
        </div>
        <div class="nbl-referral-rewards-v1" id="nbl-referral-rewards"></div>
        <div class="nbl-referral-how-v1">
            <p class="nbl-referral-how-label-v1">How it works</p>
            <div class="nbl-referral-flow-v1">
                ${refStep('1', 'Share your link', 'Send your unique referral link to friends')}
                ${refStep('2', step2Title, step2Desc)}
                ${refStep('3', 'You both get rewarded', 'Points for you, a discount voucher for them')}
            </div>
        </div>
        <div class="nbl-referral-section-v1">
            <label>Your Referral Link</label>
            <div class="nbl-referral-input-group-v1">
                <input class="nbl-referral-input-v1 nbl-referral-link-v1" type="text" value="${referralLink}" readonly>
                <button class="nbl-referral-copy-btn-v1">Copy</button>
            </div>
        </div>
        <div class="nbl-referral-share-v1">
            <p>Share via</p>
            <div class="nbl-referral-share-buttons-v1">
                <button class="nbl-referral-share-btn-v1" data-share="whatsapp">${icon('phone')} WhatsApp</button>
                <button class="nbl-referral-share-btn-v1" data-share="email">${icon('mail')} Email</button>
                <button class="nbl-referral-share-btn-v1" data-share="messenger">${icon('message-circle')} Messenger</button>
                <button class="nbl-referral-share-btn-v1" data-share="sms">${icon('mail')} SMS</button>
            </div>
        </div>
    </div>`;
}

function referralModalHTML() {
    var { appConfig } = getStore();
    var pointRules = appConfig.pointRules || [];
    var refRule = pointRules.find(function (r) { return r.event && r.event.type === 'REFERRAL'; });
    var refCond = (refRule && refRule.conditions && refRule.conditions.referral) || {};
    var referrer = refCond.referrer || {};
    var referred = refCond.referred || {};
    var trigger = refCond.trigger || 'oneTime';
    var currencySymbol = (appConfig.shop && appConfig.shop.currencySymbol) || '$';

    var referrerRewardText = '';
    if (trigger === 'subscription') {
        var rewardParts = [];
        if (referrer.points > 0)
            rewardParts.push(`Earn <strong>${formatNumber(referrer.points)} points</strong> when your friend places their first subscription order.`);
        if (referrer.allowRenewalReward && referrer.renewalPoints > 0)
            rewardParts.push(`Earn <strong>${formatNumber(referrer.renewalPoints)} points</strong> every time your friend renews their subscription.`);
        referrerRewardText = rewardParts.join(' ');
    } else if (trigger === 'both') {
        var rewardParts = [];
        if (referrer.points > 0)
            rewardParts.push(`Earn <strong>${formatNumber(referrer.points)} points</strong> when your friend places their first order.`);
        if (referrer.allowRenewalReward && referrer.renewalPoints > 0)
            rewardParts.push(`Earn <strong>${formatNumber(referrer.renewalPoints)} points</strong> every time your friend renews their subscription.`);
        referrerRewardText = rewardParts.join(' ');
    } else if (referrer.points > 0) {
        referrerRewardText = `Earn <strong>${formatNumber(referrer.points)} points</strong> when your friend completes their first one-time purchase.`;
    }

    var friendRewardRows = [];
    if (referred.discountValue) {
        var voucherValue = referred.discountType === 'percentage'
            ? `${referred.discountValue}% discount voucher`
            : `a ${currencySymbol}${formatNumber(referred.discountValue)} discount voucher`;
        var friendOrderNote = referred.minimumOrderValue
            ? ` on orders over ${currencySymbol}${formatNumber(referred.minimumOrderValue)}`
            : trigger === 'subscription' ? ' for your first subscription order'
                : trigger === 'both' ? ' for your first order'
                    : ' for your first one-time purchase';
        friendRewardRows.push(`${icon('gift')} You get <strong>${voucherValue}</strong>${friendOrderNote}.`);
    }
    if ((trigger === 'subscription' || trigger === 'both') && referred.allowRenewalReward && referred.renewalPoints > 0) {
        friendRewardRows.push(`${icon('refresh')} Earn <strong>${formatNumber(referred.renewalPoints)} points</strong> every time you renew your subscription.`);
    }

    var rewardSummaryHTML = friendRewardRows.length
        ? `<div class="nbl-refer-modal-reward-summary-v1">
            ${friendRewardRows.map(row => `<div class="nbl-refer-modal-reward-row-v1">${row}</div>`).join('')}
           </div>`
        : '';

    var successRewardSummaryHTML = friendRewardRows.length
        ? `<div class="nbl-refer-modal-reward-summary-v1">
            ${friendRewardRows.map(row => `<div class="nbl-refer-modal-reward-row-v1">${row}</div>`).join('')}
           </div>`
        : '';

    return `<div class="nbl-refer-modal-overlay-v1" role="dialog" aria-modal="true" aria-labelledby="nbl-modal-title">
        <div class="nbl-refer-modal-v1">
            <div class="nbl-refer-modal-close-v1" aria-label="Close">&times;</div>
            <div class="nbl-refer-modal-content-v1">

                <div class="nbl-refer-modal-login-step-v1">
                    <div class="nbl-refer-modal-brand-v1">NBL Loyalty</div>
                    <h3 class="nbl-refer-modal-title-v1" id="nbl-modal-title">Login to Claim Your Referral Discount</h3>
                    <p class="nbl-refer-modal-subtitle-v1">Log into your account to unlock your referral discount.</p>
                    ${rewardSummaryHTML}
                    <button class="nbl-refer-modal-btn-v1 nbl-refer-modal-btn-primary-v1" id="loginBtn">Login / Register</button>
                    <div class="nbl-refer-modal-message-v1" id="loginMessage"></div>
                </div>

                <div class="nbl-refer-modal-form-v1 nbl-hidden-v1">
                    <div class="nbl-refer-modal-brand-v1">NBL Loyalty</div>
                    <h3 class="nbl-refer-modal-title-v1">Get Your Referral Discount ${icon('gift')}</h3>
                    <p class="nbl-refer-modal-subtitle-v1">Enter your referral code to unlock your discount.</p>
                    ${rewardSummaryHTML}
                    <input type="text" class="nbl-refer-modal-input-v1" readonly id="referralInput">
                    <button class="nbl-refer-modal-btn-v1 nbl-refer-modal-btn-primary-v1" id="submitBtn">Request Discount Code</button>
                    <div class="nbl-refer-modal-message-v1" id="formMessage"></div>
                </div>

                <div class="nbl-refer-modal-success-v1 nbl-hidden-v1">
                    <div class="nbl-refer-modal-brand-v1">NBL Loyalty</div>
                    <h3 class="nbl-refer-modal-title-v1">${icon('sparkles')} Your Discount Code</h3>
                    <div class="nbl-refer-modal-code-box-v1">
                        <div class="nbl-refer-modal-code-v1" id="discountCode"></div>
                        <button class="nbl-refer-modal-copy-btn-v1" id="copyBtn">Copy Code</button>
                        <div class="nbl-refer-modal-copied-text-v1 nbl-hidden-v1">Copied ${icon('check')}</div>
                    </div>
                    ${successRewardSummaryHTML}
                    <div class="nbl-refer-modal-important-v1">
                        <strong>Important:</strong>
                        <ul><li>One-time code — use at checkout.</li><li>Use it quickly.</li></ul>
                    </div>
                    <button class="nbl-refer-modal-btn-v1 nbl-refer-modal-btn-finish-v1" id="finishBtn">Finish &amp; Save</button>
                    <div class="nbl-refer-modal-message-v1" id="successMessage"></div>
                </div>

                <div class="nbl-refer-modal-locked-v1 nbl-hidden-v1">
                    <div class="nbl-refer-modal-brand-v1">NBL Loyalty</div>
                    <h3 class="nbl-refer-modal-title-v1">${icon('block')} Referral Already Used</h3>
                    <p class="nbl-refer-modal-subtitle-v1">Only one referral discount is allowed per customer.</p>
                    <button class="nbl-refer-modal-btn-v1 nbl-refer-modal-btn-finish-v1" id="lockedCloseBtn">Close</button>
                    <div class="nbl-refer-modal-message-v1" id="lockedMessage"></div>
                </div>

            </div>
        </div>
    </div>`;
}

function loggedInBodyHTML(referralLink) {
    var WIDGET_CONFIG = getConfig();

    var rewardsAccordion = WIDGET_CONFIG.showHomeRewardsSection ? `
        <div class="nbl-home-section-card-v1" data-home-section="rewards">
            <div class="nbl-hsc-header-v1">
                <span class="nbl-hsc-icon-v1">${icon('reward-discount')}</span>
                <span class="nbl-hsc-title-v1">${lbl('sectionActiveRewards')}</span>
            </div>
            <div class="nbl-hta-reward-list-v1"><div class="nbl-hta-rewards-empty-v1">${lbl('emptyRewards')}</div></div>
            ${paginationHTML('home-rewards')}
        </div>` : '';

    var prizeRequestsAccordion = WIDGET_CONFIG.showHomePrizeRequestsSection !== false ? `
        <div class="nbl-home-section-card-v1" data-home-section="prize-requests">
            <div class="nbl-hsc-header-v1">
                <span class="nbl-hsc-icon-v1">${icon('reward-discount')}</span>
                <span class="nbl-hsc-title-v1">${lbl('sectionPrizeRequests')}</span>
            </div>
            <div class="nbl-prize-requests-list-v1"><div class="nbl-hta-rewards-empty-v1">${lbl('emptyMyPrizes')}</div></div>
            ${paginationHTML('home-prize-requests')}
        </div>` : '';

    var activitiesAccordion = WIDGET_CONFIG.showHomeActivitiesSection ? `
        <div class="nbl-home-section-card-v1" data-home-section="activities">
            <div class="nbl-hsc-header-v1">
                <span class="nbl-hsc-icon-v1">${icon('lightning')}</span>
                <span class="nbl-hsc-title-v1">${lbl('sectionRecentActivity')}</span>
            </div>
            <div class="nbl-haTa-wrapper-v1">
                <div class="nbl-haTa-head-v1">
                    <div class="nbl-haTa-head-item-v1">${lbl('activityColDate')}</div>
                    <div class="nbl-haTa-head-item-v1">${lbl('activityColActivity')}</div>
                    <div class="nbl-haTa-head-item-v1">${lbl('activityColPoints')}</div>
                </div>
                <div class="nbl-haTa-list-wrapper-v1"><div class="nbl-haTa-list-empty-v1">${lbl('emptyActivity')}</div></div>
            </div>
            ${paginationHTML('home-activities')}
        </div>` : '';

    return `<div class="nbl-wc-tab-wrapper-v1">

        <div class="nbl-tab-item-v1 active" data-tab="home">
            <div class="nbl-home-nav-wrapper-v1">
                ${homeNavCard('rewards', 'rewards', lbl('homeCardBrowse'))}
                ${homeNavCard('points', 'lightning', lbl('homeCardEarn'))}
                ${homeNavCard('referral', 'referral', lbl('homeCardRefer'))}
            </div>
            <div class="nbl-home-sections-v1">
                ${rewardsAccordion}
                ${prizeRequestsAccordion}
                ${activitiesAccordion}
            </div>
        </div>

        <div class="nbl-tab-item-v1" data-tab="points">
            <div class="nbl-points-list-v1"></div>
        </div>

        <div class="nbl-tab-item-v1" data-tab="rewards">
            <div class="nbl-reward-list-v1"></div>

            <div class="nbl-home-section-card-v1" data-home-section="rewards-tab-active-rewards">
                <div class="nbl-hsc-header-v1">
                    <span class="nbl-hsc-icon-v1">${icon('reward-discount')}</span>
                    <span class="nbl-hsc-title-v1">${lbl('sectionActiveRewards')}</span>
                </div>
                <div class="nbl-rewards-tab-active-rewards-list-v1"><div class="nbl-hta-rewards-empty-v1">${lbl('emptyRewards')}</div></div>
                ${paginationHTML('rewards-tab-active-rewards')}
            </div>
        </div>

        <div class="nbl-tab-item-v1" data-tab="prizes">
            <div class="nbl-prize-list-v1"></div>

            <div class="nbl-home-section-card-v1" data-home-section="prizes-tab-active-prizes">
                <div class="nbl-hsc-header-v1">
                    <span class="nbl-hsc-icon-v1">${icon('reward-discount')}</span>
                    <span class="nbl-hsc-title-v1">${lbl('sectionPrizeRequests')}</span>
                </div>
                <div class="nbl-prizes-tab-active-prizes-list-v1"><div class="nbl-hta-rewards-empty-v1">${lbl('emptyMyPrizes')}</div></div>
                ${paginationHTML('prizes-tab-active-prizes')}
            </div>
        </div>

        <div class="nbl-tab-item-v1" data-tab="referral">
            ${referralTabHTML(referralLink)}
        </div>

        <div class="nbl-tab-item-v1" data-tab="activities">
            <div class="nbl-activities-full-wrapper-v1">
                <div class="nbl-haTa-wrapper-v1">
                    <div class="nbl-haTa-head-v1">
                        <div class="nbl-haTa-head-item-v1">${lbl('activityColDate')}</div>
                        <div class="nbl-haTa-head-item-v1">${lbl('activityColActivity')}</div>
                        <div class="nbl-haTa-head-item-v1">${lbl('activityColPoints')}</div>
                    </div>
                    <div class="nbl-haTa-list-wrapper-full-v1"><div class="nbl-haTa-list-empty-v1">${lbl('emptyActivity')}</div></div>
                </div>
                ${paginationHTML('full-activities')}
            </div>
        </div>

        <div class="nbl-tab-item-v1" data-tab="active-rewards">
            <div class="nbl-active-rewards-full-wrapper-v1">
                <div class="nbl-hta-reward-list-full-v1"><div class="nbl-hta-rewards-empty-v1">${lbl('emptyRewards')}</div></div>
                ${paginationHTML('full-rewards')}
            </div>
        </div>

        <div class="nbl-tab-item-v1" data-tab="my-prizes">
            <div class="nbl-my-prizes-wrapper-v1"></div>
            ${paginationHTML('my-prizes')}
        </div>

        <div class="nbl-tab-item-v1" data-tab="faq"></div>

    </div>`;
}

// ── Public export ─────────────────────────────────────────────────────────────

/**
 * Builds and injects the full widget HTML into document.body.
 * Call once at boot after initStore() and initConfig().
 */
export function buildHTML() {
    var { loyaltyApp, appConfig } = getStore();
    var liquidData = loyaltyApp.liquidData || {};
    var isLoggedIn = !!(liquidData.isLoggedIn || (loyaltyApp.customer && loyaltyApp.customer.id));

    var _savedCssVarsEarly = (appConfig.styles && appConfig.styles.cssVars) || {};
    var _posFromCssVars = (_savedCssVarsEarly['--nbl-launcher-position'] || '').toLowerCase();
    var _posFromLiquid = (liquidData.buttonPosition || '').toLowerCase();
    var buttonPosition = (_posFromCssVars === 'left' || _posFromCssVars === 'right')
        ? _posFromCssVars
        : (_posFromLiquid === 'right' ? 'right' : 'left');

    var customerName = escapeText(loyaltyApp?.customer?.name || liquidData.customerName || '');
    var headingLabel = (liquidData.headerLabel || lbl('headerLabel') || 'Welcome, [name]').replace('[name]', customerName);
    var pointsLabel = (liquidData.pointsLabel || lbl('pointsLabel') || '[points] pts')
        .replace('[points]', '<span class="nbl-customer-points-v1">0</span>');
    var referralLink = escapeAttribute((liquidData.shopUrl || '') + '/?nbl-referral=' + (liquidData.referralCode || ''));

    var launcherStyles = (appConfig.styles && appConfig.styles.launcher) || {};
    var launcherIconName = (_savedCssVarsEarly['--nbl-launcher-icon'] || '').replace(/^'|'$/g, '');

    // ── Launcher button ───────────────────────────────────────────────────────
    var btnHTML = `<div class="nbl-wo-wrapper-v1 nbl-d-none-v1 pos-${buttonPosition}">
        <button class="nbl-widget-open-button-v1${isLoggedIn ? '' : ' nbl-wob-guest-v1'}" aria-label="Open loyalty widget">
            <div class="nbl-wob-icon-v1">${launcherIcon(launcherIconName)}</div>
            <div class="nbl-wob-label-v1">
                <span class="nbl-wob-title-v1">${lbl('launcherTitle')}</span>
                ${isLoggedIn
            ? `<span class="nbl-wob-sub-v1">${lbl('launcherSubtitle').replace('[points]', '<span class="nbl-customer-points-v1">0</span>')}</span>`
            : ''}
            </div>
        </button>
    </div>`;

    // ── Header top ────────────────────────────────────────────────────────────
    var headerTopHTML = isLoggedIn
        ? `<h3 class="nbl-wh-title-v1">${headingLabel}</h3><div class="nbl-wh-points-v1">${pointsLabel}</div>`
        : `<h3 class="nbl-wh-title-v1">NBL Loyalty Program</h3>`;

    // ── Nav ───────────────────────────────────────────────────────────────────
    var navHTML = isLoggedIn ? `
        <div class="nbl-wh-nav-wrapper-v1">
            <button class="nbl-nav-chevron-v1 nbl-nav-chevron-left-v1 hidden" aria-label="Scroll nav left">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div class="nbl-wh-nav-scroll-v1">
                <button class="nbl-nav-item-v1 active" data-nav="home"           role="tab">${lbl('navHome')}</button>
                <button class="nbl-nav-item-v1"        data-nav="points"         role="tab">${lbl('navEarn')}</button>
                <button class="nbl-nav-item-v1"        data-nav="rewards"        role="tab">${lbl('navRewards')}</button>
                <button class="nbl-nav-item-v1"        data-nav="prizes"         role="tab">${lbl('navPrizes')}</button>
                <button class="nbl-nav-item-v1"        data-nav="referral"       role="tab">Referral</button>
                <button class="nbl-nav-item-v1"        data-nav="activities"     role="tab" data-hidden="false">${lbl('navActivity')}</button>
                <button class="nbl-nav-item-v1"        data-nav="active-rewards" role="tab" data-hidden="false">${lbl('navMyRewards')}</button>
                <button class="nbl-nav-item-v1"        data-nav="my-prizes"      role="tab" data-hidden="false">${lbl('navMyPrizes')}</button>
            </div>
            <button class="nbl-nav-chevron-v1 nbl-nav-chevron-right-v1" aria-label="Scroll nav right">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
        </div>` : '';

    // ── Body ──────────────────────────────────────────────────────────────────
    var bodyHTML = isLoggedIn ? loggedInBodyHTML(referralLink) : guestBodyHTML();

    // ── Widget shell ──────────────────────────────────────────────────────────
    var widgetHTML = `<div class="nbl-widget-container-v1 pos-${buttonPosition}">
        <div class="nbl-widget-scroll-area-v1">
            <div class="nbl-widget-wrapper-v1">
                <div class="nbl-widget-header-v1">
                    <button class="nbl-widget-close-button-v1" aria-label="Close">${icon('close')}</button>
                    <div class="nbl-widget-header-wrapper-v1">
                        <div class="nbl-widget-header-top-v1">
                            ${headerTopHTML}
                        </div>
                        ${navHTML}
                    </div>
                </div>
                <div class="nbl-widget-body-v1">
                    <div class="nbl-widget-main-content-v1">${bodyHTML}</div>
                </div>
            </div>
        </div>
        <div class="nbl-notification-wrapper-v1" id="nbl-notification-wrapper"></div>
    </div>`;

    // ── Inject into DOM ───────────────────────────────────────────────────────
    var root = document.createElement('div');
    root.id = 'nbl-loyalty-root';
    root.innerHTML = btnHTML + widgetHTML + referralModalHTML();
    document.body.appendChild(root);
}
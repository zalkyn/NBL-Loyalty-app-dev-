// =============================================================================
// modules/config.js
// WIDGET_CONFIG defaults + override merger + shared accessors.
// Call initConfig(loyaltyApp, appConfig) once at boot, then use
// getConfig(), lbl(), getPoints() anywhere.
// =============================================================================

import { getStore } from './store.js';

var _config = null;
var _loyaltyApp = null;

export function initConfig(loyaltyApp, appConfig) {
    _loyaltyApp = loyaltyApp;

    _config = {
        // ── Widget behaviour ─────────────────────────────────────────────────
        showSubmitButtonOnAuto: false,

        showHomeRewardsSection: true,
        showHomeActivitiesSection: true,
        showHomePrizeRequestsSection: true,

        homeRewardsPerPage: 5,
        homeActivitiesPerPage: 5,
        homePrizeRequestsPerPage: 5,
        myPrizesPerPage: 5,

        // 'pagination' | 'loadmore'
        paginationMode: 'pagination',

        // ── Prize options ────────────────────────────────────────────────────
        prize: {
            showImage: true,
            imageFit: 'cover',
            imageHeight: 150,
            imagePosition: 'center',
            contactUrl: '',
            showAdminNote: true,
            showTrackingInfo: true,
            showRequestDate: true,
            showFulfilledDate: true,
        },

        // ── Text labels ──────────────────────────────────────────────────────
        labels: {
            headerLabel: 'Welcome, [name]',
            pointsLabel: '[points] pts',
            navHome: 'Home',
            navEarn: 'Earn',
            navRewards: 'Rewards',
            navMyRewards: 'My Rewards',
            navActivity: 'Activity',
            navPrizes: 'Prizes',
            navMyPrizes: 'My Prizes',
            homeCardBrowse: 'Browse Rewards',
            homeCardEarn: 'Earn Points',
            homeCardRefer: 'Refer Friends',
            sectionActiveRewards: 'Active Rewards',
            sectionRecentActivity: 'Recent Activity',
            sectionPrizeRequests: 'My Prize Requests',
            activityColDate: 'Date',
            activityColActivity: 'Activity',
            activityColPoints: 'Points',
            emptyRewards: 'No active rewards available',
            emptyActivity: 'No account activities yet',
            emptyPrizes: 'No prizes available',
            emptyMyPrizes: 'You have no prize requests yet',
            prizeStatusPending: '🕐 Pending',
            prizeStatusFulfilled: '📦 Fulfilled',
            prizeStatusCompleted: '✅ Completed',
            prizeStatusCancelled: '❌ Cancelled',
            prizeContactUsText: 'Contact us',
            prizeClaimSuccessMsg: '✅ Your request has been submitted! We\'ll contact you soon to arrange delivery.',
            claimingLabel: 'Processing...',
            claimRetryLabel: 'Try again',
            loadMoreBtn: 'Load More',
            loadMoreDone: 'All loaded',
            notifyRewardHeading: 'Success! Use this code at checkout',
            notifyRewardCopyBtn: 'Copy',
            notifyInfoClaimBtn: 'Claim',
            launcherTitle: 'Loyalty Rewards',
            launcherSubtitle: '[points] pts',
        },

        // ── Header animation effect ──────────────────────────────────────────

        // ── Event bus logging ────────────────────────────────────────────────
        // All logging is disabled by default. Set enabled: true to activate.
        // Can also be toggled at runtime: NBL_v1.bus.debug(true)
        logging: {
            // Master switch — must be true for any logging to happen.
            enabled: false,

            // Log every event emission (name, payload, listener count).
            logEmit: true,

            // Log sticky emissions with a distinct 'sticky:' prefix.
            logSticky: true,

            // Log when a late subscriber receives a sticky payload immediately.
            logLateSubscriber: true,

            // Log handler errors. Recommended to keep true even in production.
            logErrors: true,

            // Restrict logging to specific event name prefixes.
            // Empty array = log all events.
            // Example: ['widget', 'tab'] logs only widget:* and tab:* events.
            filterNamespaces: [],

            // Console label color for event names.
            labelColor: '#7c3aed',
        },
    };

    // ── Apply dashboard overrides ────────────────────────────────────────────
    // appConfig.styles.widgetConfig holds non-CSS settings saved by the
    // dashboard Customize page (labels, etc.)
    (function applyWidgetConfigOverrides() {
        var wc = appConfig.styles && appConfig.styles.widgetConfig;
        if (!wc || typeof wc !== 'object') return;

        // Behaviour
        if (wc.showHomeRewardsSection !== undefined) _config.showHomeRewardsSection = !!wc.showHomeRewardsSection;
        if (wc.showHomeActivitiesSection !== undefined) _config.showHomeActivitiesSection = !!wc.showHomeActivitiesSection;
        if (wc.showHomePrizeRequestsSection !== undefined) _config.showHomePrizeRequestsSection = !!wc.showHomePrizeRequestsSection;
        if (wc.homeRewardsPerPage !== undefined) _config.homeRewardsPerPage = Math.max(1, Number(wc.homeRewardsPerPage) || 5);
        if (wc.homeActivitiesPerPage !== undefined) _config.homeActivitiesPerPage = Math.max(1, Number(wc.homeActivitiesPerPage) || 5);
        if (wc.homePrizeRequestsPerPage !== undefined) _config.homePrizeRequestsPerPage = Math.max(1, Number(wc.homePrizeRequestsPerPage) || 5);
        if (wc.myPrizesPerPage !== undefined) _config.myPrizesPerPage = Math.max(1, Number(wc.myPrizesPerPage) || 5);
        if (wc.paginationMode !== undefined) _config.paginationMode = wc.paginationMode;

        // Prize options — deep merge so only overridden keys are replaced
        if (wc.prize && typeof wc.prize === 'object') {
            _config.prize = Object.assign({}, _config.prize, wc.prize);
        }
        // Legacy flat keys (backward compat)
        if (wc.prizeShowImage !== undefined) _config.prize.showImage = !!wc.prizeShowImage;
        if (wc.prizeImageFit !== undefined) _config.prize.imageFit = wc.prizeImageFit;
        if (wc.prizeImageHeight !== undefined) _config.prize.imageHeight = Number(wc.prizeImageHeight) || 150;
        if (wc.prizeImagePosition !== undefined) _config.prize.imagePosition = wc.prizeImagePosition;
        if (wc.prizeContactUrl !== undefined) _config.prize.contactUrl = wc.prizeContactUrl;
        if (wc.prizeShowAdminNote !== undefined) _config.prize.showAdminNote = !!wc.prizeShowAdminNote;
        if (wc.prizeShowTrackingInfo !== undefined) _config.prize.showTrackingInfo = !!wc.prizeShowTrackingInfo;
        if (wc.prizeShowRequestDate !== undefined) _config.prize.showRequestDate = !!wc.prizeShowRequestDate;
        if (wc.prizeShowFulfilledDate !== undefined) _config.prize.showFulfilledDate = !!wc.prizeShowFulfilledDate;

        // Header animation

        // Labels — deep merge so only overridden keys are replaced
        if (wc.labels && typeof wc.labels === 'object') {
            _config.labels = Object.assign({}, _config.labels, wc.labels);
        }
    })();

    // Apply logging config to the event bus.
    // Must run after _config is fully built so all options are available.
    // Runtime changes: NBL_v1.bus.debug(true) or bus.setLogConfig({...})
    var { eventBus } = getStore();
    if (_config.logging) {
        eventBus.setLogConfig(_config.logging);
    }

    return _config;
}

/** Returns the fully merged WIDGET_CONFIG object. */
export function getConfig() {
    return _config;
}

/** Read a label string with safe fallback. */
export function lbl(key) {
    try {
        return (_config && _config.labels && _config.labels[key]) || '';
    } catch (e) {
        return '';
    }
}

/** Current customer points from loyaltyApp. */
export function getPoints() {
    if (_loyaltyApp.points != null) return Number(_loyaltyApp.points);
    var config = _loyaltyApp.customer && _loyaltyApp.customer.config;
    return config && config.points ? Number(config.points) : 0;
}
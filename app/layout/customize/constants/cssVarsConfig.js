// ─────────────────────────────────────────────────────────────────────────────
// constants.js
// Static configuration, design tokens, CSS defaults and utility functions.
// Imported by app_customize.jsx and LivePreview.jsx
// ─────────────────────────────────────────────────────────────────────────────

export const LABEL_DEFAULTS = {
    // Header
    headerLabel: "Welcome, [name]",
    pointsLabel: "Account Balance: [points] pts",
    // Nav tabs
    navHome: "Home",
    navEarn: "Earn",
    navRewards: "Rewards",
    navMyRewards: "My Rewards",
    navActivity: "Activity",
    // Home nav cards
    homeCardBrowse: "Browse Rewards",
    homeCardEarn: "Earn Points",
    homeCardRefer: "Refer Friends",
    // Section headers
    sectionActiveRewards: "Active Rewards",
    sectionRecentActivity: "Recent Activity",
    // Activity table columns
    activityColDate: "Date",
    activityColActivity: "Activity",
    activityColPoints: "Points",
    // Empty states
    emptyRewards: "No active rewards available",
    emptyActivity: "No account activities yet",
    // Pagination
    loadMoreBtn: "Load More",
    loadMoreDone: "All loaded",
    // Notification
    notifyRewardHeading: "Success! Use this code at checkout",
    notifyRewardCopyBtn: "Copy",
    notifyInfoClaimBtn: "Claim",
    notifyCopiedText: "Copied!",
    notifyCloseBtn: "Close",
    // Launcher
    launcherTitle: "Loyalty & Rewards",
    launcherSubtitle: "[points] pts",
    // Prizes
    navPrizes: "Prizes",
    navMyPrizes: "My Prizes",
    sectionPrizeRequests: "My Prize Requests",
    emptyPrizes: "No prizes available",
    emptyMyPrizes: "You have no prize requests yet",
    prizeStatusPending: "Pending",
    prizeStatusFulfilled: "Fulfilled",
    prizeStatusCompleted: "Completed",
    prizeStatusCancelled: "Cancelled",
    prizeContactUsText: "Contact us",
    prizeClaimSuccessMsg: "Your request has been submitted! We'll contact you soon to arrange delivery.",
    claimingLabel: "Processing...",
    claimRetryLabel: "Try again",
    // "Update available" banner + block message — deliberately generic and
    // the SAME for every announced version, regardless of what that
    // specific version's admin-only title/description (Version Tracking
    // page) actually says. Customers should never see internal update
    // details (bug fixes, specific features, etc.) — only ever this fixed,
    // reassuring text. See main.preact.jsx's computeUpdateStatus() and
    // checkUpdateRequired.js (server-side — the block message shown when
    // attempting a claim while behind uses this too, not the version's own
    // title/description).
    updateBannerTitle: "Update available",
    updateBannerDesc: "We've made a few improvements to your account. Tap Update to see the latest.",

    // Nav — Referral tab (was missing a configurable field even though
    // Nav.jsx already looked it up with a hardcoded fallback)
    navReferral: "Referral",

    // Guest panel (logged-out view) — GuestPanel.jsx already reads all of
    // these via lbl() with matching hardcoded fallbacks; they just had no
    // admin field to edit them.
    guestTitle: "Earn & Redeem Rewards",
    guestSubtitle: "Join the loyalty program and start earning points on every purchase.",
    guestPerkEarn: "Earn on every order",
    guestPerkRedeem: "Redeem for discounts",
    guestPerkRefer: "Refer & earn more",
    guestCreateAccount: "Create Account",
    guestCreateAccountHint: "Free & takes 30 seconds",
    guestSignIn: "Sign In",
    guestSignInHint: "Already have an account?",

    // Join Program panel (logged-in, not-yet-joined view) — same situation
    // as guest* above, JoinProgramPanel.jsx already wired these.
    joinProgramTitle: "You\u2019re Almost In!",
    joinProgramSubtitle: "You\u2019re signed in, but not enrolled in the loyalty program yet. Join now to start earning points.",
    joinProgramAutoFailTitle: "One More Step",
    joinProgramAutoFailSubtitle: "We couldn\u2019t set up your account automatically. Tap below to join \u2014 it only takes a second.",
    joinProgramJoining: "Joining...",
    joinProgramCta: "Join Our Program",

    // Referral modal — previously entirely hardcoded, not wired to lbl()
    // at all (see ReferralModal.jsx).
    referralModalBrand: "NBL Loyalty",
    referralLoginTitle: "Login to Claim Your Referral Discount",
    referralLoginSubtitle: "Log into your account to unlock your referral discount.",
    referralLoginNote: "Almost there! After you sign in, just head back to our store \u2014 your discount code will be waiting for you right here.",
    referralLoginBtn: "Login / Register",
    referralFormTitle: "Get Your Referral Discount",
    referralFormSubtitle: "Enter your referral code to unlock your discount.",
    referralFormSubmitBtn: "Request Discount Code",
    referralFormVerifying: "Verifying your referral code...",
    referralSuccessTitle: "Your Discount Code",
    referralSuccessCopyBtn: "Copy Code",
    referralSuccessCopiedBtn: "Copied",
    referralImportantHeading: "Important:",
    referralImportantNote1: "One-time code \u2014 use at checkout.",
    referralImportantNote2: "Use it quickly.",
    referralFinishBtn: "Finish & Save",
    referralLockedTitle: "Referral Already Used",
    referralLockedSubtitle: "Only one referral discount is allowed per customer.",

    // Prize claim notification — default label for the tracking link when
    // showTrackingInfo is on and trackingInfo is a real URL (App.jsx).
    prizeTrackingLabel: "Track your order",
};

export const WIDGET_CONFIG_DEFAULTS = {
    showHomeRewardsSection: true,
    showHomeActivitiesSection: true,
    showHomePrizeRequestsSection: true,
    enableToastNotifications: true,
    homeRewardsPerPage: 5,
    homeActivitiesPerPage: 5,
    homePrizeRequestsPerPage: 5,
    myPrizesPerPage: 5,
    paginationMode: "loadmore",
    // Whether a logged-in customer who isn't in the loyalty program yet
    // gets enrolled silently in the background, or sees an explicit
    // "Join our Program" button they have to tap themselves. See
    // useCustomerProvision.js / JoinProgramPanel.jsx for the full flow.
    autoProvisionCustomer: true,
    // Only relevant when autoProvisionCustomer is true — whether the
    // brief silent-provisioning attempt shows a loading overlay in the
    // widget, or provisions invisibly in the background.
    showProvisionLoadingOverlay: true,
    labels: { ...LABEL_DEFAULTS },
    prize: {
        contactUrl: "",
        showAdminNote: true,
        showTrackingInfo: true,
        showRequestDate: true,
        showFulfilledDate: true,
    },
    referral: {
        // Empty = default to the storefront homepage ("/"). See
        // handleLogin() in useReferralModal.js for how this is consumed.
        redirectUrl: "",
        // Whether the app forces a post-login/register return_to redirect
        // at all. When false, handleLogin() sends the customer to Shopify's
        // login/register page with no return_to param — Shopify's own
        // default behaviour decides where they land (redirectUrl above is
        // ignored in that case). See handleLogin() in useReferralModal.js.
        redirectEnabled: true,
        // Path (relative, must start with "/") that the referral link
        // itself points to — i.e. where a friend lands when they click a
        // shared referral link. Empty/invalid falls back to the storefront
        // homepage ("/"). See buildReferralLink() in App.jsx / main.preact.jsx.
        linkPath: "/",
    },
    resync: {
        //   "off"    - do nothing; customers stay on their last-synced config
        //              until their next order/reward/referral event.
        //   "banner" - show the "update available" banner with a manual
        //              "Update" button (see UpdateBanner.jsx / useUpdateBanner.js).
        //   "auto"   - silently resync and reload on the customer's next
        //              visit, no banner, no click needed (see
        //              useAutoUpdateSync.js).
        updateMode: "auto",
        // Tiny non-blocking spinner next to the points balance during any
        // background config resync (periodic hygiene sync OR "auto" mode
        // above) — see Header.jsx / ui.css's .nbl-header__sync-indicator.
        // On by default since it's subtle by design; unrelated to (and
        // does not affect) the separate provision-overlay setting for
        // brand-new customers joining.
        showSyncIndicator: true,
    },
};

export const WIDGET_CONFIG_SECTIONS = [
    {
        key: "behaviour",
        label: "Behaviour",
        description: "Control what sections appear and how content is paged.",
        fields: [
            {
                key: "showHomeRewardsSection",
                label: "Show active rewards on Home tab",
                hint: "Display the 'Active Rewards' section on the Home tab",
                type: "toggle",
                configKey: "showHomeRewardsSection",
                default: true,
            },
            {
                key: "showHomeActivitiesSection",
                label: "Show recent activity on Home tab",
                hint: "Display the 'Recent Activity' section on the Home tab",
                type: "toggle",
                configKey: "showHomeActivitiesSection",
                default: true,
            },
            {
                key: "enableToastNotifications",
                label: "Show toast notifications on page load",
                hint: "When a customer earns points/rewards while away, show a stacked toast above the launcher button next time they visit — like a notification popup. Turn off to disable this entirely.",
                type: "toggle",
                configKey: "enableToastNotifications",
                default: true,
            },
            {
                key: "homeRewardsPerPage",
                label: "Active rewards per page",
                hint: "How many active reward items to show at once on the Home tab",
                type: "range",
                min: 1,
                max: 10,
                unit: "",
                configKey: "homeRewardsPerPage",
                default: 5,
                parseValue: (v) => Number(v),
                displayValue: (v) => Number(v),
            },
            {
                key: "homeActivitiesPerPage",
                label: "Activity rows per page",
                hint: "How many activity rows to show at once on the Home tab",
                type: "range",
                min: 1,
                max: 15,
                unit: "",
                configKey: "homeActivitiesPerPage",
                default: 7,
                parseValue: (v) => Number(v),
                displayValue: (v) => Number(v),
            },
            {
                key: "paginationMode",
                label: "Pagination style",
                hint: "How to load more items in lists — arrow buttons or a Load More button",
                type: "select",
                options: [{ value: "pagination", label: "Arrows" }, { value: "loadmore", label: "Load More button" }],
                configKey: "paginationMode",
                default: "loadmore",
            },
            {
                key: "showHomePrizeRequestsSection",
                label: "Show prize requests on Home tab",
                hint: "Display the 'My Prize Requests' section on the Home tab",
                type: "toggle",
                configKey: "showHomePrizeRequestsSection",
                default: true,
            },
            {
                key: "homePrizeRequestsPerPage",
                label: "Prize requests per page (Home)",
                hint: "How many prize request items to show at once on the Home tab",
                type: "range",
                min: 1,
                max: 10,
                unit: "",
                configKey: "homePrizeRequestsPerPage",
                default: 5,
                parseValue: (v) => Number(v),
                displayValue: (v) => Number(v),
            },
            {
                key: "myPrizesPerPage",
                label: "Prize requests per page (My Prizes tab)",
                hint: "How many prize request items to show at once on the My Prizes tab",
                type: "range",
                min: 1,
                max: 20,
                unit: "",
                configKey: "myPrizesPerPage",
                default: 8,
                parseValue: (v) => Number(v),
                displayValue: (v) => Number(v),
            },
        ],
    },
    {
        key: "prizeNotifications",
        label: "Prize Notifications",
        description: "Control how prize request details appear in the slide-up notification panel.",
        fields: [
            {
                key: "prize_contactUrl",
                label: "Contact page URL",
                hint: "URL shown as a 'Contact us' button on Pending and Cancelled prize notifications. Leave empty to hide the button. E.g. /pages/contact",
                type: "text",
                configKey: "prize.contactUrl",
                default: "",
            },
            {
                key: "prize_showRequestDate",
                label: "Show request date",
                hint: "Display when the prize was requested in the notification",
                type: "toggle",
                configKey: "prize.showRequestDate",
                default: true,
            },
            {
                key: "prize_showFulfilledDate",
                label: "Show dispatch / completion date",
                hint: "Display when the prize was dispatched or completed in the notification",
                type: "toggle",
                configKey: "prize.showFulfilledDate",
                default: true,
            },
            {
                key: "prize_showAdminNote",
                label: "Show admin note",
                hint: "Display the admin note in the notification (e.g. cancellation reason or delivery details)",
                type: "toggle",
                configKey: "prize.showAdminNote",
                default: true,
            },
            {
                key: "prize_showTrackingInfo",
                label: "Show tracking info",
                hint: "Display tracking link or license key in the notification (shown for Fulfilled and Completed prizes)",
                type: "toggle",
                configKey: "prize.showTrackingInfo",
                default: true,
            },
        ],
    },
    {
        key: "referral",
        label: "Referral",
        description: "Control the referral link customers share, and what happens after a customer signs in to claim a referral discount.",
        fields: [
            {
                key: "referral_linkPath",
                label: "Referral link page",
                hint: "The page a friend lands on when they open a shared referral link (the widget then opens the referral popup there automatically). Leave empty to use the storefront homepage. E.g. /pages/referral. Must be a relative path starting with /.",
                type: "text",
                configKey: "referral.linkPath",
                default: "/",
            },
            {
                key: "referral_redirectEnabled",
                label: "Redirect after sign-in / registration",
                hint: "When on, a new customer is sent back to a chosen page after signing in or registering from the referral popup (see the URL field below), so they can come back and see their discount code. When off, the app doesn't force a redirect — Shopify's own default sign-in behaviour applies instead.",
                type: "toggle",
                configKey: "referral.redirectEnabled",
                default: true,
            },
            {
                key: "referral_redirectUrl",
                label: "Post-login redirect URL",
                hint: "Where a new customer lands after signing in or registering from the referral popup, so they can come back and see their discount code. Leave empty to use the storefront homepage. E.g. /pages/welcome. Only used when 'Redirect after sign-in / registration' above is on, and only takes effect on stores using Shopify's newer Customer Accounts — see the note on the Referral tab of the widget for details.",
                type: "text",
                configKey: "referral.redirectUrl",
                default: "",
            },
        ],
    },
    {
        key: "resync",
        label: "Update Notifications",
        description: "Control how customers whose widget data hasn't caught up with a recent change get updated. The banner's actual customer-facing text (when using Banner mode) is set once for all updates under Labels & Text (below) — the title/description you type per-update on the Version Tracking page are for your own internal reference only and are never shown to customers.",
        fields: [
            {
                key: "resync_updateMode",
                label: "Update method",
                hint: "Off: nothing happens until the customer's next order/reward/referral event. Banner: show an 'update available' banner with a manual Update button. Auto-sync: silently resync and refresh in the background on their next visit, no banner or click needed. Manage announcements from the Version Tracking page.",
                type: "select",
                options: [
                    { value: "off", label: "Off" },
                    { value: "banner", label: "Banner (manual)" },
                    { value: "auto", label: "Auto-sync (silent)" },
                ],
                configKey: "resync.updateMode",
                default: "auto",
            },
            {
                key: "resync_showSyncIndicator",
                label: "Show subtle sync indicator",
                hint: "Replaces the points number with a small spinner (in both the header and the floating launcher button) while it's known-stale — a Banner-mode update sitting unclicked, or a background sync actively running (the periodic hygiene sync that quietly keeps points/rewards/transactions accurate, or an Auto-sync (silent) version update above). On by default; turning this off shows the points number as-is at all times instead, never a blocking overlay like the one shown while a brand-new customer is joining.",
                type: "toggle",
                configKey: "resync.showSyncIndicator",
                default: true,
            },
        ],
    },
    {
        key: "onboarding",
        label: "New Customer Onboarding",
        description: "Control how a logged-in customer who isn't in the loyalty program yet gets enrolled — this is a separate setting from Update Notifications above, which only affects customers who've already joined.",
        fields: [
            {
                key: "autoProvisionCustomer",
                label: "Join automatically",
                hint: "On (default): they're enrolled silently in the background the moment they open the widget, with no button to tap. See the 'Loading overlay while joining' option below — only relevant when this is on. Off: the customer sees an explicit 'Join Our Program' button and taps it themselves.",
                type: "toggle",
                configKey: "autoProvisionCustomer",
                default: true,
            },
            {
                key: "showProvisionLoadingOverlay",
                label: "Show loading overlay while joining",
                hint: "Only applies when 'Join automatically' above is on. When on, the widget shows a brief loading overlay during the silent join; when off, it joins invisibly with no visual indicator.",
                type: "toggle",
                configKey: "showProvisionLoadingOverlay",
                default: true,
            },
        ],
    },
    {
        key: "labels",
        label: "Labels & Text",
        description: "Customize all text labels shown inside the widget.",
        fields: [
            { key: "lbl_headerLabel", label: "Header greeting", hint: "Use [name] to insert the customer's name. E.g. 'Welcome, [name]'", type: "label", configKey: "labels.headerLabel", default: LABEL_DEFAULTS.headerLabel },
            { key: "lbl_pointsLabel", label: "Points balance text", hint: "Use [points] to insert the balance. E.g. '[points] pts'", type: "label", configKey: "labels.pointsLabel", default: LABEL_DEFAULTS.pointsLabel },
            { key: "lbl_navHome", label: "Nav — Home tab", hint: "Label shown on the Home navigation tab", type: "label", configKey: "labels.navHome", default: LABEL_DEFAULTS.navHome },
            { key: "lbl_navEarn", label: "Nav — Earn tab", hint: "Label shown on the Earn navigation tab", type: "label", configKey: "labels.navEarn", default: LABEL_DEFAULTS.navEarn },
            { key: "lbl_navRewards", label: "Nav — Rewards tab", hint: "Label shown on the Rewards navigation tab", type: "label", configKey: "labels.navRewards", default: LABEL_DEFAULTS.navRewards },
            { key: "lbl_navMyRewards", label: "Nav — My Rewards tab", hint: "Label shown on the My Rewards navigation tab", type: "label", configKey: "labels.navMyRewards", default: LABEL_DEFAULTS.navMyRewards },
            { key: "lbl_navActivity", label: "Nav — Activity tab", hint: "Label shown on the Activity navigation tab", type: "label", configKey: "labels.navActivity", default: LABEL_DEFAULTS.navActivity },
            { key: "lbl_homeCardBrowse", label: "Home card — Browse Rewards", hint: "Text on the Browse Rewards shortcut card on the Home tab", type: "label", configKey: "labels.homeCardBrowse", default: LABEL_DEFAULTS.homeCardBrowse },
            { key: "lbl_homeCardEarn", label: "Home card — Earn Points", hint: "Text on the Earn Points shortcut card on the Home tab", type: "label", configKey: "labels.homeCardEarn", default: LABEL_DEFAULTS.homeCardEarn },
            { key: "lbl_homeCardRefer", label: "Home card — Refer Friends", hint: "Text on the Refer Friends shortcut card on the Home tab", type: "label", configKey: "labels.homeCardRefer", default: LABEL_DEFAULTS.homeCardRefer },
            { key: "lbl_sectionRewards", label: "Section — Active Rewards", hint: "Heading of the Active Rewards section on the Home tab", type: "label", configKey: "labels.sectionActiveRewards", default: LABEL_DEFAULTS.sectionActiveRewards },
            { key: "lbl_sectionActivity", label: "Section — Recent Activity", hint: "Heading of the Recent Activity section on the Home tab", type: "label", configKey: "labels.sectionRecentActivity", default: LABEL_DEFAULTS.sectionRecentActivity },
            { key: "lbl_activityColDate", label: "Activity table — Date", hint: "Column header for the date column in activity tables", type: "label", configKey: "labels.activityColDate", default: LABEL_DEFAULTS.activityColDate },
            { key: "lbl_activityColAct", label: "Activity table — Activity", hint: "Column header for the activity description column", type: "label", configKey: "labels.activityColActivity", default: LABEL_DEFAULTS.activityColActivity },
            { key: "lbl_activityColPts", label: "Activity table — Points", hint: "Column header for the points column in activity tables", type: "label", configKey: "labels.activityColPoints", default: LABEL_DEFAULTS.activityColPoints },
            { key: "lbl_emptyRewards", label: "Empty state — No rewards", hint: "Message shown when there are no active rewards", type: "label", configKey: "labels.emptyRewards", default: LABEL_DEFAULTS.emptyRewards },
            { key: "lbl_emptyActivity", label: "Empty state — No activity", hint: "Message shown when there are no activity entries yet", type: "label", configKey: "labels.emptyActivity", default: LABEL_DEFAULTS.emptyActivity },
            { key: "lbl_loadMoreBtn", label: "Pagination — Load More", hint: "Text on the Load More button", type: "label", configKey: "labels.loadMoreBtn", default: LABEL_DEFAULTS.loadMoreBtn },
            { key: "lbl_loadMoreDone", label: "Pagination — All loaded", hint: "Text shown when all items have been loaded", type: "label", configKey: "labels.loadMoreDone", default: LABEL_DEFAULTS.loadMoreDone },
            { key: "lbl_notifyRewardHead", label: "Reward popup heading", hint: "Heading text inside the reward earned slide-up panel", type: "label", configKey: "labels.notifyRewardHeading", default: LABEL_DEFAULTS.notifyRewardHeading },
            { key: "lbl_notifyRewardCopy", label: "Reward popup copy button", hint: "Text on the Copy button inside the reward popup", type: "label", configKey: "labels.notifyRewardCopyBtn", default: LABEL_DEFAULTS.notifyRewardCopyBtn },
            { key: "lbl_notifyInfoClaim", label: "Info popup claim button", hint: "Text on the action button inside the info slide-up panel", type: "label", configKey: "labels.notifyInfoClaimBtn", default: LABEL_DEFAULTS.notifyInfoClaimBtn },
            { key: "lbl_notifyCopiedText", label: "Reward popup — Copied confirmation", hint: "Text shown after the reward code is copied", type: "label", configKey: "labels.notifyCopiedText", default: LABEL_DEFAULTS.notifyCopiedText },
            { key: "lbl_notifyCloseBtn", label: "Reward popup — Close button", hint: "Text on the Close button shown after copying the reward code", type: "label", configKey: "labels.notifyCloseBtn", default: LABEL_DEFAULTS.notifyCloseBtn },
            { key: "lbl_launcherTitle", label: "Launcher title", hint: "Main title text on the floating launcher button", type: "label", configKey: "labels.launcherTitle", default: LABEL_DEFAULTS.launcherTitle },
            { key: "lbl_launcherSubtitle", label: "Launcher subtitle", hint: "Text shown below the launcher button title. Use [points] for balance. E.g. '[points] pts'", type: "label", configKey: "labels.launcherSubtitle", default: LABEL_DEFAULTS.launcherSubtitle },
            { key: "lbl_navPrizes", label: "Nav — Prizes tab", hint: "Label shown on the Prizes navigation tab", type: "label", configKey: "labels.navPrizes", default: LABEL_DEFAULTS.navPrizes },
            { key: "lbl_navMyPrizes", label: "Nav — My Prizes tab", hint: "Label shown on the My Prizes navigation tab", type: "label", configKey: "labels.navMyPrizes", default: LABEL_DEFAULTS.navMyPrizes },
            { key: "lbl_sectionPrizeRequests", label: "Section — My Prize Requests", hint: "Heading of the Prize Requests section on the Home tab", type: "label", configKey: "labels.sectionPrizeRequests", default: LABEL_DEFAULTS.sectionPrizeRequests },
            { key: "lbl_emptyPrizes", label: "Empty state — No prizes", hint: "Message shown when there are no prizes available", type: "label", configKey: "labels.emptyPrizes", default: LABEL_DEFAULTS.emptyPrizes },
            { key: "lbl_emptyMyPrizes", label: "Empty state — No prize requests", hint: "Message shown when the customer has no prize requests", type: "label", configKey: "labels.emptyMyPrizes", default: LABEL_DEFAULTS.emptyMyPrizes },
            { key: "lbl_prizeStatusPending", label: "Prize status — Pending", hint: "Text shown when a prize request is pending", type: "label", configKey: "labels.prizeStatusPending", default: LABEL_DEFAULTS.prizeStatusPending },
            { key: "lbl_prizeStatusFulfilled", label: "Prize status — Fulfilled", hint: "Text shown when a prize has been dispatched", type: "label", configKey: "labels.prizeStatusFulfilled", default: LABEL_DEFAULTS.prizeStatusFulfilled },
            { key: "lbl_prizeStatusCompleted", label: "Prize status — Completed", hint: "Text shown when a prize has been delivered", type: "label", configKey: "labels.prizeStatusCompleted", default: LABEL_DEFAULTS.prizeStatusCompleted },
            { key: "lbl_prizeStatusCancelled", label: "Prize status — Cancelled", hint: "Text shown when a prize request has been cancelled", type: "label", configKey: "labels.prizeStatusCancelled", default: LABEL_DEFAULTS.prizeStatusCancelled },
            { key: "lbl_prizeContactUsText", label: "Prize — Contact us button", hint: "Label on the Contact us button shown in prize notifications", type: "label", configKey: "labels.prizeContactUsText", default: LABEL_DEFAULTS.prizeContactUsText },
            { key: "lbl_prizeClaimSuccessMsg", label: "Prize — Claim success message", hint: "Message shown after a prize is successfully claimed", type: "label", configKey: "labels.prizeClaimSuccessMsg", default: LABEL_DEFAULTS.prizeClaimSuccessMsg },
            { key: "lbl_claimingLabel", label: "Claim button — Processing", hint: "Text on the claim button while the request is being submitted", type: "label", configKey: "labels.claimingLabel", default: LABEL_DEFAULTS.claimingLabel },
            { key: "lbl_claimRetryLabel", label: "Claim button — Retry", hint: "Text on the claim button after a failed attempt", type: "label", configKey: "labels.claimRetryLabel", default: LABEL_DEFAULTS.claimRetryLabel },
            { key: "lbl_updateBannerTitle", label: "Update banner — Title", hint: "Shown to every customer whenever ANY update is announced (Version Tracking page) — deliberately generic, the same text every time. Never reveals what specifically changed.", type: "label", configKey: "labels.updateBannerTitle", default: LABEL_DEFAULTS.updateBannerTitle },
            { key: "lbl_updateBannerDesc", label: "Update banner — Description", hint: "Shown under the title above, and also as the message when a customer's claim is blocked pending an update. Same generic text for every announced version.", type: "label", configKey: "labels.updateBannerDesc", default: LABEL_DEFAULTS.updateBannerDesc },

            { key: "lbl_navReferral", label: "Nav — Referral tab", hint: "Label shown on the Referral navigation tab", type: "label", configKey: "labels.navReferral", default: LABEL_DEFAULTS.navReferral },

            { key: "lbl_guestTitle", label: "Guest — Title", hint: "Heading shown to logged-out visitors", type: "label", configKey: "labels.guestTitle", default: LABEL_DEFAULTS.guestTitle },
            { key: "lbl_guestSubtitle", label: "Guest — Subtitle", hint: "Subtitle shown to logged-out visitors", type: "label", configKey: "labels.guestSubtitle", default: LABEL_DEFAULTS.guestSubtitle },
            { key: "lbl_guestPerkEarn", label: "Guest — Perk: Earn", hint: "First perk shown to logged-out visitors", type: "label", configKey: "labels.guestPerkEarn", default: LABEL_DEFAULTS.guestPerkEarn },
            { key: "lbl_guestPerkRedeem", label: "Guest — Perk: Redeem", hint: "Second perk shown to logged-out visitors", type: "label", configKey: "labels.guestPerkRedeem", default: LABEL_DEFAULTS.guestPerkRedeem },
            { key: "lbl_guestPerkRefer", label: "Guest — Perk: Refer", hint: "Third perk shown to logged-out visitors", type: "label", configKey: "labels.guestPerkRefer", default: LABEL_DEFAULTS.guestPerkRefer },
            { key: "lbl_guestCreateAccount", label: "Guest — Create account button", hint: "Primary button text for logged-out visitors", type: "label", configKey: "labels.guestCreateAccount", default: LABEL_DEFAULTS.guestCreateAccount },
            { key: "lbl_guestCreateAccountHint", label: "Guest — Create account hint", hint: "Small text under the create account button", type: "label", configKey: "labels.guestCreateAccountHint", default: LABEL_DEFAULTS.guestCreateAccountHint },
            { key: "lbl_guestSignIn", label: "Guest — Sign in button", hint: "Secondary button text for logged-out visitors", type: "label", configKey: "labels.guestSignIn", default: LABEL_DEFAULTS.guestSignIn },
            { key: "lbl_guestSignInHint", label: "Guest — Sign in hint", hint: "Small text under the sign in button", type: "label", configKey: "labels.guestSignInHint", default: LABEL_DEFAULTS.guestSignInHint },

            { key: "lbl_joinProgramTitle", label: "Join panel — Title", hint: "Heading shown to a logged-in customer who hasn't joined yet", type: "label", configKey: "labels.joinProgramTitle", default: LABEL_DEFAULTS.joinProgramTitle },
            { key: "lbl_joinProgramSubtitle", label: "Join panel — Subtitle", hint: "Subtitle shown to a logged-in customer who hasn't joined yet", type: "label", configKey: "labels.joinProgramSubtitle", default: LABEL_DEFAULTS.joinProgramSubtitle },
            { key: "lbl_joinProgramAutoFailTitle", label: "Join panel — Title (auto-join failed)", hint: "Heading shown when silent auto-provisioning failed and the customer has to join manually", type: "label", configKey: "labels.joinProgramAutoFailTitle", default: LABEL_DEFAULTS.joinProgramAutoFailTitle },
            { key: "lbl_joinProgramAutoFailSubtitle", label: "Join panel — Subtitle (auto-join failed)", hint: "Subtitle shown when silent auto-provisioning failed", type: "label", configKey: "labels.joinProgramAutoFailSubtitle", default: LABEL_DEFAULTS.joinProgramAutoFailSubtitle },
            { key: "lbl_joinProgramJoining", label: "Join panel — Joining button (loading)", hint: "Button text shown while the join request is in flight", type: "label", configKey: "labels.joinProgramJoining", default: LABEL_DEFAULTS.joinProgramJoining },
            { key: "lbl_joinProgramCta", label: "Join panel — Join button", hint: "Main call-to-action button text", type: "label", configKey: "labels.joinProgramCta", default: LABEL_DEFAULTS.joinProgramCta },

            { key: "lbl_referralModalBrand", label: "Referral modal — Brand text", hint: "Small brand pill shown at the top of every step of the referral modal", type: "label", configKey: "labels.referralModalBrand", default: LABEL_DEFAULTS.referralModalBrand },
            { key: "lbl_referralLoginTitle", label: "Referral modal — Login title", hint: "Title shown when a guest needs to log in to claim a referral discount", type: "label", configKey: "labels.referralLoginTitle", default: LABEL_DEFAULTS.referralLoginTitle },
            { key: "lbl_referralLoginSubtitle", label: "Referral modal — Login subtitle", hint: "Subtitle on the login step", type: "label", configKey: "labels.referralLoginSubtitle", default: LABEL_DEFAULTS.referralLoginSubtitle },
            { key: "lbl_referralLoginNote", label: "Referral modal — Login note", hint: "Small reassurance note on the login step", type: "label", configKey: "labels.referralLoginNote", default: LABEL_DEFAULTS.referralLoginNote },
            { key: "lbl_referralLoginBtn", label: "Referral modal — Login button", hint: "Button text on the login step", type: "label", configKey: "labels.referralLoginBtn", default: LABEL_DEFAULTS.referralLoginBtn },
            { key: "lbl_referralFormTitle", label: "Referral modal — Form title", hint: "Title on the referral code entry step", type: "label", configKey: "labels.referralFormTitle", default: LABEL_DEFAULTS.referralFormTitle },
            { key: "lbl_referralFormSubtitle", label: "Referral modal — Form subtitle", hint: "Subtitle on the referral code entry step", type: "label", configKey: "labels.referralFormSubtitle", default: LABEL_DEFAULTS.referralFormSubtitle },
            { key: "lbl_referralFormSubmitBtn", label: "Referral modal — Submit button", hint: "Button text to request the discount code", type: "label", configKey: "labels.referralFormSubmitBtn", default: LABEL_DEFAULTS.referralFormSubmitBtn },
            { key: "lbl_referralFormVerifying", label: "Referral modal — Verifying text", hint: "Shown while the referral code is being verified", type: "label", configKey: "labels.referralFormVerifying", default: LABEL_DEFAULTS.referralFormVerifying },
            { key: "lbl_referralSuccessTitle", label: "Referral modal — Success title", hint: "Title shown once a discount code is ready", type: "label", configKey: "labels.referralSuccessTitle", default: LABEL_DEFAULTS.referralSuccessTitle },
            { key: "lbl_referralSuccessCopyBtn", label: "Referral modal — Copy button", hint: "Button text to copy the discount code", type: "label", configKey: "labels.referralSuccessCopyBtn", default: LABEL_DEFAULTS.referralSuccessCopyBtn },
            { key: "lbl_referralSuccessCopiedBtn", label: "Referral modal — Copied button", hint: "Button text after the code has been copied", type: "label", configKey: "labels.referralSuccessCopiedBtn", default: LABEL_DEFAULTS.referralSuccessCopiedBtn },
            { key: "lbl_referralImportantHeading", label: "Referral modal — Important heading", hint: "Heading on the important-notes box", type: "label", configKey: "labels.referralImportantHeading", default: LABEL_DEFAULTS.referralImportantHeading },
            { key: "lbl_referralImportantNote1", label: "Referral modal — Important note 1", hint: "First bullet in the important-notes box", type: "label", configKey: "labels.referralImportantNote1", default: LABEL_DEFAULTS.referralImportantNote1 },
            { key: "lbl_referralImportantNote2", label: "Referral modal — Important note 2", hint: "Second bullet in the important-notes box", type: "label", configKey: "labels.referralImportantNote2", default: LABEL_DEFAULTS.referralImportantNote2 },
            { key: "lbl_referralFinishBtn", label: "Referral modal — Finish button", hint: "Button text to close the modal after copying the code", type: "label", configKey: "labels.referralFinishBtn", default: LABEL_DEFAULTS.referralFinishBtn },
            { key: "lbl_referralLockedTitle", label: "Referral modal — Locked title", hint: "Title shown when a customer already used a referral discount", type: "label", configKey: "labels.referralLockedTitle", default: LABEL_DEFAULTS.referralLockedTitle },
            { key: "lbl_referralLockedSubtitle", label: "Referral modal — Locked subtitle", hint: "Subtitle shown when a customer already used a referral discount", type: "label", configKey: "labels.referralLockedSubtitle", default: LABEL_DEFAULTS.referralLockedSubtitle },

            { key: "lbl_prizeTrackingLabel", label: "Prize — Tracking link text", hint: "Default text for the tracking link shown on a fulfilled/completed prize claim, when tracking info is a real URL", type: "label", configKey: "labels.prizeTrackingLabel", default: LABEL_DEFAULTS.prizeTrackingLabel },
        ],
    },
];

// Groups the flat "labels" section's ~40 fields into a left-nav-able set of
// sub-sections for the Labels & Text tab (mirrors the Widget Config tab's
// section nav, see ConfigTab.jsx) — instead of one long undifferentiated
// list. Built by filtering the SAME field objects already defined above (by
// `key`), not duplicating them, so a field's label/hint/default only ever
// needs editing in one place.
const LABEL_GROUP_FIELD_KEYS = {
    header: ["lbl_headerLabel", "lbl_pointsLabel"],
    navigation: ["lbl_navHome", "lbl_navEarn", "lbl_navRewards", "lbl_navMyRewards", "lbl_navActivity", "lbl_navPrizes", "lbl_navMyPrizes", "lbl_navReferral"],
    home: ["lbl_homeCardBrowse", "lbl_homeCardEarn", "lbl_homeCardRefer", "lbl_sectionRewards", "lbl_sectionActivity", "lbl_sectionPrizeRequests"],
    lists: ["lbl_activityColDate", "lbl_activityColAct", "lbl_activityColPts", "lbl_emptyRewards", "lbl_emptyActivity", "lbl_emptyPrizes", "lbl_emptyMyPrizes", "lbl_loadMoreBtn", "lbl_loadMoreDone"],
    rewards: ["lbl_notifyRewardHead", "lbl_notifyRewardCopy", "lbl_notifyInfoClaim", "lbl_notifyCopiedText", "lbl_notifyCloseBtn", "lbl_claimingLabel", "lbl_claimRetryLabel"],
    prizes: ["lbl_prizeStatusPending", "lbl_prizeStatusFulfilled", "lbl_prizeStatusCompleted", "lbl_prizeStatusCancelled", "lbl_prizeContactUsText", "lbl_prizeClaimSuccessMsg", "lbl_prizeTrackingLabel"],
    launcher: ["lbl_launcherTitle", "lbl_launcherSubtitle"],
    updateBanner: ["lbl_updateBannerTitle", "lbl_updateBannerDesc"],
    guestJoin: [
        "lbl_guestTitle", "lbl_guestSubtitle", "lbl_guestPerkEarn", "lbl_guestPerkRedeem", "lbl_guestPerkRefer",
        "lbl_guestCreateAccount", "lbl_guestCreateAccountHint", "lbl_guestSignIn", "lbl_guestSignInHint",
        "lbl_joinProgramTitle", "lbl_joinProgramSubtitle", "lbl_joinProgramAutoFailTitle", "lbl_joinProgramAutoFailSubtitle",
        "lbl_joinProgramJoining", "lbl_joinProgramCta",
    ],
    referralModal: [
        "lbl_referralModalBrand", "lbl_referralLoginTitle", "lbl_referralLoginSubtitle", "lbl_referralLoginNote", "lbl_referralLoginBtn",
        "lbl_referralFormTitle", "lbl_referralFormSubtitle", "lbl_referralFormSubmitBtn", "lbl_referralFormVerifying",
        "lbl_referralSuccessTitle", "lbl_referralSuccessCopyBtn", "lbl_referralSuccessCopiedBtn",
        "lbl_referralImportantHeading", "lbl_referralImportantNote1", "lbl_referralImportantNote2", "lbl_referralFinishBtn",
        "lbl_referralLockedTitle", "lbl_referralLockedSubtitle",
    ],
};

const LABEL_GROUP_META = {
    header: { label: "Header & Points", description: "The greeting and points balance text shown at the top of the widget." },
    navigation: { label: "Navigation Tabs", description: "Labels for each tab in the widget's navigation bar." },
    home: { label: "Home Tab", description: "Shortcut cards and section headings shown on the Home tab." },
    lists: { label: "Lists & Empty States", description: "Table column headers, empty-state messages, and the load-more control." },
    rewards: { label: "Reward Redemption", description: "Text shown when a customer redeems or views a voucher reward." },
    prizes: { label: "Physical Prizes", description: "Status text and messages for physical prize requests." },
    launcher: { label: "Launcher Button", description: "Text on the floating button that opens the widget." },
    updateBanner: { label: "Update Banner", description: "Text shown in the \"update available\" banner (Banner mode) and as the claim-blocked message." },
    guestJoin: { label: "Guest & Join Panel", description: "Text shown to logged-out visitors, and to logged-in customers who haven't joined the program yet." },
    referralModal: { label: "Referral Modal", description: "All text in the pop-up a friend sees when they open a referral link — login, code entry, success, and already-used states." },
};

export const LABEL_GROUPS = (() => {
    const labelsSection = WIDGET_CONFIG_SECTIONS.find((s) => s.key === "labels");
    const allFields = labelsSection ? labelsSection.fields : [];
    return Object.keys(LABEL_GROUP_FIELD_KEYS).map((groupKey) => ({
        key: groupKey,
        label: LABEL_GROUP_META[groupKey].label,
        description: LABEL_GROUP_META[groupKey].description,
        fields: LABEL_GROUP_FIELD_KEYS[groupKey]
            .map((fieldKey) => allFields.find((f) => f.key === fieldKey))
            .filter(Boolean),
    }));
})();

export const SIMPLE_SECTIONS = [
    {
        key: "header",
        label: "Header",
        description: "The coloured strip at the top of the widget — background, text and points badge.",
        fields: [
            { key: "headerBg", label: "Header color", hint: "Background color of the banner at the top of your widget", type: "color", maps: ["--nbl-header-bg"], default: "#8b5cf6" },
            { key: "headerColor", label: "Header title color", hint: "Color of the welcome text shown in the header", type: "color", maps: ["--nbl-header-color"], default: "#ffffff" },
            { key: "headerTitleSize", label: "Title size", hint: "How large the welcome title appears in the header", type: "range", min: 12, max: 22, unit: "px", maps: ["--nbl-header-title-font-size"], default: "16px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
            { key: "pointsBg", label: "Points pill color", hint: "Background color of the points balance pill in the header", type: "color", maps: ["--nbl-points-bg"], default: "rgba(255, 255, 255, 0.2)", resolvedDefault: "#ffffff" },
            { key: "pointsColor", label: "Points pill text", hint: "Color of the number shown inside the points balance pill", type: "color", maps: ["--nbl-points-color"], default: "#ffffff" },
        ],
    },
    {
        key: "navigation",
        label: "Navigation Bar",
        description: "The tab bar below the header — background, tab text, active indicator and chevrons.",
        fields: [
            { key: "navBg", label: "Tab bar background", hint: "Background color of the navigation area below the header", type: "color", maps: ["--nbl-nav-bg"], default: "#ffffff" },
            { key: "navBorderColor", label: "Tab bar bottom line", hint: "Color of the divider line below the tab bar", type: "color", maps: ["--nbl-nav-border-color"], default: "#e9e7f0" },
            { key: "navItemColor", label: "Inactive tab color", hint: "Color of tabs that are not currently selected", type: "color", maps: ["--nbl-nav-item-color"], default: "#6b7280" },
            { key: "navActiveColor", label: "Selected tab color", hint: "Color of the currently active tab label and its underline", type: "color", maps: ["--nbl-nav-active-color", "--nbl-nav-active-border"], default: "#8b5cf6" },
            { key: "navChevronColor", label: "Scroll arrow color", hint: "Color of the left/right arrows that appear when there are too many tabs to show", type: "color", maps: ["--nbl-nav-chevron-color"], default: "#6b7280" },
            { key: "navChevronBg", label: "Scroll arrow background", hint: "Background behind the scroll arrows", type: "color", maps: ["--nbl-nav-chevron-bg"], default: "#ffffff" },
            { key: "navItemFontSize", label: "Tab label size", hint: "How large the tab label text appears", type: "range", min: 10, max: 16, unit: "px", maps: ["--nbl-nav-item-font-size"], default: "12px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
        ],
    },
    {
        key: "brand",
        label: "Brand Colors",
        description: "Primary and accent colors that flow through the whole widget.",
        fields: [
            { key: "primary", label: "Brand primary color", hint: "Your main brand color — used for active tabs and highlights throughout the widget", type: "color", maps: ["--nbl-primary", "--nbl-nav-active-color", "--nbl-nav-active-border", "--nbl-loadmore-color"], default: "#8b5cf6" },
            { key: "accent", label: "Accent color", hint: "Secondary color used for active reward highlights and positive indicators", type: "color", maps: ["--nbl-accent", "--nbl-item-active-border"], default: "#4ecba8" },
        ],
    },
    {
        key: "buttons",
        label: "Action Buttons",
        description: "The CTA buttons shared across all widget tabs.",
        fields: [
            { key: "btnBg", label: "Button background", hint: "Background color of action buttons like 'Claim Reward'", type: "color", maps: ["--nbl-btn-bg", "--nbl-btn-border"], default: "#4ecba8" },
            { key: "btnColor", label: "Button text color", hint: "Color of the text written on buttons", type: "color", maps: ["--nbl-btn-color"], default: "#ffffff" },
            { key: "btnRadius", label: "Button corner roundness", hint: "How rounded the button corners appear — 0 = sharp, 24 = very rounded", type: "range", min: 0, max: 24, unit: "px", maps: ["--nbl-btn-radius"], default: "10px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
            { key: "btnFontSize", label: "Button text size", hint: "How large the text on buttons appears", type: "range", min: 11, max: 18, unit: "px", maps: ["--nbl-btn-font-size"], default: "14px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
        ],
    },
    {
        key: "text",
        label: "Text & Fonts",
        description: "Text colors and font size scale used throughout the widget.",
        fields: [
            { key: "textMain", label: "Main text color", hint: "Color for headings, reward names and important labels", type: "color", maps: ["--nbl-text"], default: "#1a1a1a" },
            { key: "textMuted", label: "Subtitle / hint color", hint: "Color for descriptions, dates and secondary information", type: "color", maps: ["--nbl-text-muted"], default: "#6b7280" },
            { key: "textBase", label: "Body text size", hint: "Standard text size used throughout the widget", type: "range", min: 11, max: 16, unit: "px", maps: ["--nbl-text-base"], default: "13px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
            { key: "textLg", label: "Heading text size", hint: "Size of headings and section titles", type: "range", min: 13, max: 22, unit: "px", maps: ["--nbl-text-lg"], default: "16px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
        ],
    },
    {
        key: "surfaces",
        label: "Surfaces & Layout",
        description: "Widget body background, card backgrounds, borders and border radius.",
        fields: [
            { key: "surface", label: "Widget background", hint: "Main background color of the widget content area", type: "color", maps: ["--nbl-surface"], default: "#ffffff" },
            { key: "surface2", label: "Card background", hint: "Background color for reward cards and section panels", type: "color", maps: ["--nbl-surface-2", "--nbl-item-bg", "--nbl-section-header-bg", "--nbl-card-bg"], default: "#f8f7ff" },
            { key: "surfaceHover", label: "Hover highlight", hint: "Background color that appears when hovering over clickable items", type: "color", maps: ["--nbl-surface-hover"], default: "#f3f1fc" },
            { key: "borderColor", label: "Border & divider color", hint: "Color of lines that separate sections and outline cards", type: "color", maps: ["--nbl-border", "--nbl-nav-border-color", "--nbl-card-border", "--nbl-item-border"], default: "#e9e7f0" },
            { key: "radius", label: "Widget corner roundness", hint: "How rounded the outer corners of the widget appear", type: "range", min: 0, max: 28, unit: "px", maps: ["--nbl-radius", "--nbl-radius-xl"], default: "16px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
            { key: "cardRadius", label: "Card corner roundness", hint: "How rounded the corners of cards and rows appear", type: "range", min: 0, max: 20, unit: "px", maps: ["--nbl-card-radius", "--nbl-item-radius", "--nbl-radius-lg"], default: "12px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
            { key: "widgetBodyPadding", label: "Content area spacing", hint: "Inner spacing of the main widget content area", type: "text", maps: ["--nbl-widget-body-padding"], default: "14px 14px 24px" },
        ],
    },
    {
        key: "rewards",
        label: "Reward Items",
        description: "Cards shown in the Rewards and Active Rewards tabs.",
        fields: [
            { key: "rewardItemBg", label: "Reward card background", hint: "Background color of each reward item card", type: "color", maps: ["--nbl-item-bg"], default: "#f8f7ff" },
            { key: "rewardItemActiveBg", label: "Redeemed card background", hint: "Background color of a reward card that has been claimed or is active", type: "color", maps: ["--nbl-item-active-bg"], default: "#f0fdf9" },
            { key: "rewardItemActiveBorder", label: "Redeemed card border", hint: "Border color highlighting a claimed or active reward card", type: "color", maps: ["--nbl-item-active-border"], default: "#4ecba8" },
            { key: "rewardTitleFontSize", label: "Reward name size", hint: "How large the reward title text appears on each card", type: "range", min: 11, max: 17, unit: "px", maps: ["--nbl-item-title-font-size"], default: "13.5px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
        ],
    },
    {
        key: "activity",
        label: "Activity Table",
        description: "Points history rows — dividers, earned/spent colors and typography.",
        fields: [
            { key: "activityBorderColor", label: "Row separator color", hint: "Color of the thin line between activity history rows", type: "color", maps: ["--nbl-activity-border-color"], default: "rgba(0,0,0,0.04)" },
            { key: "activityPositive", label: "Points earned color", hint: "Color of the '+' number shown when points are added to the account", type: "color", maps: ["--nbl-activity-positive-color"], default: "#16a34a" },
            { key: "activityNegative", label: "Points spent color", hint: "Color of the '−' number shown when points are used", type: "color", maps: ["--nbl-activity-negative-color"], default: "#dc2626" },
            { key: "activityRowFontSize", label: "Row text size", hint: "How large the text in each activity history row appears", type: "range", min: 10, max: 15, unit: "px", maps: ["--nbl-activity-row-font-size"], default: "12px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
        ],
    },
    {
        key: "pagination",
        label: "Pagination",
        description: "Arrow buttons, dot indicators and the Load More button.",
        fields: [
            { key: "paginationBtnBg", label: "Navigation arrow background", hint: "Background color of the previous/next arrow buttons", type: "color", maps: ["--nbl-pagination-btn-bg"], default: "#ffffff" },
            { key: "paginationBtnColor", label: "Navigation arrow color", hint: "Color of the arrow icon inside the prev/next buttons", type: "color", maps: ["--nbl-pagination-btn-color"], default: "#6b7280" },
            { key: "paginationBtnRadius", label: "Navigation arrow roundness", hint: "How rounded the corners of navigation arrow buttons appear", type: "range", min: 0, max: 20, unit: "px", maps: ["--nbl-pagination-btn-radius"], default: "10px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
            { key: "loadmoreBg", label: "'Load More' button background", hint: "Background color of the Load More button at the bottom of lists", type: "color", maps: ["--nbl-loadmore-bg"], default: "#ffffff" },
            { key: "loadmoreColor", label: "'Load More' text color", hint: "Color of the text on the Load More button", type: "color", maps: ["--nbl-loadmore-color"], default: "#8b5cf6" },
            { key: "loadmoreRadius", label: "'Load More' corner roundness", hint: "How rounded the corners of the Load More button appear", type: "range", min: 0, max: 20, unit: "px", maps: ["--nbl-loadmore-radius"], default: "12px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
        ],
    },
    {
        key: "notifications",
        label: "Notification Panel",
        description: "The in-widget slide-up panel — shown when a reward code is issued, a prize claim is confirmed, or a status is displayed. One consistent solid design for every message.",
        fields: [
            { key: "notifyBg", label: "Background color", hint: "Solid background color of the notification panel", type: "color", maps: ["--nbl-notify-bg"], default: "#15803d" },
            { key: "notifyTextColor", label: "Text color", hint: "Color of all text inside the notification panel", type: "color", maps: ["--nbl-notify-text-color"], default: "#ffffff" },
            { key: "notifyBorderColor", label: "Border color", hint: "Color of borders, dividers and the code box outline inside the panel", type: "color", maps: ["--nbl-notify-border-color"], default: "#166534" },
            { key: "notifyBtnBg", label: "Button background", hint: "Background color of the Copy / Claim button", type: "color", maps: ["--nbl-notify-btn-bg"], default: "#ffffff" },
            { key: "notifyBtnTextColor", label: "Button text color", hint: "Text color of the Copy / Claim button", type: "color", maps: ["--nbl-notify-btn-text-color"], default: "#15803d" },
            { key: "notifyBtnBorderColor", label: "Button border color", hint: "Border color of the Copy / Claim button", type: "color", maps: ["--nbl-notify-btn-border-color"], default: "#ffffff" },
        ],
    },
    {
        key: "updateBanner",
        label: "Update Banner",
        description: "The 'an update is available' strip shown below the header when a customer's account hasn't synced an announced update yet (see Update Notifications and the Version Tracking page).",
        fields: [
            { key: "updateBannerBg", label: "Background color", hint: "Background color of the update banner strip", type: "color", maps: ["--nbl-update-banner-bg"], default: "var(--nbl-primary-light)", resolvedDefault: "#f3f1fc" },
            { key: "updateBannerBorderColor", label: "Border color", hint: "Border color around the update banner strip", type: "color", maps: ["--nbl-update-banner-border-color"], default: "var(--nbl-primary)", resolvedDefault: "#7c3aed" },
            { key: "updateBannerIconColor", label: "Icon color", hint: "Color of the star icon inside the update banner", type: "color", maps: ["--nbl-update-banner-icon-color"], default: "var(--nbl-primary)", resolvedDefault: "#7c3aed" },
            { key: "updateBannerTitleColor", label: "Title text color", hint: "Color of the bold title line inside the update banner", type: "color", maps: ["--nbl-update-banner-title-color"], default: "var(--nbl-text)", resolvedDefault: "#1a1a2e" },
            { key: "updateBannerDescColor", label: "Description text color", hint: "Color of the smaller description line inside the update banner", type: "color", maps: ["--nbl-update-banner-desc-color"], default: "var(--nbl-text-muted)", resolvedDefault: "#5b5b76" },
            { key: "updateBannerBtnBg", label: "Update button background", hint: "Background color of the Update button", type: "color", maps: ["--nbl-update-banner-btn-bg"], default: "var(--nbl-primary)", resolvedDefault: "#7c3aed" },
            { key: "updateBannerBtnColor", label: "Update button text color", hint: "Text color of the Update button", type: "color", maps: ["--nbl-update-banner-btn-color"], default: "var(--nbl-btn-color)", resolvedDefault: "#ffffff" },
            { key: "updateBannerCloseColor", label: "Close icon color", hint: "Color of the dismiss (X) icon inside the update banner", type: "color", maps: ["--nbl-update-banner-close-color"], default: "var(--nbl-text-muted)", resolvedDefault: "#5b5b76" },
        ],
    },
    {
        key: "status",
        label: "Status Colors",
        description: "Semantic success / error / warning / info tints used in alerts and badges.",
        fields: [
            { key: "statusSuccessBg", label: "Success highlight color", hint: "Background color used in success messages and badges", type: "color", maps: ["--nbl-status-success-bg"], default: "#f0fdf4" },
            { key: "statusSuccessColor", label: "Success text color", hint: "Color of text inside success messages", type: "color", maps: ["--nbl-status-success-color", "--nbl-status-success-text"], default: "#166534" },
            { key: "statusErrorBg", label: "Error highlight color", hint: "Background color used in error messages", type: "color", maps: ["--nbl-status-error-bg"], default: "#fef2f2" },
            { key: "statusErrorColor", label: "Error text color", hint: "Color of text inside error messages", type: "color", maps: ["--nbl-status-error-color"], default: "#b91c1c" },
            { key: "statusWarningBg", label: "Warning highlight color", hint: "Background color used in warning messages", type: "color", maps: ["--nbl-status-warning-bg"], default: "#fffbeb" },
            { key: "statusWarningColor", label: "Warning text color", hint: "Color of text inside warning messages", type: "color", maps: ["--nbl-status-warning-color", "--nbl-status-warning-strong"], default: "#854d0e" },
            { key: "statusInfoBg", label: "Info highlight color", hint: "Background color used in informational badges", type: "color", maps: ["--nbl-status-info-bg"], default: "#eff6ff" },
            { key: "statusInfoColor", label: "Info text color", hint: "Color of text inside informational messages", type: "color", maps: ["--nbl-status-info-color"], default: "#1e40af" },
        ],
    },
    {
        key: "toast",
        label: "Toast Notifications",
        description: "The small stacked pop-ups that appear above the launcher button when a customer returns after earning points/rewards while away.",
        fields: [
            { key: "toastBg", label: "Toast background", hint: "Background color of each toast notification", type: "color", maps: ["--nbl-toast-bg"], default: "#ffffff", resolvedDefault: "#ffffff" },
            { key: "toastIconColor", label: "Toast icon color", hint: "Color of the icon shown inside each toast", type: "color", maps: ["--nbl-toast-icon-color"], default: "var(--nbl-primary)", resolvedDefault: "#8b5cf6" },
            { key: "toastTextColor", label: "Toast text color", hint: "Color of the message text inside each toast", type: "color", maps: ["--nbl-toast-text-color"], default: "var(--nbl-text)", resolvedDefault: "#1a1a1a" },
            { key: "toastRadius", label: "Toast corner roundness", hint: "How rounded the corners of each toast appear", type: "range", min: 0, max: 28, unit: "px", maps: ["--nbl-toast-radius"], default: "16px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
            { key: "toastShadow", label: "Toast shadow", hint: "How strong the drop shadow under each toast appears", type: "select", options: [{ value: "none", label: "None" }, { value: "0 2px 8px rgba(0,0,0,0.08)", label: "Subtle" }, { value: "0 4px 20px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.06)", label: "Medium (default)" }, { value: "0 10px 32px rgba(0,0,0,0.2)", label: "Strong" }], maps: ["--nbl-toast-shadow"], default: "0 4px 20px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.06)" },
        ],
    },
    {
        key: "modal",
        label: "Referral Modal",
        description: "The referral flow modal that overlays the widget.",
        fields: [
            { key: "modalBg", label: "Popup background", hint: "Background color of the referral invite popup", type: "color", maps: ["--nbl-modal-bg"], default: "#ffffff" },
            { key: "modalRadius", label: "Popup corner roundness", hint: "How rounded the corners of the popup appear", type: "range", min: 0, max: 28, unit: "px", maps: ["--nbl-modal-radius"], default: "20px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
            { key: "modalPadding", label: "Popup inner spacing", hint: "Padding inside the popup content area", type: "text", maps: ["--nbl-modal-padding"], default: "24px 22px 22px" },
            { key: "modalTitleColor", label: "Popup title color", hint: "Color of the large heading text in the popup", type: "color", maps: ["--nbl-modal-title-color"], default: "#111827" },
            { key: "modalTextColor", label: "Popup body text", hint: "Color of the regular paragraph text in the popup", type: "color", maps: ["--nbl-modal-text-color"], default: "#374151" },
            { key: "modalMutedColor", label: "Popup hint text color", hint: "Color of smaller secondary text in the popup", type: "color", maps: ["--nbl-modal-muted-color"], default: "#9ca3af" },
            { key: "modalInputBg", label: "Text field background", hint: "Background color of input boxes inside the popup", type: "color", maps: ["--nbl-modal-input-bg"], default: "#f9fafb" },
            { key: "modalInputBorder", label: "Text field border", hint: "Border color around input boxes", type: "color", maps: ["--nbl-modal-input-border"], default: "#e5e7eb" },
            { key: "modalInputFocus", label: "Text field focus color", hint: "Border color that appears when clicking into an input box", type: "color", maps: ["--nbl-modal-input-focus"], default: "#16a34a" },
            { key: "modalBtnBg", label: "Popup button color", hint: "Background color of the main action button in the popup", type: "color", maps: ["--nbl-modal-btn-primary-bg"], default: "#111827" },
            { key: "modalBtnColor", label: "Popup button text color", hint: "Color of the text on the main action button", type: "color", maps: ["--nbl-modal-btn-primary-color"], default: "#ffffff" },
            { key: "modalBtnHover", label: "Popup button hover color", hint: "Background color of the main action button on hover", type: "color", maps: ["--nbl-modal-btn-primary-hover"], default: "#1f2937" },
            { key: "modalFinishBg", label: "'Finish' button color", hint: "Background color of the Finish/Done button shown after a referral is completed", type: "color", maps: ["--nbl-modal-btn-finish-bg"], default: "#15803d" },
            { key: "modalFinishColor", label: "'Finish' button text color", hint: "Color of the text on the Finish/Done button", type: "color", maps: ["--nbl-modal-btn-finish-color"], default: "#ffffff" },
            { key: "modalFinishHover", label: "'Finish' button hover color", hint: "Background color of the Finish/Done button on hover", type: "color", maps: ["--nbl-modal-btn-finish-hover"], default: "#166534" },
            { key: "modalCodeBg", label: "Referral code box color", hint: "Background color of the box that displays the referral link", type: "color", maps: ["--nbl-modal-code-bg"], default: "#f8fafc" },
            { key: "modalCodeBorder", label: "Referral code box border", hint: "Border color around the referral link box", type: "color", maps: ["--nbl-modal-code-border"], default: "#d1d5db" },
            { key: "modalCodeHoverBg", label: "Referral code box — hover background", hint: "Background color of the referral link box when hovered", type: "color", maps: ["--nbl-modal-code-hover-bg"], default: "#f0fdf4" },
            { key: "modalCodeHoverBorder", label: "Referral code box — hover border", hint: "Border color of the referral link box when hovered", type: "color", maps: ["--nbl-modal-code-hover-border"], default: "#16a34a" },
            { key: "modalBrandBg", label: "App badge background", hint: "Background color of the app name badge at the top of the popup", type: "color", maps: ["--nbl-modal-brand-bg"], default: "#ecfdf5" },
            { key: "modalBrandColor", label: "App badge text color", hint: "Color of the text inside the app name badge", type: "color", maps: ["--nbl-modal-brand-color"], default: "#15803d" },
            { key: "referralCopyBtnBg", label: "Copy-link button color", hint: "Background color of the 'Copy' button next to the referral link input", type: "color", maps: ["--nbl-referral-copy-btn-bg"], default: "#4ecba8" },
            { key: "referralCopyBtnColor", label: "Copy-link button text color", hint: "Color of the text on the Copy button", type: "color", maps: ["--nbl-referral-copy-btn-color"], default: "#ffffff" },
            { key: "referralCopyBtnBorder", label: "Copy-link button border", hint: "Border color of the Copy button", type: "color", maps: ["--nbl-referral-copy-btn-border"], default: "#4ecba8" },
        ],
    },
    {
        key: "launcher",
        label: "Launcher Button",
        description: "The floating pill on your storefront that opens the widget.",
        fields: [
            { key: "launcherIcon", label: "Button icon", hint: "Icon displayed on the floating button", type: "icon", options: ["gift", "star", "trophy", "gem"], maps: ["--nbl-launcher-icon"], default: "'gift'", displayValue: (v) => v.replace(/^'|'$/g, ""), parseValue: (v) => `'${v}'` },
            { key: "launcherBg", label: "Button background", hint: "Background color of the floating button on your storefront", type: "color", maps: ["--nbl-launcher-bg"], default: "var(--nbl-btn-bg)", resolvedDefault: "#4ecba8" },
            { key: "launcherColor", label: "Button text color", hint: "Color of the text and subtitle on the floating button", type: "color", maps: ["--nbl-launcher-color"], default: "var(--nbl-btn-color)", resolvedDefault: "#ffffff" },
            { key: "launcherRadius", label: "Button shape", hint: "Shape of the floating launcher button", type: "select", options: [{ value: "999px", label: "Pill (default)" }, { value: "16px", label: "Rounded" }, { value: "8px", label: "Slightly rounded" }, { value: "0px", label: "Square" }], maps: ["--nbl-launcher-border-radius"], default: "999px" },
            { key: "launcherPosition", label: "Button position", hint: "Which side of the screen the launcher appears on", type: "select", options: [{ value: "left", label: "Left" }, { value: "right", label: "Right" }], maps: ["--nbl-launcher-position"], default: "right" },
            { key: "launcherBottom", label: "Distance from bottom", hint: "How far from the bottom edge of the screen the button sits", type: "text", maps: ["--nbl-launcher-bottom"], default: "24px" },
            { key: "launcherSideOffset", label: "Side offset", hint: "How far from the left or right edge of the screen the button sits", type: "text", maps: ["--nbl-launcher-side-offset"], default: "20px" },
            { key: "launcherTitleSize", label: "Button text size", hint: "How large the text on the floating button appears", type: "range", min: 10, max: 18, unit: "px", maps: ["--nbl-launcher-title-size"], default: "13px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
        ],
    },
    {
        key: "animations",
        label: "Animations",
        description: "Speed controls for widget transitions.",
        fields: [
            { key: "durFast", label: "Quick animation speed", hint: "Speed of hover and badge transitions", type: "range", min: 50, max: 500, unit: "ms", maps: ["--nbl-dur-fast"], default: "0.18s", parseValue: (v) => `${(v / 1000).toFixed(2)}s`, displayValue: (v) => { const n = parseFloat(v); return Math.round((isNaN(n) ? 0.18 : n) * 1000); } },
            { key: "durNormal", label: "Normal animation speed", hint: "Speed of tab switching and card transitions", type: "range", min: 50, max: 600, unit: "ms", maps: ["--nbl-dur-normal"], default: "0.28s", parseValue: (v) => `${(v / 1000).toFixed(2)}s`, displayValue: (v) => { const n = parseFloat(v); return Math.round((isNaN(n) ? 0.28 : n) * 1000); } },
            { key: "durSlow", label: "Slow animation speed", hint: "Speed of the widget opening and closing", type: "range", min: 100, max: 800, unit: "ms", maps: ["--nbl-dur-slow"], default: "0.42s", parseValue: (v) => `${(v / 1000).toFixed(2)}s`, displayValue: (v) => { const n = parseFloat(v); return Math.round((isNaN(n) ? 0.42 : n) * 1000); } },
            { key: "easeSpring", label: "Open animation style", hint: "How the widget feels when it opens", type: "select", options: [{ value: "cubic-bezier(0.34, 1.56, 0.64, 1)", label: "Springy (default)" }, { value: "cubic-bezier(0.22, 1, 0.36, 1)", label: "Smooth" }, { value: "cubic-bezier(0.4, 0, 0.2, 1)", label: "Snappy" }, { value: "linear", label: "Linear" }], maps: ["--nbl-ease-spring"], default: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
            { key: "easeOut", label: "Close animation style", hint: "How the widget feels when it closes", type: "select", options: [{ value: "cubic-bezier(0.22, 1, 0.36, 1)", label: "Smooth (default)" }, { value: "cubic-bezier(0.4, 0, 0.2, 1)", label: "Snappy" }, { value: "cubic-bezier(0.34, 1.56, 0.64, 1)", label: "Springy" }, { value: "linear", label: "Linear" }], maps: ["--nbl-ease-out"], default: "cubic-bezier(0.22, 1, 0.36, 1)" },
        ],
    },
    {
        key: "glow",
        label: "Widget Glow Effect",
        description: "Ambient glow ring around the open widget container.",
        fields: [
            { key: "glowPrimary", label: "Primary glow strength", hint: "How strong the inner glow around the widget appears", type: "range", min: 0, max: 30, unit: "%", maps: ["--nbl-widget-glow-primary"], default: "color-mix(in srgb, var(--nbl-primary) 12%, transparent)", parseValue: (v) => `color-mix(in srgb, var(--nbl-primary) ${v}%, transparent)`, displayValue: (v) => { const m = String(v).match(/(\d+)%/); return m ? parseInt(m[1]) : 12; } },
            { key: "glowHalo", label: "Halo glow strength", hint: "How strong the outer soft halo glow appears", type: "range", min: 0, max: 20, unit: "%", maps: ["--nbl-widget-glow-halo"], default: "color-mix(in srgb, var(--nbl-primary) 5%, transparent)", parseValue: (v) => `color-mix(in srgb, var(--nbl-primary) ${v}%, transparent)`, displayValue: (v) => { const m = String(v).match(/(\d+)%/); return m ? parseInt(m[1]) : 5; } },
        ],
    },
    {
        key: "borders",
        label: "Borders",
        description: "Color and thickness of dividers and outlines throughout the widget.",
        fields: [
            { key: "borderColor2", label: "Border color", hint: "Color used for all dividers and outline borders", type: "color", maps: ["--nbl-border"], default: "#e9e7f0" },
            { key: "borderWidth", label: "Border thickness", hint: "Thickness of thin dividers and outlines", type: "range", min: 0, max: 4, unit: "px", maps: ["--nbl-border-width"], default: "1px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
            { key: "borderWidthMd", label: "Medium border thickness", hint: "Thickness of slightly heavier outlines", type: "range", min: 0, max: 4, unit: "px", maps: ["--nbl-border-width-md"], default: "1.5px", parseValue: (v) => `${v}px`, displayValue: (v) => parseFloat(v) },
        ],
    },
    {
        key: "borderRadius",
        label: "Border Radius",
        description: "Corner rounding scale used across the whole widget.",
        fields: [
            { key: "radiusBase", label: "Base corner radius", hint: "Default rounding for most elements", type: "range", min: 0, max: 20, unit: "px", maps: ["--nbl-radius"], default: "16px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
            { key: "radiusSm", label: "Small corner radius", hint: "Rounding for small elements like tags and badges", type: "range", min: 0, max: 12, unit: "px", maps: ["--nbl-radius-sm"], default: "6px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
            { key: "radiusMd", label: "Medium corner radius", hint: "Rounding for medium UI elements like inputs", type: "range", min: 0, max: 16, unit: "px", maps: ["--nbl-radius-md"], default: "8px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
            { key: "radiusLg", label: "Large corner radius", hint: "Rounding for cards and panels", type: "range", min: 0, max: 24, unit: "px", maps: ["--nbl-radius-lg"], default: "12px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
            { key: "radiusXl", label: "Extra-large corner radius", hint: "Rounding for the main widget container", type: "range", min: 0, max: 32, unit: "px", maps: ["--nbl-radius-xl"], default: "16px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
        ],
    },
    {
        key: "shadows",
        label: "Shadows",
        description: "Drop shadows for the widget container, cards and navigation chevrons.",
        fields: [
            { key: "shadowWidget", label: "Widget shadow", hint: "How strong the shadow under the widget appears", type: "select", options: [{ value: "none", label: "None" }, { value: "0 4px 16px rgba(0,0,0,0.08)", label: "Subtle" }, { value: "0 8px 40px rgba(0,0,0,0.13)", label: "Medium (default)" }, { value: "0 20px 60px rgba(0,0,0,0.22)", label: "Strong" }], maps: ["--nbl-shadow"], default: "0 8px 40px rgba(0,0,0,0.13)" },
            { key: "shadowSm", label: "Small element shadow", hint: "Shadow on small elevated elements like badges", type: "select", options: [{ value: "none", label: "None" }, { value: "0 1px 4px rgba(0,0,0,0.08)", label: "Subtle (default)" }, { value: "0 2px 8px rgba(0,0,0,0.12)", label: "Medium" }], maps: ["--nbl-shadow-sm"], default: "0 1px 4px rgba(0,0,0,0.08)" },
            { key: "shadowMd", label: "Card shadow", hint: "Shadow on cards and panel menus", type: "select", options: [{ value: "none", label: "None" }, { value: "0 2px 8px rgba(0,0,0,0.06)", label: "Subtle" }, { value: "0 4px 16px rgba(0,0,0,0.10)", label: "Medium (default)" }, { value: "0 8px 24px rgba(0,0,0,0.16)", label: "Strong" }], maps: ["--nbl-shadow-md"], default: "0 4px 16px rgba(0,0,0,0.10)" },
            { key: "shadowChevron", label: "Scroll arrow shadow", hint: "Shadow on the navigation scroll arrows", type: "select", options: [{ value: "none", label: "None" }, { value: "0 2px 8px rgba(0,0,0,0.12)", label: "Subtle (default)" }, { value: "0 4px 12px rgba(0,0,0,0.18)", label: "Medium" }], maps: ["--nbl-shadow-nav-chevron"], default: "0 2px 8px rgba(0,0,0,0.12)" },
        ],
    },
    {
        key: "cards",
        label: "Cards & Sections",
        description: "Shared styling for every card-style container in the widget.",
        fields: [
            { key: "cardBg", label: "Card background", hint: "Background color of cards and content sections", type: "color", maps: ["--nbl-card-bg"], default: "#ffffff" },
            { key: "cardBorder", label: "Card border color", hint: "Color of the border around cards", type: "color", maps: ["--nbl-card-border"], default: "#e9e7f0" },
            { key: "cardRadius2", label: "Card corner radius", hint: "How rounded the corners of cards are", type: "range", min: 0, max: 24, unit: "px", maps: ["--nbl-card-radius"], default: "12px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
            { key: "cardPadding", label: "Card inner spacing", hint: "Padding inside cards (e.g. 16px)", type: "text", maps: ["--nbl-card-padding"], default: "16px" },
            { key: "cardShadow", label: "Card shadow", hint: "Drop shadow on reward and content cards", type: "select", options: [{ value: "none", label: "None (default)" }, { value: "0 2px 8px rgba(0,0,0,0.06)", label: "Subtle" }, { value: "0 4px 16px rgba(0,0,0,0.10)", label: "Medium" }], maps: ["--nbl-card-shadow"], default: "none" },
        ],
    },
    {
        key: "homeSectionCards",
        label: "Home Section Headers",
        description: "The header strip shown above Active Rewards and Activity lists on the Home tab.",
        fields: [
            { key: "hscHeaderBg", label: "Section header background", hint: "Background of the section header strip on the Home tab", type: "color", maps: ["--nbl-section-header-bg"], default: "#f8f7ff" },
            { key: "hscHeaderPadding", label: "Section header padding", hint: "Inner spacing of the section header strip", type: "text", maps: ["--nbl-section-header-padding"], default: "10px 14px" },
            { key: "hscTitleFontSize", label: "Section title size", hint: "Font size of the section heading text", type: "range", min: 10, max: 16, unit: "px", maps: ["--nbl-section-title-font-size"], default: "12px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
            { key: "hscTitleColor", label: "Section title color", hint: "Color of the section heading text", type: "color", maps: ["--nbl-section-title-color"], default: "#6b7280" },
            { key: "homeNavColor", label: "Home nav card text color", hint: "Text color on the navigation shortcut cards on the Home tab", type: "color", maps: ["--nbl-home-nav-color"], default: "#1a1a2e" },
        ],
    },
];

export const PRESETS = [
    {
        key: "northBorders",
        label: "North Borders",
        swatches: ["#FEC643", "#EF633B", "#0a0a0a"],
        tagline: "Bold & automotive",
        vars: {
            "--nbl-primary": "#FEC643",
            "--nbl-header-bg": "#ef633b",
            "--nbl-nav-active-color": "#FEC643",
            "--nbl-nav-active-border": "#FEC643",
            "--nbl-loadmore-color": "#1a0011",
            "--nbl-loadmore-bg": "#FEC643",
            "--nbl-loadmore-border": "#FEC643",
            "--nbl-accent": "#EF633B",
            "--nbl-btn-bg": "#FEC643",
            "--nbl-btn-border": "#FEC643",
            "--nbl-btn-color": "#1a1208",
            "--nbl-item-active-border": "#EF633B",
            "--nbl-item-active-bg": "#1a1208",
            "--nbl-launcher-bg": "#ef633b",
            "--nbl-launcher-color": "#ffffff",
            "--nbl-surface": "#0a0a0a",
            "--nbl-surface-2": "#171717",
            "--nbl-item-bg": "#171717",
            "--nbl-section-header-bg": "#171717",
            "--nbl-nav-bg": "#0a0a0a",
            "--nbl-nav-item-color": "#a3a3a3",
            "--nbl-text": "#fafafa",
            "--nbl-text-muted": "#a3a3a3",
            "--nbl-border": "#262626",
            "--nbl-nav-border-color": "#262626",
            "--nbl-card-bg": "#171717",
            "--nbl-card-border": "#262626",
            "--nbl-home-nav-color": "#1a1208",
            "--nbl-section-title-color": "#FEC643",
            "--nbl-notify-bg": "#1e1a1a",
            "--nbl-notify-text-color": "#ffffff",
            "--nbl-notify-border-color": "#FEC643",
            "--nbl-notify-btn-bg": "#FEC643",
            "--nbl-notify-btn-text-color": "#1a1208",
            "--nbl-notify-btn-border-color": "#FEC643",
            "--nbl-modal-bg": "#FFFFFF",
            "--nbl-modal-btn-primary-bg": "#FEC643",
            "--nbl-modal-btn-primary-color": "#000000",
            "--nbl-modal-btn-primary-hover": "#e6b93c",
            "--nbl-modal-btn-finish-bg": "#FEC643",
            "--nbl-modal-btn-finish-color": "#000000",
            "--nbl-modal-btn-finish-hover": "#e6b93c",
            "--nbl-referral-copy-btn-color": "#000000",
            "--nbl-referral-copy-btn-bg": "#FEC643",
            "--nbl-referral-copy-btn-border": "#FEC643",
            "--nbl-modal-brand-color": "#000000",
            "--nbl-modal-brand-bg": "#FEC643",
            "--nbl-modal-code-border": "#EF633B",
            "--nbl-modal-code-hover-bg": "#fff4d6",
            "--nbl-modal-code-hover-border": "#FEC643",
            "--nbl-modal-input-border": "#EF633B",
            "--nbl-modal-input-focus": "#EF633B",

            "--nbl-update-banner-bg": "#EF633B",
            "--nbl-update-banner-border-color": "#FEC643",
            "--nbl-update-banner-icon-color": "#1a1208",
            "--nbl-update-banner-title-color": "#1a1208",
            "--nbl-update-banner-desc-color": "#FFFFFF",
            "--nbl-update-banner-btn-bg": "#FEC643",
            "--nbl-update-banner-btn-color": "#1a1208",
            "--nbl-update-banner-close-color": "#FFFFFF",
        },
    },
    {
        key: "violet",
        label: "Violet Dream",
        swatches: ["#7c3aed", "#a78bfa", "#ede9fe"],
        tagline: "Rich purple tones",
        vars: {
            "--nbl-primary": "#7c3aed", "--nbl-header-bg": "#7c3aed",
            "--nbl-nav-active-color": "#7c3aed", "--nbl-nav-active-border": "#7c3aed",
            "--nbl-loadmore-color": "#ffffff",
            "--nbl-loadmore-bg": "#7c3aed",
            "--nbl-loadmore-border": "#7c3aed",
            "--nbl-accent": "#a78bfa",
            "--nbl-home-nav-color": "#ffffff",
            "--nbl-btn-bg": "#7c3aed", "--nbl-btn-border": "#7c3aed", "--nbl-btn-color": "#ffffff",
            "--nbl-item-active-border": "#a78bfa", "--nbl-item-active-bg": "#f5f3ff",
            "--nbl-launcher-bg": "#7c3aed",
            "--nbl-surface": "#ffffff", "--nbl-surface-2": "#f5f3ff",
            "--nbl-item-bg": "#f5f3ff", "--nbl-section-header-bg": "#f5f3ff",
            "--nbl-nav-bg": "#ffffff", "--nbl-nav-item-color": "#6b7280",
            // FIX (contrast audit): default muted grey (#6b7280) on this
            // theme's light lavender tint (#f5f3ff) was 4.41:1 — just under
            // WCAG AA 4.5:1. Violet-tinted, slightly darker grey (5.98:1).
            "--nbl-text": "#1a1a2e", "--nbl-text-muted": "#5b5b76",
            "--nbl-border": "#ede9fe", "--nbl-nav-border-color": "#ede9fe",
            "--nbl-card-bg": "#ffffff", "--nbl-card-border": "#ede9fe",
            "--nbl-section-title-color": "#7c3aed",
            "--nbl-notify-bg": "#6d28d9",
            "--nbl-notify-text-color": "#ffffff",
            "--nbl-notify-border-color": "#5b21b6",
            "--nbl-notify-btn-bg": "#a78bfa",
            "--nbl-notify-btn-text-color": "#3b0764",
            "--nbl-notify-btn-border-color": "#a78bfa",

            // referral modal badge + copy button + code-box hover, tied to violet brand
            "--nbl-modal-brand-bg": "#f5f3ff",
            "--nbl-modal-brand-color": "#6d28d9",
            "--nbl-referral-copy-btn-bg": "#a78bfa",
            "--nbl-referral-copy-btn-color": "#3b0764",
            "--nbl-referral-copy-btn-border": "#a78bfa",
            "--nbl-modal-code-hover-bg": "#f5f3ff",
            "--nbl-modal-code-hover-border": "#a78bfa",

            // FIX: modal primary/finish CTAs + input focus ring were unset,
            // silently falling back to generic near-black / green defaults —
            // every theme looked the same here. Now tied to violet brand.
            "--nbl-modal-btn-primary-bg": "#7c3aed",
            "--nbl-modal-btn-primary-color": "#ffffff",
            "--nbl-modal-btn-primary-hover": "#6d28d9",
            "--nbl-modal-btn-finish-bg": "#a78bfa",
            "--nbl-modal-btn-finish-color": "#3b0764",
            "--nbl-modal-btn-finish-hover": "#8b5cf6",
            "--nbl-modal-input-focus": "#7c3aed",
        },
    },
    {
        key: "midnight",
        label: "Midnight Dark",
        swatches: ["#6366f1", "#818cf8", "#1e1b4b"],
        tagline: "Sleek dark mode",
        vars: {
            "--nbl-primary": "#4338ca", "--nbl-header-bg": "#1e1b4b",
            "--nbl-nav-active-color": "#818cf8", "--nbl-nav-active-border": "#818cf8",
            "--nbl-loadmore-color": "#ffffff",
            "--nbl-loadmore-bg": "#4338ca",
            "--nbl-loadmore-border": "#4338ca",
            "--nbl-accent": "#6366f1",
            // FIX (contrast audit): accent (#6366f1, indigo-500) vs white was
            // 4.47:1 — just shy of WCAG AA 4.5:1. These three spots always
            // pair with white text, so point them at --nbl-primary (#4338ca,
            // 7.9:1) instead; accent itself is left alone for its dark-text uses.
            "--nbl-btn-bg": "#4338ca", "--nbl-btn-border": "#4338ca", "--nbl-btn-color": "#ffffff",
            "--nbl-item-active-border": "#818cf8", "--nbl-item-active-bg": "#1e1b4b",
            "--nbl-launcher-bg": "#6366f1",
            "--nbl-surface": "#0f0e1a", "--nbl-surface-2": "#1a1833",
            "--nbl-item-bg": "#1a1833", "--nbl-section-header-bg": "#1a1833",
            "--nbl-nav-bg": "#12111f", "--nbl-nav-item-color": "#a5b4fc",
            "--nbl-text": "#e0e7ff", "--nbl-text-muted": "#a5b4fc",
            "--nbl-border": "#2d2b52", "--nbl-nav-border-color": "#2d2b52",
            "--nbl-card-bg": "#1a1833", "--nbl-card-border": "#2d2b52",
            "--nbl-home-nav-color": "#e0e7ff",
            "--nbl-section-title-color": "#ffffff",
            "--nbl-notify-bg": "#4338ca",
            "--nbl-notify-text-color": "#ffffff",
            "--nbl-notify-border-color": "#3730a3",
            "--nbl-notify-btn-bg": "#818cf8",
            "--nbl-notify-btn-text-color": "#1e1b4b",
            "--nbl-notify-btn-border-color": "#818cf8",

            // modal is white (matches NB's pattern of light modal over dark widget) — badge/copy tied to indigo brand
            "--nbl-modal-brand-bg": "#eef2ff",
            "--nbl-modal-brand-color": "#4338ca",
            "--nbl-referral-copy-btn-bg": "#818cf8",
            "--nbl-referral-copy-btn-color": "#1e1b4b",
            "--nbl-referral-copy-btn-border": "#818cf8",
            "--nbl-modal-code-hover-bg": "#eef2ff",
            "--nbl-modal-code-hover-border": "#818cf8",

            // FIX: modal primary/finish CTAs + input focus ring — same
            // unbranded-default bug as every other theme, fixed to indigo.
            "--nbl-modal-btn-primary-bg": "#4338ca",
            "--nbl-modal-btn-primary-color": "#ffffff",
            "--nbl-modal-btn-primary-hover": "#3730a3",
            "--nbl-modal-btn-finish-bg": "#4338ca",
            "--nbl-modal-btn-finish-color": "#ffffff",
            "--nbl-modal-btn-finish-hover": "#4f46e5",
            "--nbl-modal-input-focus": "#4338ca",
        },
    },
    {
        key: "emerald",
        label: "Emerald Forest",
        swatches: ["#047857", "#34d399", "#ecfdf5"],
        tagline: "Fresh & natural",
        vars: {
            // FIX (contrast audit): #059669 (emerald-600) vs white text is only
            // 3.77:1 — fails WCAG AA 4.5:1 for header/buttons/notify banner.
            // Bumped the brand anchor one shade darker to emerald-700 (#047857,
            // 5.48:1) everywhere it pairs with white text. --nbl-accent (light
            // emerald-400) is untouched — it only ever pairs with dark text.
            "--nbl-primary": "#047857", "--nbl-header-bg": "#047857",
            "--nbl-nav-active-color": "#047857", "--nbl-nav-active-border": "#047857",
            "--nbl-loadmore-color": "#ffffff",
            "--nbl-loadmore-bg": "#047857",
            "--nbl-loadmore-border": "#047857",
            "--nbl-accent": "#34d399",
            "--nbl-btn-bg": "#047857", "--nbl-btn-border": "#047857", "--nbl-btn-color": "#ffffff",
            "--nbl-item-active-border": "#34d399", "--nbl-item-active-bg": "#ecfdf5",
            "--nbl-launcher-bg": "#047857",
            "--nbl-home-nav-color": "#ffffff",
            "--nbl-surface": "#ffffff", "--nbl-surface-2": "#ecfdf5",
            "--nbl-item-bg": "#ecfdf5", "--nbl-section-header-bg": "#ecfdf5",
            "--nbl-nav-bg": "#ffffff", "--nbl-nav-item-color": "#6b7280",
            "--nbl-text": "#0a1f18", "--nbl-text-muted": "#6b7280",
            "--nbl-border": "#a7f3d0", "--nbl-nav-border-color": "#a7f3d0",
            "--nbl-card-bg": "#ffffff", "--nbl-card-border": "#a7f3d0",
            "--nbl-section-title-color": "#047857",
            "--nbl-notify-bg": "#047857",
            "--nbl-notify-text-color": "#ffffff",
            "--nbl-notify-border-color": "#065f46",
            "--nbl-notify-btn-bg": "#34d399",
            "--nbl-notify-btn-text-color": "#064e3b",
            "--nbl-notify-btn-border-color": "#34d399",

            // modal badge/copy tied to emerald brand
            "--nbl-modal-brand-bg": "#ecfdf5",
            "--nbl-modal-brand-color": "#047857",
            "--nbl-referral-copy-btn-bg": "#34d399",
            "--nbl-referral-copy-btn-color": "#064e3b",
            "--nbl-referral-copy-btn-border": "#34d399",
            "--nbl-modal-code-hover-bg": "#ecfdf5",
            "--nbl-modal-code-hover-border": "#34d399",

            // FIX: modal primary/finish CTAs + input focus ring were unset
            // (previously fell back to defaults that *happened* to be green
            // by coincidence, not by design) — now explicitly tied to brand.
            "--nbl-modal-btn-primary-bg": "#047857",
            "--nbl-modal-btn-primary-color": "#ffffff",
            "--nbl-modal-btn-primary-hover": "#065f46",
            "--nbl-modal-btn-finish-bg": "#34d399",
            "--nbl-modal-btn-finish-color": "#064e3b",
            "--nbl-modal-btn-finish-hover": "#10b981",
            "--nbl-modal-input-focus": "#047857",
        },
    },
    {
        key: "ocean",
        label: "Ocean Breeze",
        swatches: ["#0369a1", "#38bdf8", "#f0f9ff"],
        tagline: "Cool & professional",
        vars: {
            // FIX (contrast audit): #0284c7 (sky-600) vs white text is 4.10:1 —
            // fails WCAG AA 4.5:1 on header/buttons/notify banner. Bumped to
            // sky-700 (#0369a1, 5.93:1). Also #38bdf8 (sky-400) badge bg vs
            // #0c4a6e (sky-900) text was 4.42:1 — darkened text to sky-950
            // (#082f49, 6.48:1) so reward/referral badges read clearly too.
            "--nbl-primary": "#0369a1", "--nbl-header-bg": "#0369a1",
            "--nbl-nav-active-color": "#0369a1", "--nbl-nav-active-border": "#0369a1",
            "--nbl-loadmore-color": "#ffffff",
            "--nbl-loadmore-bg": "#0369a1",
            "--nbl-loadmore-border": "#0369a1",
            "--nbl-accent": "#38bdf8",
            "--nbl-btn-bg": "#0369a1", "--nbl-btn-border": "#0369a1", "--nbl-btn-color": "#ffffff",
            "--nbl-item-active-border": "#38bdf8", "--nbl-item-active-bg": "#f0f9ff",
            "--nbl-launcher-bg": "#0369a1",
            "--nbl-home-nav-color": "#ffffff",
            "--nbl-surface": "#ffffff", "--nbl-surface-2": "#f0f9ff",
            "--nbl-item-bg": "#f0f9ff", "--nbl-section-header-bg": "#f0f9ff",
            "--nbl-nav-bg": "#ffffff", "--nbl-nav-item-color": "#6b7280",
            "--nbl-text": "#0c1a2e", "--nbl-text-muted": "#6b7280",
            "--nbl-border": "#bae6fd", "--nbl-nav-border-color": "#bae6fd",
            "--nbl-card-bg": "#ffffff", "--nbl-card-border": "#bae6fd",
            "--nbl-section-title-color": "#0369a1",
            "--nbl-notify-bg": "#0369a1",
            "--nbl-notify-text-color": "#ffffff",
            "--nbl-notify-border-color": "#075985",
            "--nbl-notify-btn-bg": "#38bdf8",
            "--nbl-notify-btn-text-color": "#082f49",
            "--nbl-notify-btn-border-color": "#38bdf8",

            "--nbl-modal-brand-bg": "#f0f9ff",
            "--nbl-modal-brand-color": "#0369a1",
            "--nbl-referral-copy-btn-bg": "#38bdf8",
            "--nbl-referral-copy-btn-color": "#082f49",
            "--nbl-referral-copy-btn-border": "#38bdf8",
            "--nbl-modal-code-hover-bg": "#f0f9ff",
            "--nbl-modal-code-hover-border": "#38bdf8",

            // FIX: modal primary/finish CTAs + input focus ring, tied to ocean brand
            "--nbl-modal-btn-primary-bg": "#0369a1",
            "--nbl-modal-btn-primary-color": "#ffffff",
            "--nbl-modal-btn-primary-hover": "#075985",
            "--nbl-modal-btn-finish-bg": "#38bdf8",
            "--nbl-modal-btn-finish-color": "#082f49",
            "--nbl-modal-btn-finish-hover": "#0ea5e9",
            "--nbl-modal-input-focus": "#0369a1",
        },
    },
    {
        key: "blush",
        label: "Blush Pink",
        swatches: ["#db2777", "#f472b6", "#fdf2f8"],
        tagline: "Soft & feminine",
        vars: {
            "--nbl-primary": "#db2777", "--nbl-header-bg": "#db2777",
            "--nbl-nav-active-color": "#db2777", "--nbl-nav-active-border": "#db2777",
            "--nbl-accent": "#f472b6",
            "--nbl-btn-bg": "#db2777", "--nbl-btn-border": "#db2777", "--nbl-btn-color": "#ffffff",
            "--nbl-item-active-border": "#f472b6", "--nbl-item-active-bg": "#fdf2f8",
            "--nbl-launcher-bg": "#db2777",
            "--nbl-home-nav-color": "#ffffff",

            "--nbl-loadmore-color": "#ffffff",
            "--nbl-loadmore-bg": "#db2777",
            "--nbl-loadmore-border": "#db2777",

            "--nbl-surface": "#ffffff", "--nbl-surface-2": "#fdf2f8",
            "--nbl-item-bg": "#fdf2f8", "--nbl-section-header-bg": "#fdf2f8",
            "--nbl-nav-bg": "#ffffff", "--nbl-nav-item-color": "#9d174d",
            "--nbl-text": "#1a0011", "--nbl-text-muted": "#9d174d",
            "--nbl-border": "#fce7f3", "--nbl-nav-border-color": "#fce7f3",
            "--nbl-card-bg": "#ffffff", "--nbl-card-border": "#fce7f3",
            // FIX (contrast audit): section title / modal brand text (#db2777)
            // on the light pink tint bg (#fdf2f8) was only 4.21:1 — darkened
            // to pink-700 (#be185d, 5.53:1) just for this text-on-tint pairing.
            "--nbl-section-title-color": "#be185d",
            "--nbl-notify-bg": "#db2777",
            "--nbl-notify-text-color": "#ffffff",
            "--nbl-notify-border-color": "#9d174d",
            "--nbl-notify-btn-bg": "#f472b6",
            "--nbl-notify-btn-text-color": "#500724",
            "--nbl-notify-btn-border-color": "#f472b6",
            // FIX: badge/CTA text (#831843) on the light pink pill (#f472b6)
            // was only 3.64:1 — darkened to pink-950 (#500724, 5.68:1).

            "--nbl-modal-brand-bg": "#fdf2f8",
            "--nbl-modal-brand-color": "#be185d",
            "--nbl-referral-copy-btn-bg": "#f472b6",
            "--nbl-referral-copy-btn-color": "#500724",
            "--nbl-referral-copy-btn-border": "#f472b6",
            "--nbl-modal-code-hover-bg": "#fdf2f8",
            "--nbl-modal-code-hover-border": "#f472b6",

            // FIX: modal primary/finish CTAs + input focus ring, tied to blush brand
            "--nbl-modal-btn-primary-bg": "#db2777",
            "--nbl-modal-btn-primary-color": "#ffffff",
            "--nbl-modal-btn-primary-hover": "#9d174d",
            "--nbl-modal-btn-finish-bg": "#f472b6",
            "--nbl-modal-btn-finish-color": "#500724",
            "--nbl-modal-btn-finish-hover": "#ec4899",
            "--nbl-modal-input-focus": "#db2777",
        },
    }
];


export const CSS_DEFAULTS = {
    // ── Added to match public/widget/module-preact/styles/ui.css (2026-07-03 audit) ──
    "--nbl-button-accent-bg": "var(--nbl-accent)",
    "--nbl-button-accent-color": "#ffffff",
    "--nbl-button-accent-hover": "var(--nbl-accent-hover)",
    "--nbl-button-font-size-lg": "var(--nbl-text-lg)",
    "--nbl-button-font-size-md": "var(--nbl-text-base)",
    "--nbl-button-font-size-sm": "var(--nbl-text-sm)",
    "--nbl-button-font-weight": "600",
    "--nbl-button-ghost-color": "var(--nbl-text-muted)",
    "--nbl-button-ghost-hover-bg": "var(--nbl-surface-2)",
    "--nbl-button-outline-border": "var(--nbl-border)",
    "--nbl-button-outline-color": "var(--nbl-text)",
    "--nbl-button-outline-hover-bg": "var(--nbl-surface-2)",
    "--nbl-button-padding-lg": "12px 24px",
    "--nbl-button-padding-md": "10px 18px",
    "--nbl-button-padding-sm": "7px 14px",
    "--nbl-button-primary-bg": "var(--nbl-primary)",
    "--nbl-button-primary-color": "#ffffff",
    "--nbl-button-primary-hover": "var(--nbl-primary-hover)",
    "--nbl-button-radius": "var(--nbl-radius-md)",
    "--nbl-divider-color": "var(--nbl-border)",
    "--nbl-divider-spacing": "12px",
    "--nbl-divider-width": "var(--nbl-border-width)",
    "--nbl-heading-color": "var(--nbl-text)",
    "--nbl-heading-font-weight": "700",
    "--nbl-heading-size-lg": "22px",
    "--nbl-heading-size-md": "18px",
    "--nbl-heading-size-sm": "var(--nbl-text-lg)",
    "--nbl-icon-color": "var(--nbl-accent)",
    "--nbl-icon-size-lg": "28px",
    "--nbl-icon-size-md": "20px",
    "--nbl-icon-size-sm": "14px",
    "--nbl-image-placeholder-bg": "var(--nbl-surface-2)",
    "--nbl-image-placeholder-color": "var(--nbl-accent)",
    "--nbl-image-radius": "var(--nbl-radius-sm)",
    "--nbl-image-size-md": "52px",
    "--nbl-image-size-sm": "36px",
    "--nbl-item-gap": "12px",
    "--nbl-item-row-border-color": "rgba(0, 0, 0, 0.04)",
    "--nbl-modal-btn-finish-bg": "#FEC643",
    "--nbl-modal-btn-finish-color": "#000000",
    "--nbl-modal-btn-finish-hover": "#e6b93c",
    "--nbl-modal-btn-primary-color": "#000000",
    "--nbl-prize-status-cancelled": "var(--nbl-text-muted)",
    "--nbl-prize-status-fulfilled": "var(--nbl-text)",
    "--nbl-prize-status-pending": "var(--nbl-text-muted)",
    // FIX (2026-07-05): these badges (Pending/Fulfilled/Cancelled inside the
    // notify-info popup) sit on top of each theme's own notify-bg-from/to
    // gradient, which is a different hue per preset. A *colored* translucent
    // fill (old: rgba(250,199,117,.22) amber etc.) only reads well when the
    // panel hue happens to be analogous (e.g. North Borders' orange) — on a
    // complementary hue (violet, blue, indigo) it visually clashes and reads
    // as a washed-out, disconnected chip. Switching the fill to a neutral
    // white wash and keeping the semantic color in the (opaque) text/border
    // is the standard "frosted chip" pattern — it looks intentional over ANY
    // brand hue, warm or cool, without needing a per-theme override.
    "--nbl-text-font-weight": "400",
    "--nbl-widget-origin": "bottom left",
    "--nbl-primary": "#FEC643",
    "--nbl-primary-hover": "color-mix(in srgb, var(--nbl-primary) 85%, #000)",
    "--nbl-primary-light": "color-mix(in srgb, var(--nbl-primary) 12%, #fff)",
    "--nbl-accent": "#EF633B",
    "--nbl-accent-hover": "color-mix(in srgb, var(--nbl-accent) 85%, #000)",
    "--nbl-accent-light": "color-mix(in srgb, var(--nbl-accent) 12%, #fff)",
    "--nbl-header-bg": "#ef633b",
    "--nbl-header-color": "#ffffff",
    "--nbl-header-padding": "22px 20px 18px",
    "--nbl-header-compact-padding": "10px 20px",
    "--nbl-header-title-font-size": "16px",
    "--nbl-header-title-font-weight": "700",
    "--nbl-points-bg": "rgba(255, 255, 255, 0.2)",
    "--nbl-points-color": "#ffffff",
    "--nbl-points-font-size": "12px",
    "--nbl-points-padding": "5px 12px",
    "--nbl-points-border-radius": "99px",
    "--nbl-points-border-color": "rgba(255, 255, 255, 0.22)",
    "--nbl-nav-bg": "#0a0a0a",
    "--nbl-nav-border-color": "#262626",
    "--nbl-nav-active-color": "#8b5cf6",
    "--nbl-nav-active-border": "#8b5cf6",
    "--nbl-nav-item-color": "#a3a3a3",
    "--nbl-nav-item-font-size": "12px",
    "--nbl-nav-item-font-weight": "500",
    "--nbl-nav-item-padding": "14px 4px 12px",
    "--nbl-nav-chevron-color": "#6b7280",
    "--nbl-nav-chevron-hover-color": "#8b5cf6",
    "--nbl-nav-chevron-bg": "#ffffff",
    "--nbl-nav-chevron-border": "#e9e7f0",
    "--nbl-nav-chevron-size": "28px",
    "--nbl-nav-chevron-icon-size": "14px",
    "--nbl-nav-chevron-radius": "8px",
    "--nbl-btn-bg": "#FEC643",
    "--nbl-btn-color": "#1a1208",
    "--nbl-btn-border": "#FEC643",
    "--nbl-btn-radius": "10px",
    "--nbl-btn-font-size": "14px",
    "--nbl-btn-font-weight": "600",
    "--nbl-btn-padding": "10px 20px",
    "--nbl-surface": "#0a0a0a",
    "--nbl-surface-2": "#171717",
    "--nbl-surface-hover": "#f3f1fc",
    "--nbl-text": "#fafafa",
    "--nbl-text-muted": "#a3a3a3",
    "--nbl-text-xs": "11px",
    "--nbl-text-sm": "12px",
    "--nbl-text-base": "13px",
    "--nbl-text-md": "13.5px",
    "--nbl-text-lg": "16px",
    "--nbl-border": "#262626",
    "--nbl-border-width": "1px",
    "--nbl-border-width-md": "1.5px",
    "--nbl-radius": "16px",
    "--nbl-radius-sm": "8px",
    "--nbl-radius-md": "10px",
    "--nbl-radius-lg": "12px",
    "--nbl-radius-xl": "16px",
    "--nbl-radius-full": "999px",
    "--nbl-shadow": "0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)",
    "--nbl-shadow-sm": "0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)",
    "--nbl-shadow-md": "0 6px 20px rgba(0,0,0,0.12)",
    "--nbl-shadow-nav-chevron": "0 2px 8px rgba(0,0,0,0.1)",
    "--nbl-card-bg": "#171717",
    "--nbl-card-border": "#e9e7f0",
    "--nbl-card-radius": "12px",
    "--nbl-card-padding": "14px 13px",
    "--nbl-card-shadow": "0 2px 12px rgba(0,0,0,0.06)",
    "--nbl-section-header-bg": "#f8f7ff",
    "--nbl-section-header-padding": "10px 14px",
    "--nbl-section-title-font-size": "13px",
    "--nbl-section-title-font-weight": "600",
    "--nbl-section-title-color": "#FEC643",
    "--nbl-notify-bg": "#1e1a1a",
    "--nbl-notify-text-color": "#ffffff",
    "--nbl-notify-border-color": "#FEC643",
    "--nbl-notify-btn-bg": "#FEC643",
    "--nbl-notify-btn-text-color": "#1a1208",
    "--nbl-notify-btn-border-color": "#FEC643",
    "--nbl-notify-max-height": "78%",
    "--nbl-notify-heading-size": "16px",
    "--nbl-notify-heading-weight": "600",
    "--nbl-update-banner-bg": "var(--nbl-primary-light)",
    "--nbl-update-banner-border-color": "var(--nbl-primary)",
    "--nbl-update-banner-icon-color": "#1a1208",
    "--nbl-update-banner-title-color": "#1a1208",
    "--nbl-update-banner-desc-color": "#FFFFFF",
    "--nbl-update-banner-btn-bg": "var(--nbl-primary)",
    "--nbl-update-banner-btn-color": "var(--nbl-btn-color)",
    "--nbl-update-banner-close-color": "#FFFFFF",
    "--nbl-home-nav-color": "#1a1208",
    "--nbl-item-bg": "#f8f7ff",
    "--nbl-item-border": "#e9e7f0",
    "--nbl-item-active-bg": "#1a1208",
    "--nbl-item-active-border": "#4ecba8",
    "--nbl-item-radius": "12px",
    "--nbl-item-padding": "14px 13px",
    "--nbl-item-title-font-size": "13.5px",
    "--nbl-item-title-font-weight": "600",
    "--nbl-item-meta-font-size": "12px",
    "--nbl-item-hover-shadow": "0 6px 18px rgba(78,203,168,0.25)",
    "--nbl-activity-header-font-size": "10px",
    "--nbl-activity-header-font-weight": "700",
    "--nbl-activity-row-font-size": "12px",
    "--nbl-activity-row-padding": "7px 4px",
    "--nbl-activity-border-color": "rgba(0,0,0,0.04)",
    "--nbl-activity-positive-color": "#16a34a",
    "--nbl-activity-negative-color": "#dc2626",
    "--nbl-pagination-btn-size": "32px",
    "--nbl-pagination-btn-radius": "10px",
    "--nbl-pagination-btn-border": "#e9e7f0",
    "--nbl-pagination-btn-bg": "#ffffff",
    "--nbl-pagination-btn-color": "#6b7280",
    "--nbl-pagination-dot-size": "7px",
    "--nbl-pagination-dot-active-width": "18px",
    "--nbl-pagination-dot-radius": "4px",
    "--nbl-loadmore-radius": "12px",
    "--nbl-loadmore-border": "#FEC643",
    "--nbl-loadmore-bg": "#FEC643",
    "--nbl-loadmore-color": "#1a0011",
    "--nbl-loadmore-font-size": "13px",
    "--nbl-loadmore-font-weight": "600",
    "--nbl-loadmore-padding": "11px 20px",
    "--nbl-status-success-bg": "#f0fdf4",
    "--nbl-status-success-border": "#86efac",
    "--nbl-status-success-color": "#166534",
    "--nbl-status-success-text": "#15803d",
    "--nbl-status-error-bg": "#fef2f2",
    "--nbl-status-error-border": "#fecaca",
    "--nbl-status-error-color": "#b91c1c",
    "--nbl-status-warning-bg": "#fffbeb",
    "--nbl-status-warning-border": "#FEC643",
    "--nbl-status-warning-color": "#854d0e",
    "--nbl-status-warning-strong": "#b45309",
    "--nbl-status-info-bg": "#eff6ff",
    "--nbl-status-info-border": "#bfdbfe",
    "--nbl-status-info-color": "#1e40af",
    "--nbl-modal-bg": "#ffffff",
    "--nbl-modal-title-color": "#111827",
    "--nbl-modal-subtitle-color": "#4b5563",
    "--nbl-modal-text-color": "#374151",
    "--nbl-modal-muted-color": "#9ca3af",
    "--nbl-modal-brand-bg": "#FEC643",
    "--nbl-modal-brand-color": "#000000",
    "--nbl-modal-input-bg": "#f9fafb",
    "--nbl-modal-input-border": "#EF633B",
    "--nbl-modal-input-focus": "#EF633B",
    "--nbl-modal-input-readonly": "#f3f4f6",
    "--nbl-modal-btn-primary-bg": "#FEC643",
    "--nbl-modal-btn-primary-hover": "#e6b93c",
    "--nbl-modal-code-bg": "#f8fafc",
    "--nbl-modal-code-border": "#EF633B",
    "--nbl-modal-code-hover-bg": "#fff4d6",
    "--nbl-modal-code-hover-border": "#FEC643",
    "--nbl-modal-scrollbar-color": "#d1d5db",
    "--nbl-ease-spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",
    "--nbl-ease-out": "cubic-bezier(0.22, 1, 0.36, 1)",
    "--nbl-launcher-bg": "var(--nbl-btn-bg)",
    "--nbl-launcher-color": "var(--nbl-btn-color)",
    "--nbl-launcher-border-radius": "999px",
    "--nbl-launcher-shadow": "0 6px 24px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.14), 0 0 0 3px rgba(255,255,255,0.15) inset",
    "--nbl-launcher-shadow-hover": "0 14px 36px rgba(0,0,0,0.28), 0 4px 12px rgba(0,0,0,0.18), 0 0 0 3px rgba(255,255,255,0.15) inset",
    "--nbl-launcher-shadow-float": "0 14px 32px rgba(0,0,0,0.28), 0 4px 10px rgba(0,0,0,0.16), 0 0 0 3px rgba(255,255,255,0.15) inset",
    "--nbl-launcher-icon": "'gift'",
    "--nbl-launcher-icon-size": "20px",
    "--nbl-launcher-icon-bg": "rgba(0,0,0,0.18)",
    "--nbl-launcher-icon-circle": "44px",
    "--nbl-launcher-title-size": "13px",
    "--nbl-launcher-title-weight": "700",
    "--nbl-launcher-sub-size": "11px",
    "--nbl-launcher-sub-weight": "500",
    "--nbl-launcher-sub-opacity": "0.82",
    "--nbl-launcher-bottom": "24px",
    "--nbl-launcher-position": "right",
    "--nbl-launcher-side-offset": "20px",
    "--nbl-widget-body-padding": "14px 14px 24px",
    "--nbl-modal-radius": "20px",
    "--nbl-modal-padding": "24px 22px 22px",
    "--nbl-dur-fast": "0.18s",
    "--nbl-dur-normal": "0.28s",
    "--nbl-dur-slow": "0.42s",
    "--nbl-widget-glow-primary": "color-mix(in srgb, var(--nbl-primary) 12%, transparent)",
    "--nbl-widget-glow-halo": "color-mix(in srgb, var(--nbl-primary) 5%, transparent)",
    "--nbl-referral-copy-btn-bg": "#FEC643",
    "--nbl-referral-copy-btn-color": "#000000",
    "--nbl-referral-copy-btn-border": "#FEC643",

    // Toast (the "you earned points while away" stack) previously had no
    // vars of its own — it silently reused --nbl-surface/--nbl-radius/
    // --nbl-primary plus several hardcoded pixel values, so a merchant could
    // never restyle it independently of cards. Defaults below intentionally
    // mirror the old visual look (via var() reuse) so nothing changes
    // out of the box — but every value is now its own override point.
    "--nbl-toast-bg": "var(--nbl-surface)",
    "--nbl-toast-border-color": "transparent",
    "--nbl-toast-radius": "var(--nbl-radius)",
    "--nbl-toast-shadow": "0 4px 20px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.06)",
    "--nbl-toast-padding": "14px 12px 14px 14px",
    "--nbl-toast-gap": "10px",
    "--nbl-toast-icon-color": "var(--nbl-primary)",
    "--nbl-toast-icon-size": "20px",
    "--nbl-toast-text-color": "var(--nbl-text)",
    "--nbl-toast-text-size": "var(--nbl-text-base)",
    "--nbl-toast-chevron-color": "var(--nbl-text-muted)",
    "--nbl-toast-close-size": "22px",
    "--nbl-toast-close-icon-size": "13px",
    "--nbl-toast-close-color": "var(--nbl-text-muted)",
    "--nbl-toast-close-hover-bg": "var(--nbl-border)",
    "--nbl-toast-close-hover-color": "var(--nbl-text)",
};

export function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
export function isEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

/**
 * Feature flag for the "Advanced" tab (raw CSS var editor). Flip to false
 * to hide it app-wide without touching route.jsx / PageHeader.jsx — both
 * already read this constant instead of hardcoding true. Swap this for a
 * per-shop DB flag later without changing anything else.
 */
export const ADVANCED_MODE_ENABLED = true;

/**
 * True if every var the preset sets currently has that exact value in
 * cssVars. Used to derive which "Quick Theme" (if any) is highlighted as
 * active — value-based rather than a separately-tracked "which button was
 * last clicked" state, so it can never drift out of sync with what's
 * actually on screen (e.g. hand-tuning one field back to a preset's exact
 * value re-highlights it; changing anything away from it un-highlights it —
 * both automatically, with no explicit bookkeeping).
 */
export function matchesPreset(preset, cssVars) {
    return Object.keys(preset.vars).every((k) => cssVars[k] === preset.vars[k]);
}
export function buildInitialVars(savedCssVars) {
    const base = deepClone(CSS_DEFAULTS);
    if (!savedCssVars || typeof savedCssVars !== "object") return base;
    return { ...base, ...savedCssVars };
}

export function buildInitialWidgetConfig(saved) {
    const base = { ...WIDGET_CONFIG_DEFAULTS, labels: { ...LABEL_DEFAULTS }, prize: { ...WIDGET_CONFIG_DEFAULTS.prize }, referral: { ...WIDGET_CONFIG_DEFAULTS.referral }, resync: { ...WIDGET_CONFIG_DEFAULTS.resync } };
    if (!saved || typeof saved !== "object") return base;
    const merged = { ...base, ...saved };
    merged.labels = { ...LABEL_DEFAULTS, ...(saved.labels || {}) };
    merged.prize = { ...WIDGET_CONFIG_DEFAULTS.prize, ...(saved.prize || {}) };
    merged.referral = { ...WIDGET_CONFIG_DEFAULTS.referral, ...(saved.referral || {}) };
    merged.resync = { ...WIDGET_CONFIG_DEFAULTS.resync, ...(saved.resync || {}) };
    return merged;
}
export const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
export function isHex(v) { return HEX_RE.test((v ?? "").trim()); }

export const DS = {
    sp2: "2px", sp4: "4px", sp6: "6px", sp8: "8px", sp10: "10px", sp12: "12px",
    sp14: "14px", sp16: "16px", sp20: "20px", sp24: "24px",
    r6: "6px", r8: "8px", r10: "10px", r12: "12px", r14: "14px", r16: "16px", r99: "99px",
    white: "#ffffff",
    bg: "#f9fafb",
    bgCard: "#ffffff",
    borderLight: "#e5e7eb",
    borderMid: "#d1d5db",
    text: "#111827",
    textSub: "#374151",
    textMuted: "#6b7280",
    textHint: "#9ca3af",
    accentBg: "#f5f3ff",
    accentText: "#6d28d9",
    accentBorder: "#ede9fe",
    warnBg: "#fffbeb",
    warnBorder: "#FEC643",
    warnText: "#92400e",
    dangerText: "#dc2626",
    dangerBg: "#fef2f2",
};

export const SECTION_TO_SCENE = {
    header: "home",
    navigation: "home",
    brand: "home",
    buttons: "earn",
    text: "home",
    surfaces: "home",
    rewards: "rewards",
    activity: "home",
    pagination: "rewards",
    notifications: "notification-reward",
    toast: "notification-toast",
    updateBanner: "notification-update-banner",
    status: "home",
    modal: "modal",
    animations: "home",
    glow: "home",
};

// Same idea as SECTION_TO_SCENE above, but for the Widget Config tab's own
// sections (WIDGET_CONFIG_SECTIONS keys — behaviour/prizeNotifications/
// referral/resync/onboarding), not the Customize (styling) tab's. Sections
// with no bespoke scene to demo fall back to "home" — same convention
// SECTION_TO_SCENE already uses for its own style-only sections above.
export const CONFIG_SECTION_TO_SCENE = {
    behaviour: "home",
    prizeNotifications: "home",
    referral: "referral",
    resync: "notification-update-banner",
    onboarding: "join-program",
};

// Same idea again, for the Labels & Text tab's own groups (LABEL_GROUPS
// keys above) — lets selecting a label group show the part of the widget
// those labels actually appear in, same convention as the other two maps.
export const LABEL_GROUP_TO_SCENE = {
    header: "home",
    navigation: "home",
    home: "home",
    lists: "rewards",
    rewards: "notification-reward",
    prizes: "prizes",
    launcher: "launcher",
    updateBanner: "notification-update-banner",
    guestJoin: "join-program",
    // "modal" (not "referral") — this is the pre-existing scene the
    // Customize tab's own Modal section already uses, which calls
    // refModal.openModal() and actually opens the ReferralModal (on its
    // default 'form' step). Mapping to "referral" instead would only
    // switch the nav tab, never open the modal these labels are actually
    // for — the person editing referral copy would never see it applied.
    referralModal: "modal",
};
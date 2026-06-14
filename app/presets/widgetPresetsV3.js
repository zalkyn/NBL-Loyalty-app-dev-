// =============================================================================
// widgetPresetsV3.jsx  — Component-system edition
//
// WHAT CHANGED FROM V2
// ────────────────────
// Presets now store ONLY 2 CSS vars:  --nbl-primary  +  --nbl-accept
// Every other visual token derives automatically in nbl-components.css.
// No more 20+ variables per preset.
//
// CSS_DEFAULTS also has only 2 color keys + layout vars.
// applyTheme() in ui.js reads only these.
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// LABEL DEFAULTS  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
export const LABEL_DEFAULTS = {
    headerLabel: "Welcome, [name]",
    pointsLabel: "[points] pts",
    navHome: "Home",
    navEarn: "Earn",
    navRewards: "Rewards",
    navMyRewards: "My Rewards",
    navActivity: "Activity",
    homeCardBrowse: "Browse Rewards",
    homeCardEarn: "Earn Points",
    homeCardRefer: "Refer Friends",
    sectionActiveRewards: "Active Rewards",
    sectionRecentActivity: "Recent Activity",
    activityColDate: "Date",
    activityColActivity: "Activity",
    activityColPoints: "Points",
    emptyRewards: "No active rewards available",
    emptyActivity: "No account activities yet",
    loadMoreBtn: "Load More",
    loadMoreDone: "All loaded",
    notifyRewardHeading: "Success! Use this code at checkout",
    notifyRewardCopyBtn: "Copy",
    notifyInfoClaimBtn: "Claim",
    launcherTitle: "Loyalty Rewards",
    launcherSubtitle: "[points] pts",
    navPrizes: "Prizes",
    navMyPrizes: "My Prizes",
    sectionPrizeRequests: "My Prize Requests",
    emptyPrizes: "No prizes available",
    emptyMyPrizes: "You have no prize requests yet",
    prizeStatusPending: "🕐 Pending",
    prizeStatusFulfilled: "📦 Fulfilled",
    prizeStatusCompleted: "✅ Completed",
    prizeStatusCancelled: "❌ Cancelled",
    prizeContactUsText: "Contact us",
    prizeClaimSuccessMsg: "✅ Your request has been submitted! We'll contact you soon.",
    claimingLabel: "Processing...",
    claimRetryLabel: "Try again",
};

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET CONFIG DEFAULTS  (behaviour only — no visual tokens here)
// ─────────────────────────────────────────────────────────────────────────────
export const WIDGET_CONFIG_DEFAULTS = {
    showHomeRewardsSection: true,
    showHomeActivitiesSection: true,
    showHomePrizeRequestsSection: true,
    homeRewardsPerPage: 5,
    homeActivitiesPerPage: 5,
    homePrizeRequestsPerPage: 5,
    myPrizesPerPage: 5,
    paginationMode: "pagination",   // "pagination" | "loadmore"
    headerEffectEnabled: true,
    headerEffectOpacity: 0.55,
    labels: { ...LABEL_DEFAULTS },
    prize: {
        showImage: true,
        imageFit: "cover",
        imageHeight: 150,
        imagePosition: "center",
        contactUrl: "",
        showAdminNote: true,
        showTrackingInfo: true,
        showRequestDate: true,
        showFulfilledDate: true,
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET CONFIG SECTIONS  (for the Config tab — behaviour settings only)
// ─────────────────────────────────────────────────────────────────────────────
export const WIDGET_CONFIG_SECTIONS = [
    {
        key: "behaviour",
        label: "Behaviour",
        icon: "⚙️",
        description: "Control what sections appear and how content is paged.",
        fields: [
            { key: "showHomeRewardsSection", label: "Active rewards on Home", hint: "Show the Active Rewards section on the Home tab", type: "toggle", configKey: "showHomeRewardsSection", default: true },
            { key: "showHomeActivitiesSection", label: "Recent activity on Home", hint: "Show the Recent Activity section on the Home tab", type: "toggle", configKey: "showHomeActivitiesSection", default: true },
            { key: "showHomePrizeRequestsSection", label: "Prize requests on Home", hint: "Show the My Prize Requests section on the Home tab", type: "toggle", configKey: "showHomePrizeRequestsSection", default: true },
            { key: "homeRewardsPerPage", label: "Active rewards per page", hint: "How many active reward items to show at once on Home", type: "range", configKey: "homeRewardsPerPage", default: 5, min: 1, max: 10, parseValue: Number, displayValue: Number },
            { key: "homeActivitiesPerPage", label: "Activity rows per page", hint: "How many activity rows to show at once on Home", type: "range", configKey: "homeActivitiesPerPage", default: 5, min: 1, max: 15, parseValue: Number, displayValue: Number },
            { key: "homePrizeRequestsPerPage", label: "Prize requests per page (Home)", hint: "How many prize requests to show at once on Home", type: "range", configKey: "homePrizeRequestsPerPage", default: 5, min: 1, max: 10, parseValue: Number, displayValue: Number },
            { key: "myPrizesPerPage", label: "Prize requests per page (My Prizes)", hint: "How many prize requests to show on the My Prizes tab", type: "range", configKey: "myPrizesPerPage", default: 5, min: 1, max: 20, parseValue: Number, displayValue: Number },
            {
                key: "paginationMode", label: "Pagination style",
                hint: "Arrow buttons or a Load More button",
                type: "select",
                options: [{ value: "pagination", label: "Arrows" }, { value: "loadmore", label: "Load More" }],
                configKey: "paginationMode", default: "pagination",
            },
        ],
    },
    {
        key: "prizeNotifications",
        label: "Prize Notifications",
        icon: "🏆",
        description: "Control what appears in the prize notification panel.",
        fields: [
            { key: "prize_contactUrl", label: "Contact page URL", hint: "URL for a 'Contact us' button on prize notifications. Leave empty to hide.", type: "text", configKey: "prize.contactUrl", default: "" },
            { key: "prize_showImage", label: "Show prize image", hint: "Show the prize image at the top of the notification", type: "toggle", configKey: "prize.showImage", default: true },
            { key: "prize_showRequestDate", label: "Show request date", hint: "Display when the prize was requested", type: "toggle", configKey: "prize.showRequestDate", default: true },
            { key: "prize_showFulfilledDate", label: "Show dispatch / completion date", hint: "Display when the prize was dispatched or completed", type: "toggle", configKey: "prize.showFulfilledDate", default: true },
            { key: "prize_showAdminNote", label: "Show admin note", hint: "Display the admin note (e.g. cancellation reason or delivery info)", type: "toggle", configKey: "prize.showAdminNote", default: true },
            { key: "prize_showTrackingInfo", label: "Show tracking info", hint: "Display tracking link or license key (Fulfilled / Completed prizes)", type: "toggle", configKey: "prize.showTrackingInfo", default: true },
            {
                key: "prize_imageFit", label: "Image fit",
                hint: "How the image fills the banner",
                type: "select",
                options: [{ value: "cover", label: "Cover" }, { value: "contain", label: "Contain" }, { value: "auto", label: "Auto" }],
                configKey: "prize.imageFit", default: "cover",
            },
            { key: "prize_imageHeight", label: "Image height", hint: "Banner height in pixels (ignored when fit is Auto)", type: "range", configKey: "prize.imageHeight", default: 150, min: 80, max: 300, parseValue: Number, displayValue: Number },
            {
                key: "prize_imagePosition", label: "Image focal point",
                type: "select",
                options: [{ value: "center", label: "Center" }, { value: "top", label: "Top" }, { value: "bottom", label: "Bottom" }],
                configKey: "prize.imagePosition", default: "center",
            },
        ],
    },
    {
        key: "headerAnimation",
        label: "Header Effect",
        icon: "✨",
        description: "Decorative wave animation in the widget header.",
        fields: [
            { key: "headerEffectEnabled", label: "Wave effect", hint: "Show the animated wave in the widget header", type: "toggle", configKey: "headerEffectEnabled", default: true },
            { key: "headerEffectOpacity", label: "Effect intensity", hint: "Strength of the wave (0 = off, 100 = full)", type: "range", configKey: "headerEffectOpacity", default: 55, min: 0, max: 100, unit: "%", parseValue: (v) => Number(v) / 100, displayValue: (v) => Math.round(Number(v) * 100) },
        ],
    },
    {
        key: "labels",
        label: "Labels & Text",
        icon: "✏️",
        description: "Customise all text labels shown inside the widget.",
        fields: Object.entries(LABEL_DEFAULTS).map(([key, def]) => ({
            key: "lbl_" + key, label: key, hint: "", type: "label", configKey: "labels." + key, default: def,
        })),
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// PRESETS  — only 2 vars each now
// ─────────────────────────────────────────────────────────────────────────────
export const PRESETS = [
    { key: "default", label: "Default", emoji: "🎨", swatches: ["#8b5cf6", "#4ecba8"], tagline: "Purple + Teal", vars: { "--nbl-primary": "#8b5cf6", "--nbl-accept": "#4ecba8" } },
    { key: "violet", label: "Violet Dream", emoji: "💜", swatches: ["#7c3aed", "#a78bfa"], tagline: "Rich purple", vars: { "--nbl-primary": "#7c3aed", "--nbl-accept": "#a78bfa" } },
    { key: "midnight", label: "Midnight", emoji: "🌙", swatches: ["#4338ca", "#6366f1"], tagline: "Deep indigo", vars: { "--nbl-primary": "#4338ca", "--nbl-accept": "#6366f1" } },
    { key: "emerald", label: "Emerald Forest", emoji: "🌿", swatches: ["#059669", "#34d399"], tagline: "Fresh green", vars: { "--nbl-primary": "#059669", "--nbl-accept": "#34d399" } },
    { key: "ocean", label: "Ocean Breeze", emoji: "🌊", swatches: ["#0284c7", "#38bdf8"], tagline: "Cool blue", vars: { "--nbl-primary": "#0284c7", "--nbl-accept": "#38bdf8" } },
    { key: "blush", label: "Blush Pink", emoji: "🌸", swatches: ["#db2777", "#f472b6"], tagline: "Soft pink", vars: { "--nbl-primary": "#db2777", "--nbl-accept": "#f472b6" } },
    { key: "ember", label: "Ember", emoji: "🔥", swatches: ["#dc2626", "#f97316"], tagline: "Bold red-orange", vars: { "--nbl-primary": "#dc2626", "--nbl-accept": "#f97316" } },
    { key: "slate", label: "Slate", emoji: "🪨", swatches: ["#475569", "#64748b"], tagline: "Neutral & calm", vars: { "--nbl-primary": "#475569", "--nbl-accept": "#64748b" } },
];

// ─────────────────────────────────────────────────────────────────────────────
// CSS_DEFAULTS  — only the 2 colors + layout
// ─────────────────────────────────────────────────────────────────────────────
export const CSS_DEFAULTS = {
    "--nbl-primary": "#8b5cf6",
    "--nbl-accept": "#4ecba8",
    "--nbl-launcher-position": "right",
    "--nbl-launcher-bottom": "24px",
    "--nbl-launcher-side-offset": "20px",
    "--nbl-launcher-icon": "'🎁'",
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
export function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
export function isEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
export function buildInitialVars(savedCssVars) {
    const base = deepClone(CSS_DEFAULTS);
    if (!savedCssVars || typeof savedCssVars !== "object") return base;
    // Only pick the keys that still exist in CSS_DEFAULTS
    const merged = { ...base };
    Object.keys(CSS_DEFAULTS).forEach((k) => {
        if (savedCssVars[k] !== undefined) merged[k] = savedCssVars[k];
    });
    // Back-compat: if saved had --nbl-accent but not --nbl-accept, use it
    if (!savedCssVars["--nbl-accept"] && savedCssVars["--nbl-accent"]) {
        merged["--nbl-accept"] = savedCssVars["--nbl-accent"];
    }
    return merged;
}
export function buildInitialWidgetConfig(saved) {
    const base = { ...WIDGET_CONFIG_DEFAULTS, labels: { ...LABEL_DEFAULTS }, prize: { ...WIDGET_CONFIG_DEFAULTS.prize } };
    if (!saved || typeof saved !== "object") return base;
    return {
        ...base,
        ...saved,
        labels: { ...LABEL_DEFAULTS, ...(saved.labels || {}) },
        prize: { ...WIDGET_CONFIG_DEFAULTS.prize, ...(saved.prize || {}) },
    };
}
export const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
export function isHex(v) { return HEX_RE.test((v ?? "").trim()); }

// Design system tokens for dashboard UI (React inline styles)
export const DS = {
    sp2: "2px", sp4: "4px", sp6: "6px", sp8: "8px", sp10: "10px", sp12: "12px",
    sp14: "14px", sp16: "16px", sp20: "20px", sp24: "24px",
    r6: "6px", r8: "8px", r10: "10px", r12: "12px", r16: "16px", r99: "99px",
    white: "#ffffff", bg: "#f9fafb", bgCard: "#ffffff",
    borderLight: "#e5e7eb", borderMid: "#d1d5db",
    text: "#111827", textSub: "#374151", textMuted: "#6b7280", textHint: "#9ca3af",
    accentBg: "#f5f3ff", accentText: "#6d28d9", accentBorder: "#ede9fe",
    warnBg: "#fffbeb", warnBorder: "#fde68a", warnText: "#92400e",
    dangerText: "#dc2626", dangerBg: "#fef2f2",
};

// Section → preview scene mapping
export const SECTION_TO_SCENE = {
    brand: "home", launcher: "home",
    headerAnimation: "home", labels: "home",
};
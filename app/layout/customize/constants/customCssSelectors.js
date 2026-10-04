// ─────────────────────────────────────────────────────────────────────────────
// "Most used" selectors for Customize > Custom CSS > View selectors.
//
// Hand-picked, with plain-language descriptions — the full list is generated
// from ui.css (widgetSelectors.generated.js). Every class used here must
// exist in that generated list or be the "&" scope; a test checks this, so
// renaming a class in ui.css without updating this file is caught.
//
// Selectors are written exactly as they go in the Custom CSS box, which is
// already scoped to the page / full-screen widget — hence "&" for the
// widget box itself (CSS nesting: & = the widget container).
// Client-safe: no server imports.
// ─────────────────────────────────────────────────────────────────────────────

export const COMMON_CSS_SELECTORS = [
    { selector: "&", description: "The whole widget box (background, border, corner radius)" },
    { selector: "&.nbl-widget-container--page", description: "The widget box — Loyalty page only" },
    { selector: "&.nbl-widget-container--fullscreen", description: "The widget box — full screen only" },
    { selector: ".nbl-header", description: "Coloured header bar at the top" },
    { selector: ".nbl-header__title", description: "\"Welcome, [name]\" title" },
    { selector: ".nbl-header__points", description: "Points balance badge in the header" },
    { selector: ".nbl-nav", description: "Tab bar (Home, Referral, Earn…)" },
    { selector: ".nbl-nav__item", description: "Each tab" },
    { selector: ".nbl-nav__item.active", description: "The selected tab" },
    { selector: ".nbl-widget-body", description: "Content area under the tabs" },
    { selector: ".nbl-home-nav__item", description: "Home shortcut cards (Browse Rewards, Earn Points, Refer Friends)" },
    { selector: ".nbl-home-nav__label", description: "Text on the Home shortcut cards" },
    { selector: ".nbl-home-section-card", description: "Home sections (Active Rewards, Prize Requests, Recent Activity)" },
    { selector: ".nbl-section-title", description: "Section titles such as \"ACTIVE REWARDS\"" },
    { selector: ".nbl-item", description: "Each reward / prize row" },
    { selector: ".nbl-item__title", description: "Reward / prize name" },
    { selector: ".nbl-item__meta", description: "Small details under a reward / prize name" },
    { selector: ".nbl-activity-table", description: "Recent activity table" },
    { selector: ".nbl-activity-row", description: "Each activity row" },
    { selector: ".nbl-button", description: "All buttons" },
    { selector: ".nbl-button--primary", description: "Main (filled) buttons" },
    { selector: ".nbl-referral__title", description: "Referral tab title" },
    { selector: ".nbl-referral__input", description: "Referral link box" },
    { selector: ".nbl-referral__copy-btn", description: "Referral link Copy button" },
    { selector: ".nbl-referral__share-btn", description: "Share buttons (WhatsApp, Email…)" },
    { selector: ".nbl-heading", description: "Headings inside tabs" },
    { selector: ".nbl-text--muted", description: "Secondary / grey text" },
    { selector: ".nbl-guest__hero", description: "Signed-out view — top banner" },
    { selector: ".nbl-guest__btn--primary", description: "Signed-out view — Create Account button" },
];

import { useState, useMemo, useEffect, useCallback, useRef, useDeferredValue, memo } from "react";
import { createPortal } from "react-dom";
import { useActionData, useLoaderData, useSubmit, useNavigation } from "react-router";
import { authenticate } from "shopify-server";
import prisma from "db-server";
import syncAppConfig from "../controller/metafieldsSync/syncAppConfig";

// ─────────────────────────────────────────────────────────────────────────────
// SIMPLE MODE CONFIG
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET CONFIG — Non-CSS behaviour settings
// Saved as styles.widgetConfig in DB, read by applyWidgetConfigOverrides() in JS.
// ─────────────────────────────────────────────────────────────────────────────

const LABEL_DEFAULTS = {
    // Header
    headerLabel: "Welcome, [name]",
    pointsLabel: "[points] pts",
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
};

const WIDGET_CONFIG_DEFAULTS = {
    showHomeRewardsSection: true,
    showHomeActivitiesSection: true,
    homeRewardsPerPage: 5,
    homeActivitiesPerPage: 7,
    paginationMode: "pagination",
    headerEffect: "wave",
    headerEffectOpacity: 0.55,
    headerEffectColorMode: "auto",
    mouseEffect: "bubble",
    mouseEffectIntensity: 0.7,
    labels: { ...LABEL_DEFAULTS },
};

const WIDGET_CONFIG_SECTIONS = [
    {
        key: "behaviour",
        label: "Behaviour",
        icon: "⚙️",
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
                default: "pagination",
            },
        ],
    },
    {
        key: "headerAnimation",
        label: "Header Effect",
        icon: "✨",
        description: "Decorative animation displayed in the widget header background.",
        fields: [
            {
                key: "headerEffect",
                label: "Effect style",
                hint: "The visual effect shown in the header",
                type: "select",
                options: [
                    { value: "wave", label: "Wave" },
                    { value: "bubble", label: "Bubble" },
                    { value: "drop", label: "Drop" },
                    { value: "ripple", label: "Ripple" },
                    { value: "none", label: "None" },
                ],
                configKey: "headerEffect",
                default: "wave",
            },
            {
                key: "headerEffectOpacity",
                label: "Effect intensity",
                hint: "How strong the header effect appears (0 = invisible, 100 = full strength)",
                type: "range",
                min: 0,
                max: 100,
                unit: "%",
                configKey: "headerEffectOpacity",
                default: 55,
                parseValue: (v) => Number(v) / 100,
                displayValue: (v) => Math.round(Number(v) * 100),
            },
            {
                key: "headerEffectColorMode",
                label: "Effect color mode",
                hint: "How the effect color is determined — Auto detects from your header color",
                type: "select",
                options: [
                    { value: "auto", label: "Auto (detect from header)" },
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                ],
                configKey: "headerEffectColorMode",
                default: "auto",
            },
        ],
    },
    {
        key: "mouseAnimation",
        label: "Mouse Effect",
        icon: "🖱️",
        description: "Particle effect that follows the cursor inside the open widget.",
        fields: [
            {
                key: "mouseEffect",
                label: "Effect style",
                hint: "The particle effect that follows the mouse cursor",
                type: "select",
                options: [
                    { value: "bubble", label: "Bubble" },
                    { value: "sparkle", label: "Sparkle" },
                    { value: "fire", label: "Fire" },
                    { value: "smoke", label: "Smoke" },
                    { value: "ripple", label: "Ripple" },
                    { value: "none", label: "None" },
                ],
                configKey: "mouseEffect",
                default: "bubble",
            },
            {
                key: "mouseEffectIntensity",
                label: "Effect intensity",
                hint: "How strong the mouse effect appears (0 = barely visible, 100 = full strength)",
                type: "range",
                min: 0,
                max: 100,
                unit: "%",
                configKey: "mouseEffectIntensity",
                default: 70,
                parseValue: (v) => Number(v) / 100,
                displayValue: (v) => Math.round(Number(v) * 100),
            },
        ],
    },
    {
        key: "labels",
        label: "Labels & Text",
        icon: "✏️",
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
        ],
    },
];

const SIMPLE_SECTIONS = [
    {
        key: "header",
        label: "Header",
        icon: "📌",
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
        icon: "🗂️",
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
        icon: "🎨",
        description: "Primary and accent colors that flow through the whole widget.",
        fields: [
            { key: "primary", label: "Brand primary color", hint: "Your main brand color — used for active tabs and highlights throughout the widget", type: "color", maps: ["--nbl-primary", "--nbl-nav-active-color", "--nbl-nav-active-border", "--nbl-loadmore-color"], default: "#8b5cf6" },
            { key: "accent", label: "Accent color", hint: "Secondary color used for active reward highlights and positive indicators", type: "color", maps: ["--nbl-accent", "--nbl-reward-item-active-border"], default: "#4ecba8" },
        ],
    },
    {
        key: "buttons",
        label: "Action Buttons",
        icon: "🔘",
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
        icon: "✍️",
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
        icon: "🪟",
        description: "Widget body background, card backgrounds, borders and border radius.",
        fields: [
            { key: "surface", label: "Widget background", hint: "Main background color of the widget content area", type: "color", maps: ["--nbl-surface"], default: "#ffffff" },
            { key: "surface2", label: "Card background", hint: "Background color for reward cards and section panels", type: "color", maps: ["--nbl-surface-2", "--nbl-reward-item-bg", "--nbl-hsc-header-bg", "--nbl-card-bg"], default: "#f8f7ff" },
            { key: "surfaceHover", label: "Hover highlight", hint: "Background color that appears when hovering over clickable items", type: "color", maps: ["--nbl-surface-hover"], default: "#f3f1fc" },
            { key: "borderColor", label: "Border & divider color", hint: "Color of lines that separate sections and outline cards", type: "color", maps: ["--nbl-border", "--nbl-nav-border-color", "--nbl-card-border", "--nbl-reward-item-border"], default: "#e9e7f0" },
            { key: "radius", label: "Widget corner roundness", hint: "How rounded the outer corners of the widget appear", type: "range", min: 0, max: 28, unit: "px", maps: ["--nbl-radius", "--nbl-radius-xl"], default: "16px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
            { key: "cardRadius", label: "Card corner roundness", hint: "How rounded the corners of cards and rows appear", type: "range", min: 0, max: 20, unit: "px", maps: ["--nbl-card-radius", "--nbl-reward-item-radius", "--nbl-radius-lg"], default: "12px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
            { key: "widgetBodyPadding", label: "Content area spacing", hint: "Inner spacing of the main widget content area", type: "text", maps: ["--nbl-widget-body-padding"], default: "14px 14px 24px" },
        ],
    },
    {
        key: "rewards",
        label: "Reward Items",
        icon: "🎁",
        description: "Cards shown in the Rewards and Active Rewards tabs.",
        fields: [
            { key: "rewardItemBg", label: "Reward card background", hint: "Background color of each reward item card", type: "color", maps: ["--nbl-reward-item-bg"], default: "#f8f7ff" },
            { key: "rewardItemActiveBg", label: "Redeemed card background", hint: "Background color of a reward card that has been claimed or is active", type: "color", maps: ["--nbl-reward-item-active-bg"], default: "#f0fdf9" },
            { key: "rewardItemActiveBorder", label: "Redeemed card border", hint: "Border color highlighting a claimed or active reward card", type: "color", maps: ["--nbl-reward-item-active-border"], default: "#4ecba8" },
            { key: "rewardTitleFontSize", label: "Reward name size", hint: "How large the reward title text appears on each card", type: "range", min: 11, max: 17, unit: "px", maps: ["--nbl-reward-title-font-size"], default: "13.5px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
        ],
    },
    {
        key: "activity",
        label: "Activity Table",
        icon: "📊",
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
        icon: "📄",
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
        label: "Notifications",
        icon: "🔔",
        description: "Slide-up panels — reward earned (green) and generic info (dark).",
        fields: [
            { key: "notifyBgFrom", label: "Popup gradient — top color", hint: "First gradient color shared by both reward and info slide-up panels", type: "color", maps: ["--nbl-notify-bg-from"], default: "#15803d" },
            { key: "notifyBgTo", label: "Popup gradient — bottom color", hint: "Second gradient color shared by both reward and info slide-up panels", type: "color", maps: ["--nbl-notify-bg-to"], default: "#22c55e" },
            { key: "notifyColor", label: "Popup text color", hint: "Color of text inside both reward and info slide-up panels", type: "color", maps: ["--nbl-notify-color"], default: "#ffffff" },
            { key: "notifyRewardCodeBg", label: "Reward code box color", hint: "Background color of the code display box inside the reward popup", type: "color", maps: ["--nbl-notify-reward-code-bg"], default: "rgba(255,255,255,0.22)", resolvedDefault: "#b0e8d4" },
            { key: "notifyRewardBtnBg", label: "Reward button background", hint: "Background color of the Copy button inside the reward popup", type: "color", maps: ["--nbl-notify-reward-btn-bg"], default: "#4ecba8" },
            { key: "notifyRewardBtnColor", label: "Reward button text color", hint: "Text color of the Copy button inside the reward popup", type: "color", maps: ["--nbl-notify-reward-btn-color"], default: "#16a34a" },
            { key: "notifyRewardBtnBorder", label: "Reward button border", hint: "Border color of the Copy button inside the reward popup", type: "color", maps: ["--nbl-notify-reward-btn-border"], default: "#4ecba8" },
            { key: "notifyInfoBtnBg", label: "Info button background", hint: "Background color of the action button inside the info popup", type: "color", maps: ["--nbl-notify-info-btn-bg"], default: "#4ecba8" },
            { key: "notifyInfoBtnColor", label: "Info button text color", hint: "Text color of the action button inside the info popup", type: "color", maps: ["--nbl-notify-info-btn-color"], default: "#ffffff" },
            { key: "notifyInfoBtnBorder", label: "Info button border", hint: "Border color of the action button inside the info popup", type: "color", maps: ["--nbl-notify-info-btn-border"], default: "#4ecba8" },
        ],
    },
    {
        key: "status",
        label: "Status Colors",
        icon: "🚦",
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
        key: "modal",
        label: "Referral Modal",
        icon: "🔗",
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
            { key: "modalCodeBg", label: "Referral code box color", hint: "Background color of the box that displays the referral link", type: "color", maps: ["--nbl-modal-code-bg"], default: "#f8fafc" },
            { key: "modalCodeBorder", label: "Referral code box border", hint: "Border color around the referral link box", type: "color", maps: ["--nbl-modal-code-border"], default: "#d1d5db" },
            { key: "modalBrandBg", label: "App badge background", hint: "Background color of the app name badge at the top of the popup", type: "color", maps: ["--nbl-modal-brand-bg"], default: "#ecfdf5" },
            { key: "modalBrandColor", label: "App badge text color", hint: "Color of the text inside the app name badge", type: "color", maps: ["--nbl-modal-brand-color"], default: "#15803d" },
        ],
    },
    {
        key: "launcher",
        label: "Launcher Button",
        icon: "🚀",
        description: "The floating pill on your storefront that opens the widget.",
        fields: [
            { key: "launcherTitle", label: "Button text", hint: "The main label shown on the floating button (e.g. 'Loyalty Rewards')", type: "text", maps: ["--nbl-launcher-title"], default: "'Loyalty Rewards'", displayValue: (v) => v.replace(/^'|'$/g, ""), parseValue: (v) => `'${v}'` },
            { key: "launcherIcon", label: "Button icon", hint: "Emoji icon displayed on the floating button", type: "emoji", options: ["🎁", "⭐", "🏆", "💎", "🎯", "✨", "🎪", "🎀"], maps: ["--nbl-launcher-icon"], default: "'🎁'", displayValue: (v) => v.replace(/^'|'$/g, ""), parseValue: (v) => `'${v}'` },
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
        icon: "⚡",
        description: "Speed controls, header decoration effect, and mouse cursor effect.",
        fields: [
            { key: "durFast", label: "Quick animation speed", hint: "Speed of hover and badge transitions", type: "range", min: 50, max: 500, unit: "ms", maps: ["--nbl-dur-fast", "--nbl-transition-fast"], default: "0.18s", parseValue: (v) => `${(v / 1000).toFixed(2)}s`, displayValue: (v) => { const n = parseFloat(v); return Math.round((isNaN(n) ? 0.18 : n) * 1000); } },
            { key: "durNormal", label: "Normal animation speed", hint: "Speed of tab switching and card transitions", type: "range", min: 50, max: 600, unit: "ms", maps: ["--nbl-dur-normal", "--nbl-transition-base"], default: "0.28s", parseValue: (v) => `${(v / 1000).toFixed(2)}s`, displayValue: (v) => { const n = parseFloat(v); return Math.round((isNaN(n) ? 0.28 : n) * 1000); } },
            { key: "durSlow", label: "Slow animation speed", hint: "Speed of the widget opening and closing", type: "range", min: 100, max: 800, unit: "ms", maps: ["--nbl-dur-slow", "--nbl-transition-slow"], default: "0.42s", parseValue: (v) => `${(v / 1000).toFixed(2)}s`, displayValue: (v) => { const n = parseFloat(v); return Math.round((isNaN(n) ? 0.42 : n) * 1000); } },
            { key: "easeSpring", label: "Open animation style", hint: "How the widget feels when it opens", type: "select", options: [{ value: "cubic-bezier(0.34, 1.56, 0.64, 1)", label: "Springy (default)" }, { value: "cubic-bezier(0.22, 1, 0.36, 1)", label: "Smooth" }, { value: "cubic-bezier(0.4, 0, 0.2, 1)", label: "Snappy" }, { value: "linear", label: "Linear" }], maps: ["--nbl-ease-spring"], default: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
            { key: "easeOut", label: "Close animation style", hint: "How the widget feels when it closes", type: "select", options: [{ value: "cubic-bezier(0.22, 1, 0.36, 1)", label: "Smooth (default)" }, { value: "cubic-bezier(0.4, 0, 0.2, 1)", label: "Snappy" }, { value: "cubic-bezier(0.34, 1.56, 0.64, 1)", label: "Springy" }, { value: "linear", label: "Linear" }], maps: ["--nbl-ease-out"], default: "cubic-bezier(0.22, 1, 0.36, 1)" },
        ],
    },
    {
        key: "glow",
        label: "Widget Glow Effect",
        icon: "✨",
        description: "Ambient glow ring around the open widget container.",
        fields: [
            { key: "glowPrimary", label: "Primary glow strength", hint: "How strong the inner glow around the widget appears", type: "range", min: 0, max: 30, unit: "%", maps: ["--nbl-widget-glow-primary"], default: "color-mix(in srgb, var(--nbl-primary) 12%, transparent)", parseValue: (v) => `color-mix(in srgb, var(--nbl-primary) ${v}%, transparent)`, displayValue: (v) => { const m = String(v).match(/(\d+)%/); return m ? parseInt(m[1]) : 12; } },
            { key: "glowHalo", label: "Halo glow strength", hint: "How strong the outer soft halo glow appears", type: "range", min: 0, max: 20, unit: "%", maps: ["--nbl-widget-glow-halo"], default: "color-mix(in srgb, var(--nbl-primary) 5%, transparent)", parseValue: (v) => `color-mix(in srgb, var(--nbl-primary) ${v}%, transparent)`, displayValue: (v) => { const m = String(v).match(/(\d+)%/); return m ? parseInt(m[1]) : 5; } },
        ],
    },
    {
        key: "borders",
        label: "Borders",
        icon: "⬜",
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
        icon: "🔲",
        description: "Corner rounding scale used across the whole widget — from small chips to fully rounded pills.",
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
        icon: "🌑",
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
        icon: "🃏",
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
        icon: "🏠",
        description: "The header strip shown above Active Rewards and Activity lists on the Home tab.",
        fields: [
            { key: "hscHeaderBg", label: "Section header background", hint: "Background of the section header strip on the Home tab", type: "color", maps: ["--nbl-hsc-header-bg"], default: "#f8f7ff" },
            { key: "hscHeaderPadding", label: "Section header padding", hint: "Inner spacing of the section header strip", type: "text", maps: ["--nbl-hsc-header-padding"], default: "10px 14px" },
            { key: "hscHeaderRadius", label: "Section header radius", hint: "Corner rounding of the section header strip", type: "range", min: 0, max: 20, unit: "px", maps: ["--nbl-hsc-header-radius"], default: "10px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
            { key: "hscTitleFontSize", label: "Section title size", hint: "Font size of the section heading text", type: "range", min: 10, max: 16, unit: "px", maps: ["--nbl-hsc-title-font-size"], default: "12px", parseValue: (v) => `${v}px`, displayValue: (v) => parseInt(v) },
            { key: "hscTitleColor", label: "Section title color", hint: "Color of the section heading text", type: "color", maps: ["--nbl-hsc-title-color"], default: "#6b7280" },
            { key: "homeNavColor", label: "Home nav card text color", hint: "Text color on the navigation shortcut cards on the Home tab", type: "color", maps: ["--nbl-home-nav-color"], default: "#1a1a2e" },
        ],
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// PRESET THEMES — Comprehensive with Light / Dark / Accent / Neon / etc.
// ─────────────────────────────────────────────────────────────────────────────

const PRESETS = [
    {
        key: "midnight",
        label: "Midnight Dark",
        emoji: "🌙",
        swatches: ["#6366f1", "#818cf8", "#1e1b4b"],
        tagline: "Sleek dark mode",
        vars: {
            "--nbl-primary": "#4338ca", "--nbl-header-bg": "#1e1b4b",
            "--nbl-nav-active-color": "#818cf8", "--nbl-nav-active-border": "#818cf8",
            "--nbl-loadmore-color": "#818cf8", "--nbl-accent": "#6366f1",
            "--nbl-btn-bg": "#6366f1", "--nbl-btn-border": "#6366f1", "--nbl-btn-color": "#ffffff",
            "--nbl-reward-item-active-border": "#818cf8", "--nbl-reward-item-active-bg": "#1e1b4b",
            "--nbl-launcher-bg": "#6366f1",
            "--nbl-surface": "#0f0e1a", "--nbl-surface-2": "#1a1833",
            "--nbl-reward-item-bg": "#1a1833", "--nbl-hsc-header-bg": "#1a1833",
            "--nbl-nav-bg": "#12111f", "--nbl-nav-item-color": "#a5b4fc",
            "--nbl-text": "#e0e7ff", "--nbl-text-muted": "#a5b4fc",
            "--nbl-border": "#2d2b52", "--nbl-nav-border-color": "#2d2b52",
            "--nbl-card-bg": "#1a1833", "--nbl-card-border": "#2d2b52",
            "--nbl-home-nav-color": "#e0e7ff",
            "--nbl-notify-bg-from": "#3730a3", "--nbl-notify-bg-to": "#6366f1",
            "--nbl-notify-color": "#ffffff",
            "--nbl-notify-reward-code-bg": "rgba(255,255,255,0.18)",
            "--nbl-notify-reward-btn-bg": "#818cf8", "--nbl-notify-reward-btn-color": "#1e1b4b", "--nbl-notify-reward-btn-border": "#818cf8",
            "--nbl-notify-info-btn-bg": "#818cf8", "--nbl-notify-info-btn-color": "#1e1b4b", "--nbl-notify-info-btn-border": "#818cf8",
        },
    },
    {
        key: "emerald",
        label: "Emerald Forest",
        emoji: "🌿",
        swatches: ["#059669", "#34d399", "#ecfdf5"],
        tagline: "Fresh & natural",
        vars: {
            "--nbl-primary": "#059669", "--nbl-header-bg": "#059669",
            "--nbl-nav-active-color": "#059669", "--nbl-nav-active-border": "#059669",
            "--nbl-loadmore-color": "#059669", "--nbl-accent": "#34d399",
            "--nbl-btn-bg": "#059669", "--nbl-btn-border": "#059669", "--nbl-btn-color": "#ffffff",
            "--nbl-reward-item-active-border": "#34d399", "--nbl-reward-item-active-bg": "#ecfdf5",
            "--nbl-launcher-bg": "#059669",
            "--nbl-surface": "#ffffff", "--nbl-surface-2": "#ecfdf5",
            "--nbl-reward-item-bg": "#ecfdf5", "--nbl-hsc-header-bg": "#ecfdf5",
            "--nbl-nav-bg": "#ffffff", "--nbl-nav-item-color": "#6b7280",
            "--nbl-text": "#0a1f18", "--nbl-text-muted": "#6b7280",
            "--nbl-border": "#a7f3d0", "--nbl-nav-border-color": "#a7f3d0",
            "--nbl-card-bg": "#ffffff", "--nbl-card-border": "#a7f3d0",
            "--nbl-notify-bg-from": "#065f46", "--nbl-notify-bg-to": "#059669",
            "--nbl-notify-color": "#ffffff",
            "--nbl-notify-reward-code-bg": "rgba(255,255,255,0.2)",
            "--nbl-notify-reward-btn-bg": "#34d399", "--nbl-notify-reward-btn-color": "#064e3b", "--nbl-notify-reward-btn-border": "#34d399",
            "--nbl-notify-info-btn-bg": "#34d399", "--nbl-notify-info-btn-color": "#064e3b", "--nbl-notify-info-btn-border": "#34d399",
        },
    },
    {
        key: "ocean",
        label: "Ocean Breeze",
        emoji: "🌊",
        swatches: ["#0284c7", "#38bdf8", "#f0f9ff"],
        tagline: "Cool & professional",
        vars: {
            "--nbl-primary": "#0284c7", "--nbl-header-bg": "#0284c7",
            "--nbl-nav-active-color": "#0284c7", "--nbl-nav-active-border": "#0284c7",
            "--nbl-loadmore-color": "#0284c7", "--nbl-accent": "#38bdf8",
            "--nbl-btn-bg": "#0284c7", "--nbl-btn-border": "#0284c7", "--nbl-btn-color": "#ffffff",
            "--nbl-reward-item-active-border": "#38bdf8", "--nbl-reward-item-active-bg": "#f0f9ff",
            "--nbl-launcher-bg": "#0284c7",
            "--nbl-surface": "#ffffff", "--nbl-surface-2": "#f0f9ff",
            "--nbl-reward-item-bg": "#f0f9ff", "--nbl-hsc-header-bg": "#f0f9ff",
            "--nbl-nav-bg": "#ffffff", "--nbl-nav-item-color": "#6b7280",
            "--nbl-text": "#0c1a2e", "--nbl-text-muted": "#6b7280",
            "--nbl-border": "#bae6fd", "--nbl-nav-border-color": "#bae6fd",
            "--nbl-card-bg": "#ffffff", "--nbl-card-border": "#bae6fd",
            "--nbl-notify-bg-from": "#075985", "--nbl-notify-bg-to": "#0284c7",
            "--nbl-notify-color": "#ffffff",
            "--nbl-notify-reward-code-bg": "rgba(255,255,255,0.2)",
            "--nbl-notify-reward-btn-bg": "#38bdf8", "--nbl-notify-reward-btn-color": "#0c4a6e", "--nbl-notify-reward-btn-border": "#38bdf8",
            "--nbl-notify-info-btn-bg": "#38bdf8", "--nbl-notify-info-btn-color": "#0c4a6e", "--nbl-notify-info-btn-border": "#38bdf8",
        },
    },
    {
        key: "blush",
        label: "Blush Pink",
        emoji: "🌸",
        swatches: ["#db2777", "#f472b6", "#fdf2f8"],
        tagline: "Soft & feminine",
        vars: {
            "--nbl-primary": "#db2777", "--nbl-header-bg": "#db2777",
            "--nbl-nav-active-color": "#db2777", "--nbl-nav-active-border": "#db2777",
            "--nbl-loadmore-color": "#db2777", "--nbl-accent": "#f472b6",
            "--nbl-btn-bg": "#db2777", "--nbl-btn-border": "#db2777", "--nbl-btn-color": "#ffffff",
            "--nbl-reward-item-active-border": "#f472b6", "--nbl-reward-item-active-bg": "#fdf2f8",
            "--nbl-launcher-bg": "#db2777",
            "--nbl-surface": "#ffffff", "--nbl-surface-2": "#fdf2f8",
            "--nbl-reward-item-bg": "#fdf2f8", "--nbl-hsc-header-bg": "#fdf2f8",
            "--nbl-nav-bg": "#ffffff", "--nbl-nav-item-color": "#9d174d",
            "--nbl-text": "#1a0011", "--nbl-text-muted": "#9d174d",
            "--nbl-border": "#fce7f3", "--nbl-nav-border-color": "#fce7f3",
            "--nbl-card-bg": "#ffffff", "--nbl-card-border": "#fce7f3",
            "--nbl-notify-bg-from": "#9d174d", "--nbl-notify-bg-to": "#db2777",
            "--nbl-notify-color": "#ffffff",
            "--nbl-notify-reward-code-bg": "rgba(255,255,255,0.2)",
            "--nbl-notify-reward-btn-bg": "#f472b6", "--nbl-notify-reward-btn-color": "#831843", "--nbl-notify-reward-btn-border": "#f472b6",
            "--nbl-notify-info-btn-bg": "#f472b6", "--nbl-notify-info-btn-color": "#831843", "--nbl-notify-info-btn-border": "#f472b6",
        },
    },
    {
        key: "violet",
        label: "Violet Dream",
        emoji: "💜",
        swatches: ["#7c3aed", "#a78bfa", "#ede9fe"],
        tagline: "Rich purple tones",
        vars: {
            "--nbl-primary": "#7c3aed", "--nbl-header-bg": "#7c3aed",
            "--nbl-nav-active-color": "#7c3aed", "--nbl-nav-active-border": "#7c3aed",
            "--nbl-loadmore-color": "#7c3aed", "--nbl-accent": "#a78bfa",
            "--nbl-btn-bg": "#7c3aed", "--nbl-btn-border": "#7c3aed", "--nbl-btn-color": "#ffffff",
            "--nbl-reward-item-active-border": "#a78bfa", "--nbl-reward-item-active-bg": "#f5f3ff",
            "--nbl-launcher-bg": "#7c3aed",
            "--nbl-surface": "#ffffff", "--nbl-surface-2": "#f5f3ff",
            "--nbl-reward-item-bg": "#f5f3ff", "--nbl-hsc-header-bg": "#f5f3ff",
            "--nbl-nav-bg": "#ffffff", "--nbl-nav-item-color": "#6b7280",
            "--nbl-text": "#1a1a2e", "--nbl-text-muted": "#6b7280",
            "--nbl-border": "#ede9fe", "--nbl-nav-border-color": "#ede9fe",
            "--nbl-card-bg": "#ffffff", "--nbl-card-border": "#ede9fe",
            "--nbl-notify-bg-from": "#4c1d95", "--nbl-notify-bg-to": "#7c3aed",
            "--nbl-notify-color": "#ffffff",
            "--nbl-notify-reward-code-bg": "rgba(255,255,255,0.18)",
            "--nbl-notify-reward-btn-bg": "#a78bfa", "--nbl-notify-reward-btn-color": "#3b0764", "--nbl-notify-reward-btn-border": "#a78bfa",
            "--nbl-notify-info-btn-bg": "#a78bfa", "--nbl-notify-info-btn-color": "#3b0764", "--nbl-notify-info-btn-border": "#a78bfa",
        },
    },
];



// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT VALUES
// ─────────────────────────────────────────────────────────────────────────────

const CSS_DEFAULTS = {
    "--nbl-primary": "#8b5cf6",
    "--nbl-primary-hover": "color-mix(in srgb, var(--nbl-primary) 85%, #000)",
    "--nbl-primary-light": "color-mix(in srgb, var(--nbl-primary) 12%, #fff)",
    "--nbl-accent": "#4ecba8",
    "--nbl-accent-hover": "color-mix(in srgb, var(--nbl-accent) 85%, #000)",
    "--nbl-accent-light": "color-mix(in srgb, var(--nbl-accent) 12%, #fff)",
    "--nbl-header-bg": "#8b5cf6",
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
    "--nbl-nav-bg": "#ffffff",
    "--nbl-nav-border-color": "#e9e7f0",
    "--nbl-nav-padding": "0 12px",
    "--nbl-nav-active-color": "#8b5cf6",
    "--nbl-nav-active-border": "#8b5cf6",
    "--nbl-nav-item-color": "#6b7280",
    "--nbl-nav-item-font-size": "12px",
    "--nbl-nav-item-font-weight": "500",
    "--nbl-nav-item-active-font-weight": "600",
    "--nbl-nav-item-padding": "14px 4px 12px",
    "--nbl-nav-item-border-width": "2.5px",
    "--nbl-nav-chevron-color": "#6b7280",
    "--nbl-nav-chevron-hover-color": "#8b5cf6",
    "--nbl-nav-chevron-bg": "#ffffff",
    "--nbl-nav-chevron-border": "#e9e7f0",
    "--nbl-nav-chevron-size": "28px",
    "--nbl-nav-chevron-icon-size": "14px",
    "--nbl-nav-chevron-radius": "8px",
    "--nbl-btn-bg": "#4ecba8",
    "--nbl-btn-color": "#ffffff",
    "--nbl-btn-border": "#4ecba8",
    "--nbl-btn-radius": "10px",
    "--nbl-btn-font-size": "14px",
    "--nbl-btn-font-weight": "600",
    "--nbl-btn-padding": "10px 20px",
    "--nbl-btn-hover-filter": "brightness(1.07)",
    "--nbl-surface": "#ffffff",
    "--nbl-surface-2": "#f8f7ff",
    "--nbl-surface-hover": "#f3f1fc",
    "--nbl-text": "#1a1a1a",
    "--nbl-text-muted": "#6b7280",
    "--nbl-text-xs": "11px",
    "--nbl-text-sm": "12px",
    "--nbl-text-base": "13px",
    "--nbl-text-md": "13.5px",
    "--nbl-text-lg": "16px",
    "--nbl-border": "#e9e7f0",
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
    "--nbl-card-bg": "#ffffff",
    "--nbl-card-border": "#e9e7f0",
    "--nbl-card-radius": "12px",
    "--nbl-card-padding": "14px 13px",
    "--nbl-card-shadow": "0 2px 12px rgba(0,0,0,0.06)",
    "--nbl-hsc-header-bg": "#f8f7ff",
    "--nbl-hsc-header-padding": "10px 14px",
    "--nbl-hsc-header-radius": "10px 10px 0 0",
    "--nbl-hsc-title-font-size": "13px",
    "--nbl-hsc-title-font-weight": "600",
    "--nbl-hsc-title-color": "#1a1a1a",
    "--nbl-hsc-icon-size": "16px",
    "--nbl-home-nav-color": "#ffffff",
    "--nbl-reward-item-bg": "#f8f7ff",
    "--nbl-reward-item-border": "#e9e7f0",
    "--nbl-reward-item-active-bg": "#f0fdf9",
    "--nbl-reward-item-active-border": "#4ecba8",
    "--nbl-reward-item-radius": "12px",
    "--nbl-reward-item-padding": "14px 13px",
    "--nbl-reward-title-font-size": "13.5px",
    "--nbl-reward-title-font-weight": "600",
    "--nbl-reward-points-font-size": "12px",
    "--nbl-reward-item-hover-shadow": "0 6px 18px rgba(78,203,168,0.25)",
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
    "--nbl-loadmore-border": "#e9e7f0",
    "--nbl-loadmore-bg": "#ffffff",
    "--nbl-loadmore-color": "#8b5cf6",
    "--nbl-loadmore-font-size": "13px",
    "--nbl-loadmore-font-weight": "600",
    "--nbl-loadmore-padding": "11px 20px",
    "--nbl-notify-bg-from": "#15803d",
    "--nbl-notify-bg-to": "#22c55e",
    "--nbl-notify-color": "#ffffff",
    "--nbl-notify-reward-code-bg": "rgba(255,255,255,0.22)",
    "--nbl-notify-reward-btn-bg": "#4ecba8",
    "--nbl-notify-reward-btn-color": "#16a34a",
    "--nbl-notify-reward-btn-border": "#4ecba8",
    "--nbl-notify-info-btn-bg": "#4ecba8",
    "--nbl-notify-info-btn-color": "#ffffff",
    "--nbl-notify-info-btn-border": "#4ecba8",
    "--nbl-status-success-bg": "#f0fdf4",
    "--nbl-status-success-border": "#86efac",
    "--nbl-status-success-color": "#166534",
    "--nbl-status-success-text": "#15803d",
    "--nbl-status-error-bg": "#fef2f2",
    "--nbl-status-error-border": "#fecaca",
    "--nbl-status-error-color": "#b91c1c",
    "--nbl-status-warning-bg": "#fffbeb",
    "--nbl-status-warning-border": "#fcd34d",
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
    "--nbl-modal-brand-bg": "#ecfdf5",
    "--nbl-modal-brand-color": "#15803d",
    "--nbl-modal-input-bg": "#f9fafb",
    "--nbl-modal-input-border": "#e5e7eb",
    "--nbl-modal-input-focus": "#16a34a",
    "--nbl-modal-input-readonly": "#f3f4f6",
    "--nbl-modal-btn-primary-bg": "#111827",
    "--nbl-modal-btn-primary-hover": "#1f2937",
    "--nbl-modal-code-bg": "#f8fafc",
    "--nbl-modal-code-border": "#d1d5db",
    "--nbl-modal-code-hover-bg": "#f0fdf4",
    "--nbl-modal-code-hover-border": "#16a34a",
    "--nbl-modal-scrollbar-color": "#d1d5db",
    "--nbl-ease-spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",
    "--nbl-ease-out": "cubic-bezier(0.22, 1, 0.36, 1)",
    "--nbl-transition-fast": "0.15s",
    "--nbl-transition-base": "0.22s",
    "--nbl-transition-slow": "0.35s",
    "--nbl-launcher-bg": "var(--nbl-btn-bg)",
    "--nbl-launcher-color": "var(--nbl-btn-color)",
    "--nbl-launcher-border-radius": "999px",
    "--nbl-launcher-size": "50px",
    "--nbl-launcher-radius": "999px",
    "--nbl-launcher-elevation": "0 6px 24px rgba(0, 0, 0, 0.22)",
    "--nbl-launcher-shadow": "0 6px 24px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.14), 0 0 0 3px rgba(255,255,255,0.15) inset",
    "--nbl-launcher-shadow-hover": "0 14px 36px rgba(0,0,0,0.28), 0 4px 12px rgba(0,0,0,0.18), 0 0 0 3px rgba(255,255,255,0.15) inset",
    "--nbl-launcher-shadow-float": "0 14px 32px rgba(0,0,0,0.28), 0 4px 10px rgba(0,0,0,0.16), 0 0 0 3px rgba(255,255,255,0.15) inset",
    "--nbl-launcher-icon": "'🎁'",
    "--nbl-launcher-icon-size": "20px",
    "--nbl-launcher-icon-bg": "rgba(0,0,0,0.18)",
    "--nbl-launcher-icon-circle": "44px",
    "--nbl-launcher-title": "'Loyalty Rewards'",
    "--nbl-launcher-title-size": "13px",
    "--nbl-launcher-title-weight": "700",
    "--nbl-launcher-sub-size": "11px",
    "--nbl-launcher-sub-weight": "500",
    "--nbl-launcher-sub-opacity": "0.82",
    "--nbl-launcher-shimmer-color": "rgba(255,255,255,0.28)",
    "--nbl-launcher-bottom": "24px",
    "--nbl-launcher-position": "right",
    "--nbl-launcher-side-offset": "20px",
    "--nbl-widget-body-padding": "14px 14px 24px",
    "--nbl-modal-radius": "20px",
    "--nbl-modal-padding": "24px 22px 22px",
    "--nbl-dur-fast": "0.18s",
    "--nbl-dur-normal": "0.28s",
    "--nbl-dur-slow": "0.42s",
    "--nbl-pg-btn-size": "30px",
    "--nbl-pg-btn-radius": "8px",
    "--nbl-header-effect": "wave",
    "--nbl-header-effect-opacity": "55%",
    "--nbl-mouse-effect": "bubble",
    "--nbl-mouse-effect-intensity": "70%",
    "--nbl-widget-glow-primary": "color-mix(in srgb, var(--nbl-primary) 12%, transparent)",
    "--nbl-widget-glow-halo": "color-mix(in srgb, var(--nbl-primary) 5%, transparent)",
};

// ─────────────────────────────────────────────────────────────────────────────
// LOADER / ACTION
// ─────────────────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const style = await prisma.style.findUnique({ where: { shop: session.shop } });
    return {
        savedCssVars: style?.cssVars ?? null,
        savedPresetKey: style?.presetKey ?? null,
        savedWidgetConfig: style?.widgetConfig ?? null,
    };
};

export const action = async ({ request }) => {
    const { session, admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent");

    async function upsertAndSync(cssVars, presetKey = null, widgetConfig = null) {
        const data = { cssVars, presetKey, widgetConfig };
        await prisma.style.upsert({
            where: { shop: session.shop },
            update: data,
            create: { shop: session.shop, sessionId: session.id, ...data },
        });
        await syncAppConfig(admin, session);
    }

    try {
        if (intent === "update") {
            const cssVars = JSON.parse(formData.get("cssVars") || "{}");
            const presetKey = formData.get("presetKey") || null;
            const rawWidgetConfig = formData.get("widgetConfig");
            const widgetConfig = rawWidgetConfig ? JSON.parse(rawWidgetConfig) : null;
            console.log("[customize] saving widgetConfig:", JSON.stringify(widgetConfig));
            await upsertAndSync(cssVars, presetKey, widgetConfig);
            console.log("[customize] upsert done, returning savedWidgetConfig:", JSON.stringify(widgetConfig));
            return { ok: true, intent, message: "Widget styles saved successfully.", savedCssVars: cssVars, savedPresetKey: presetKey, savedWidgetConfig: widgetConfig };
        }
        if (intent === "resetAll") {
            const fresh = { ...CSS_DEFAULTS };
            await upsertAndSync(fresh, null, null);
            return { ok: true, intent, message: "All styles reset to defaults.", savedCssVars: fresh, savedPresetKey: null, savedWidgetConfig: null };
        }
        if (intent === "clearAll") {
            await prisma.style.upsert({
                where: { shop: session.shop },
                update: { cssVars: null, presetKey: null, widgetConfig: null },
                create: { shop: session.shop, sessionId: session.id, cssVars: null, presetKey: null, widgetConfig: null },
            });
            await syncAppConfig(admin, session);
            return { ok: true, intent, message: "Custom styles cleared. Widget is now using default CSS.", savedCssVars: null, savedPresetKey: null, savedWidgetConfig: null };
        }
        return { ok: false, message: "Unknown intent." };
    } catch (err) {
        console.error("[customize-new] action error:", err);
        return { ok: false, intent, message: "Something went wrong. Please try again." };
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
function isEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function buildInitialVars(savedCssVars) {
    const base = deepClone(CSS_DEFAULTS);
    if (!savedCssVars || typeof savedCssVars !== "object") return base;
    return { ...base, ...savedCssVars };
}

function buildInitialWidgetConfig(saved) {
    const base = { ...WIDGET_CONFIG_DEFAULTS, labels: { ...LABEL_DEFAULTS } };
    if (!saved || typeof saved !== "object") return base;
    const merged = { ...base, ...saved };
    // Deep merge labels so partial saves don't lose defaults
    merged.labels = { ...LABEL_DEFAULTS, ...(saved.labels || {}) };
    return merged;
}
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
function isHex(v) { return HEX_RE.test((v ?? "").trim()); }

// ─────────────────────────────────────────────────────────────────────────────
// INLINE STYLES (design system)
// ─────────────────────────────────────────────────────────────────────────────

const DS = {
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
    warnBorder: "#fde68a",
    warnText: "#92400e",
    dangerText: "#dc2626",
    dangerBg: "#fef2f2",
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION → SCENE MAP
// Maps every CSS group key and simple section key to a preview "scene" so that
// clicking a group in the sidebar automatically shows the relevant widget view.
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_TO_SCENE = {
    // ── Simple mode section keys (SIMPLE_SECTIONS[].key) ─────────────────
    header: "home",             // Header bg, text, points badge
    navigation: "home",             // Nav bar tabs, chevrons
    brand: "home",             // Primary + accent colors
    buttons: "earn",             // Action CTA buttons shown in Earn tab
    text: "home",             // Text & fonts
    surfaces: "home",             // Surfaces, borders, radius
    rewards: "rewards",          // Reward item cards
    activity: "home",             // Activity table
    pagination: "rewards",          // Load More + arrow buttons
    notifications: "notification-reward", // Reward + info slide-up panels
    status: "home",             // Status color tints
    modal: "modal",              // Referral modal — standalone preview, no widget
    animations: "home",             // Transition durations / easing
    glow: "home",             // Widget glow ring

};

// ─────────────────────────────────────────────────────────────────────────────
// LIVE PREVIEW PANEL
// Renders a phone-frame storefront mock with the actual widget UI inside.
// The `previewScene` prop (derived from the active section/group) drives which
// widget view is shown:  "home" | "earn" | "rewards" | "notification-reward" |
//                        "notification-info" | "launcher" | "referral"
// When the user manually clicks a nav tab in the preview, it overrides the
// scene until they click a different section in the sidebar (controlled by the
// `manualTab` ref so it never fights the prop).
// ─────────────────────────────────────────────────────────────────────────────

const LivePreviewPanel = memo(function LivePreviewPanel({ cssVars, previewScene = "home", widgetConfig = null }) {
    // Helper to read a label — falls back to LABEL_DEFAULTS
    const lbl = (key) => (widgetConfig?.labels?.[key]) || LABEL_DEFAULTS[key] || "";
    // ── Token helpers ──────────────────────────────────────────────────────
    const get = (key, fallback = "") => cssVars[key] ?? CSS_DEFAULTS[key] ?? fallback;

    const headerBg = get("--nbl-header-bg", "#8b5cf6");
    const headerColor = get("--nbl-header-color", "#ffffff");
    const navBg = get("--nbl-nav-bg", "#ffffff");
    const navBorderColor = get("--nbl-nav-border-color", "#e9e7f0");
    const navActiveColor = get("--nbl-nav-active-color", "#8b5cf6");
    const navItemColor = get("--nbl-nav-item-color", "#6b7280");
    const surface = get("--nbl-surface", "#ffffff");
    const surface2 = get("--nbl-surface-2", "#f8f7ff");
    const textColor = get("--nbl-text", "#1a1a1a");
    const textMuted = get("--nbl-text-muted", "#6b7280");
    const border = get("--nbl-border", "#e9e7f0");
    const btnBg = get("--nbl-btn-bg", "#4ecba8");
    const btnColor = get("--nbl-btn-color", "#ffffff");
    const btnRadius = get("--nbl-btn-radius", "10px");
    const hscHeaderBg = get("--nbl-hsc-header-bg", "#f8f7ff");
    const radius = get("--nbl-radius", "16px");
    const cardRadius = get("--nbl-card-radius", "12px");
    const rewardItemBg = get("--nbl-reward-item-bg", "#f8f7ff");
    const rewardItemBorder = get("--nbl-reward-item-border", "#e9e7f0");
    const homeNavColor = get("--nbl-home-nav-color", "#ffffff");
    const activityPositive = get("--nbl-activity-positive-color", "#16a34a");
    const activityNegative = get("--nbl-activity-negative-color", "#dc2626");

    // Notification tokens
    const notifyBgFrom = get("--nbl-notify-bg-from", "#15803d");
    const notifyBgTo = get("--nbl-notify-bg-to", "#22c55e");
    const notifyColor = get("--nbl-notify-color", "#ffffff");
    const notifyRewardCodeBg = get("--nbl-notify-reward-code-bg", "rgba(255,255,255,0.22)");
    const notifyRewardBtnBg = get("--nbl-notify-reward-btn-bg", "#4ecba8");
    const notifyRewardBtnColor = get("--nbl-notify-reward-btn-color", "#16a34a");
    const notifyRewardBtnBorder = get("--nbl-notify-reward-btn-border", notifyRewardBtnBg);
    const notifyInfoBtnBg = get("--nbl-notify-info-btn-bg", "#4ecba8");
    const notifyInfoBtnColor = get("--nbl-notify-info-btn-color", "#ffffff");
    const notifyInfoBtnBorder = get("--nbl-notify-info-btn-border", notifyInfoBtnBg);

    // Modal (Referral) tokens
    const modalBg = get("--nbl-modal-bg", "#ffffff");
    const modalTitleColor = get("--nbl-modal-title-color", "#111827");
    const modalTextColor = get("--nbl-modal-text-color", "#374151");
    const modalMutedColor = get("--nbl-modal-muted-color", "#9ca3af");
    const modalInputBg = get("--nbl-modal-input-bg", "#f9fafb");
    const modalInputBorder = get("--nbl-modal-input-border", "#e5e7eb");
    const modalBtnBg = get("--nbl-modal-btn-primary-bg", "#111827");
    const modalCodeBg = get("--nbl-modal-code-bg", "#f8fafc");
    const modalCodeBorder = get("--nbl-modal-code-border", "#d1d5db");
    const modalBrandBg = get("--nbl-modal-brand-bg", "#ecfdf5");
    const modalBrandColor = get("--nbl-modal-brand-color", "#15803d");

    // Launcher tokens
    // If the stored value is a CSS var() reference (e.g. "var(--nbl-btn-bg)"),
    // resolve it to the actual token value so the preview renders correctly.
    const resolveLauncherToken = (raw, fallback) => {
        if (!raw || raw.startsWith("var(")) return fallback;
        return raw;
    };
    const launcherBg = resolveLauncherToken(get("--nbl-launcher-bg"), btnBg);
    const launcherColor = resolveLauncherToken(get("--nbl-launcher-color"), btnColor);
    const launcherTitle = get("--nbl-launcher-title", "'Loyalty Rewards'").replace(/^'|'$/g, "");
    const launcherIcon = get("--nbl-launcher-icon", "'🎁'").replace(/^'|'$/g, "");
    const launcherPosition = get("--nbl-launcher-position", "right");
    const isLeft = launcherPosition === "left";

    // ── Tab ↔ scene sync ───────────────────────────────────────────────────
    // Map incoming scene to a nav-tab index (0=Home, 1=Earn, 2=Rewards)
    const sceneToTab = { home: 0, earn: 1, rewards: 2 };
    const overlayScenes = new Set(["notification-reward", "notification-info", "launcher", "referral"]);

    // Manually selected tab overrides scene-driven tab only when the user
    // explicitly clicks in the preview; it resets whenever previewScene changes.
    const [manualTab, setManualTab] = useState(null);
    const prevScene = useRef(previewScene);
    useEffect(() => {
        if (prevScene.current !== previewScene) {
            setManualTab(null); // reset manual override when section changes
            prevScene.current = previewScene;
        }
    }, [previewScene]);

    // Resolved tab index shown in nav
    const resolvedTabIndex = manualTab !== null
        ? manualTab
        : (sceneToTab[previewScene] ?? 0);

    const isOverlay = overlayScenes.has(previewScene) && manualTab === null;

    const navTabs = [lbl("navHome"), lbl("navEarn"), lbl("navRewards")];
    // Keep backward compat — legacy prop
    const [previewTab, setPreviewTab] = useState(0);

    // ── Widget open/close state — launcher click toggles widget ──────────
    // Auto-open when a non-launcher section is active so the widget is visible
    const [widgetOpen, setWidgetOpen] = useState(true);

    // Auto-open widget whenever the active scene changes to a non-launcher scene
    useEffect(() => {
        if (previewScene !== "launcher") {
            setWidgetOpen(true);
        }
    }, [previewScene]);

    // ── Portal mount target — use document.body so the widget escapes the grid ──
    // isMounted guard prevents SSR crash (Shopify admin renders server-side first)
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => { setIsMounted(true); }, []);

    // ── Scene label map ───────────────────────────────────────────────────────
    const sceneLabels = {
        "home": "Home tab",
        "earn": "Earn tab",
        "rewards": "Rewards tab",
        "notification-reward": "Reward notification",
        "notification-info": "Info notification",
        "launcher": "Launcher button",
        "referral": "Referral claim",
        "modal": "Referral modal",
    };

    // ── Widget popup JSX (portalled to document.body) ─────────────────────────
    const widgetPopup = widgetOpen && (
        <div data-nbl-preview style={{
            position: "fixed",
            bottom: 95,           // launcher: bottom 24 + height 56px + gap 15px = 95px
            ...(isLeft ? { left: 24 } : { right: 24 }),
            width: 390,
            height: 520,          // fixed height — same min and max
            display: "flex",
            flexDirection: "column",
            background: surface,
            borderRadius: radius,
            overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.28), 0 4px 16px rgba(0,0,0,0.12)",
            zIndex: 9999998,
            // Reset font so Shopify admin styles don't bleed into the widget preview
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            fontSize: "14px",
            lineHeight: 1.5,
            color: "#1a1a1a",
            boxSizing: "border-box",
            // Animate in
            animation: "nblWidgetIn 0.22s cubic-bezier(0.34,1.56,0.64,1) both",
        }}>
            {/* Header */}
            <div style={{ background: headerBg, padding: "18px 16px 16px", position: "relative" }}>
                <div
                    onClick={() => setWidgetOpen(false)}
                    style={{
                        position: "absolute", top: 10, right: 10,
                        width: 28, height: 28, borderRadius: "50%",
                        background: "rgba(255,255,255,0.18)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, color: headerColor, fontWeight: 700, cursor: "pointer",
                    }}
                >✕</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: headerColor, marginBottom: 10, letterSpacing: "-0.02em" }}>
                    Welcome, Dev 21
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", background: "rgba(255,255,255,0.18)", borderRadius: 99, padding: "5px 16px", border: "1px solid rgba(255,255,255,0.28)" }}>
                    <span style={{ fontSize: 12, color: headerColor, fontWeight: 500 }}>
                        Account Balance: <strong>1,425</strong>
                    </span>
                </div>
            </div>

            {/* Nav tabs */}
            <div style={{ background: navBg, borderBottom: `1.5px solid ${navBorderColor}`, display: "flex", alignItems: "stretch", padding: "0 10px" }}>
                {navTabs.map((tab, i) => (
                    <button
                        key={tab}
                        onClick={() => { setManualTab(i); setPreviewTab(i); }}
                        style={{
                            background: "none", border: "none", cursor: "pointer",
                            padding: "12px 8px 10px", fontSize: 12,
                            fontWeight: resolvedTabIndex === i ? 600 : 400,
                            color: resolvedTabIndex === i ? navActiveColor : navItemColor,
                            borderBottom: resolvedTabIndex === i ? `2.5px solid ${navActiveColor}` : "2.5px solid transparent",
                            marginBottom: -1.5, transition: "all 0.15s", flex: 1, textAlign: "center",
                        }}
                    >{tab}</button>
                ))}
                <div style={{ display: "flex", alignItems: "center", padding: "0 4px" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: navBg, border: `1.5px solid ${navBorderColor}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: navItemColor, fontWeight: 700 }}>›</div>
                </div>
            </div>

            {/* Tab body — scrollable, grows to fill remaining height */}
            <div style={{ background: surface, padding: "12px 10px", position: "relative", overflowY: "auto", flex: 1 }}>

                {/* HOME TAB */}
                {resolvedTabIndex === 0 && !isOverlay && (
                    <>
                        {[
                            { icon: "🛍️", label: lbl("homeCardBrowse") },
                            { icon: "⚡", label: lbl("homeCardEarn") },
                            { icon: "👥", label: lbl("homeCardRefer") },
                        ].map((item) => (
                            <div key={item.label} style={{ background: headerBg, borderRadius: cardRadius, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{ fontSize: 16 }}>{item.icon}</span>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: homeNavColor }}>{item.label}</span>
                                </div>
                                <span style={{ fontSize: 15, color: homeNavColor, opacity: 0.75 }}>›</span>
                            </div>
                        ))}
                        <div style={{ height: 8 }} />
                        {/* Active Rewards */}
                        <div style={{ border: `1.5px solid ${border}`, borderRadius: cardRadius, overflow: "hidden", marginBottom: 8 }}>
                            <div style={{ background: hscHeaderBg, padding: "9px 12px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", gap: 7 }}>
                                <span>🎁</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: textColor, textTransform: "uppercase", letterSpacing: "0.06em" }}>{lbl("sectionActiveRewards")}</span>
                            </div>
                            {[{ label: "Voucher $5" }, { label: "Voucher $10" }].map((v, i) => (
                                <div key={i} style={{ background: surface, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: i === 0 ? `1px solid ${border}` : "none" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <span style={{ fontSize: 16 }}>🎁</span>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: textColor }}>{v.label}</span>
                                    </div>
                                    <span style={{ fontSize: 14, color: navActiveColor }}>›</span>
                                </div>
                            ))}
                        </div>
                        {/* Recent Activity */}
                        <div style={{ border: `1.5px solid ${border}`, borderRadius: cardRadius, overflow: "hidden" }}>
                            <div style={{ background: hscHeaderBg, padding: "9px 12px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", gap: 7 }}>
                                <span>⚡</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: textColor, textTransform: "uppercase", letterSpacing: "0.06em" }}>{lbl("sectionRecentActivity")}</span>
                            </div>
                            <div style={{ padding: "2px 0" }}>
                                <div style={{ display: "flex", padding: "5px 12px" }}>
                                    {[lbl("activityColDate").toUpperCase(), lbl("activityColActivity").toUpperCase(), lbl("activityColPoints").toUpperCase()].map((h) => (
                                        <span key={h} style={{ flex: 1, fontSize: 10, fontWeight: 700, color: textMuted, letterSpacing: "0.06em" }}>{h}</span>
                                    ))}
                                </div>
                                {[
                                    { date: "Jun 01", label: "Voucher $5 redeemed", pts: "-10", pos: false },
                                    { date: "May 31", label: "Direct purchase", pts: "+50", pos: true },
                                ].map((row, i) => (
                                    <div key={i} style={{ display: "flex", alignItems: "center", padding: "6px 12px", borderTop: `1px solid ${border}` }}>
                                        <span style={{ flex: 1, fontSize: 11, color: textMuted }}>{row.date}</span>
                                        <span style={{ flex: 2, fontSize: 11, color: textMuted }}>{row.label}</span>
                                        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: row.pos ? activityPositive : activityNegative, textAlign: "right" }}>{row.pts}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {/* EARN TAB */}
                {resolvedTabIndex === 1 && !isOverlay && (
                    <div>
                        {[
                            { icon: "👥", label: "Refer a Friend", sub: "100 points (first order)" },
                            { icon: "🛒", label: "Direct Purchase", sub: "50 points per $1" },
                            { icon: "⭐", label: "Loox Review Written", sub: "10 points text · 20 points photo" },
                        ].map((item, i) => (
                            <div key={i} style={{ background: rewardItemBg, border: `1.5px solid ${rewardItemBorder}`, borderRadius: cardRadius, padding: "12px 13px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                                <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: textColor }}>{item.label}</div>
                                    <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>{item.sub}</div>
                                </div>
                                <span style={{ fontSize: 14, color: navActiveColor }}>›</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* REWARDS TAB */}
                {resolvedTabIndex === 2 && !isOverlay && (
                    <div>
                        {[
                            { label: "Voucher $5", pts: "10 points" },
                            { label: "Voucher $30", pts: "300 points" },
                            { label: "Voucher $10", pts: "200 points" },
                        ].map((item, i) => (
                            <div key={i} style={{ background: rewardItemBg, border: `1.5px solid ${rewardItemBorder}`, borderRadius: cardRadius, padding: "12px 13px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                                <span style={{ fontSize: 22, flexShrink: 0 }}>🎁</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: textColor }}>{item.label}</div>
                                    <div style={{ fontSize: 12, color: navActiveColor, fontWeight: 600, marginTop: 2 }}>{item.pts}</div>
                                </div>
                                <span style={{ fontSize: 14, color: navActiveColor }}>›</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* OVERLAY — Reward notification */}
                {previewScene === "notification-reward" && isOverlay && (
                    <>
                        <div style={{ opacity: 0.28, pointerEvents: "none" }}>
                            {[{ icon: "🛍️", label: lbl("homeCardBrowse") }, { icon: "⚡", label: lbl("homeCardEarn") }].map((item) => (
                                <div key={item.label} style={{ background: headerBg, borderRadius: cardRadius, padding: "10px 12px", marginBottom: 7, display: "flex", alignItems: "center", gap: 10 }}>
                                    <span>{item.icon}</span><span style={{ fontSize: 12, color: homeNavColor }}>{item.label}</span>
                                </div>
                            ))}
                        </div>
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: `linear-gradient(135deg, ${notifyBgFrom} 0%, ${notifyBgTo} 100%)`, borderRadius: `0 0 ${radius} ${radius}`, padding: "16px 14px 20px" }}>
                            <div style={{ position: "absolute", top: 10, right: 10, width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: notifyColor, fontWeight: 700 }}>✕</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: notifyColor, marginBottom: 10 }}>{lbl("notifyRewardHeading")}</div>
                            <div style={{ display: "flex", gap: 8 }}>
                                <div style={{ flex: 1, background: notifyRewardCodeBg, borderRadius: cardRadius, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <span style={{ fontSize: 13, fontWeight: 800, color: notifyColor, letterSpacing: "0.12em" }}>NBL_TWTFGQE</span>
                                </div>
                                <button style={{ background: notifyRewardBtnBg, border: `1px solid ${notifyRewardBtnBorder}`, borderRadius: cardRadius, padding: "10px 16px", fontSize: 13, fontWeight: 700, color: notifyRewardBtnColor, cursor: "pointer", flexShrink: 0 }}>{lbl("notifyRewardCopyBtn")}</button>
                            </div>
                        </div>
                    </>
                )}

                {/* OVERLAY — Info notification */}
                {previewScene === "notification-info" && isOverlay && (
                    <>
                        <div style={{ opacity: 0.28, pointerEvents: "none" }}>
                            {[{ icon: "👥", label: "Refer a Friend", sub: "100 pts" }, { icon: "🛒", label: "Direct Purchase", sub: "50 pts/$1" }].map((item, i) => (
                                <div key={i} style={{ background: rewardItemBg, border: `1px solid ${border}`, borderRadius: cardRadius, padding: "10px 12px", marginBottom: 7, display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{ fontSize: 18 }}>{item.icon}</span>
                                    <div><div style={{ fontSize: 12, fontWeight: 600, color: textColor }}>{item.label}</div><div style={{ fontSize: 11, color: textMuted }}>{item.sub}</div></div>
                                </div>
                            ))}
                        </div>
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: `linear-gradient(135deg, ${notifyBgFrom} 0%, ${notifyBgTo} 100%)`, borderRadius: `0 0 ${radius} ${radius}`, padding: "16px 14px 20px" }}>
                            <div style={{ position: "absolute", top: 10, right: 10, width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: notifyColor, fontWeight: 700 }}>✕</div>
                            <p style={{ fontSize: 13, color: notifyColor, lineHeight: 1.55, margin: "0 0 12px 0", paddingRight: 24 }}>Earn 100 points when your friend places their first subscription order. Your friend gets $10 off on their first order.</p>
                            <button style={{ background: notifyInfoBtnBg, border: `1px solid ${notifyInfoBtnBorder}`, borderRadius: btnRadius, padding: "9px 22px", fontSize: 13, fontWeight: 700, color: notifyInfoBtnColor, cursor: "pointer" }}>{lbl("notifyInfoClaimBtn")}</button>
                        </div>
                    </>
                )}

                {/* OVERLAY — Referral / Claim confirm */}
                {previewScene === "referral" && isOverlay && (
                    <>
                        <div style={{ opacity: 0.28, pointerEvents: "none" }}>
                            {[{ label: "Voucher $5", pts: "10 points" }, { label: "Voucher $30", pts: "300 points" }].map((item, i) => (
                                <div key={i} style={{ background: rewardItemBg, border: `1px solid ${border}`, borderRadius: cardRadius, padding: "10px 12px", marginBottom: 7, display: "flex", alignItems: "center", gap: 10 }}>
                                    <span style={{ fontSize: 20 }}>🎁</span>
                                    <div><div style={{ fontSize: 13, fontWeight: 700, color: textColor }}>{item.label}</div><div style={{ fontSize: 12, color: navActiveColor, fontWeight: 600 }}>{item.pts}</div></div>
                                </div>
                            ))}
                        </div>
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#0f172a", borderRadius: `0 0 ${radius} ${radius}`, padding: "16px 14px 20px" }}>
                            <div style={{ position: "absolute", top: 10, right: 10, width: 24, height: 24, borderRadius: "50%", background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", fontWeight: 700 }}>✕</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 12 }}>Spend 10 points for this reward?</div>
                            <button style={{ background: btnBg, border: "none", borderRadius: btnRadius, padding: "9px 22px", fontSize: 13, fontWeight: 700, color: btnColor, cursor: "pointer" }}>Claim</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );

    // ── Launcher button JSX (portalled to document.body) ─────────────────────
    const launcherButton = (
        <div
            onClick={() => setWidgetOpen((o) => !o)}
            style={{
                position: "fixed",
                bottom: 24,
                ...(isLeft ? { left: 24 } : { right: 24 }),
                display: "flex", alignItems: "center", gap: 10,
                background: launcherBg,
                borderRadius: 999,
                padding: "9px 18px 9px 9px",
                boxShadow: "0 8px 32px rgba(0,0,0,0.24), 0 2px 8px rgba(0,0,0,0.12)",
                zIndex: 9999999,
                cursor: "pointer",
                userSelect: "none",
                // Reset font — prevent Shopify admin font inheritance in portal
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                boxSizing: "border-box",
                // Pulse-ring when launcher section is active in the editor
                outline: previewScene === "launcher" ? `3px solid ${launcherBg}` : "none",
                outlineOffset: previewScene === "launcher" ? "4px" : "0",
                transition: "outline 0.15s, outline-offset 0.15s, transform 0.12s",
            }}
        >
            <div style={{
                width: 38, height: 38, borderRadius: "50%",
                background: "rgba(0,0,0,0.18)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, flexShrink: 0,
            }}>{launcherIcon}</div>
            <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: launcherColor, lineHeight: 1.2, whiteSpace: "nowrap" }}>{launcherTitle}</div>
                <div style={{ fontSize: 10, color: launcherColor, opacity: 0.8 }}>1,425 pts</div>
            </div>
        </div>
    );

    // ── Standalone Referral Modal preview — "Get Your Referral Discount" UI ──
    const modalPreview = (
        <div data-nbl-preview style={{
            position: "fixed",
            bottom: 95,
            ...(isLeft ? { left: 24 } : { right: 24 }),
            width: 390,
            borderRadius: "20px",
            background: modalBg,
            boxShadow: "0 24px 64px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.10)",
            zIndex: 9999998,
            overflow: "hidden",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            boxSizing: "border-box",
            animation: "nblWidgetIn 0.22s cubic-bezier(0.34,1.56,0.64,1) both",
            padding: "28px 24px 24px",
        }}>
            {/* Close × */}
            <div style={{ position: "absolute", top: 16, right: 18, width: 28, height: 28, borderRadius: "50%", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: modalMutedColor, cursor: "pointer", fontWeight: 300, lineHeight: 1 }}>×</div>

            {/* Brand badge */}
            <div style={{ marginBottom: 16 }}>
                <span style={{ background: modalBrandBg, color: modalBrandColor, fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 99 }}>NBL Loyalty</span>
            </div>

            {/* Title */}
            <div style={{ fontSize: 20, fontWeight: 800, color: modalTitleColor, marginBottom: 6, lineHeight: 1.25 }}>
                Get Your Referral Discount 🎁
            </div>
            <div style={{ fontSize: 13, color: modalTextColor, marginBottom: 22, lineHeight: 1.5 }}>
                Enter your referral code to unlock your discount.
            </div>

            {/* Code input */}
            <div style={{
                background: modalInputBg,
                border: `1.5px solid ${modalInputBorder}`,
                borderRadius: "12px",
                padding: "13px 16px",
                fontSize: 14,
                color: modalTitleColor,
                fontWeight: 500,
                marginBottom: 12,
                letterSpacing: "0.04em",
            }}>
                NBL_0IVCLVE
            </div>

            {/* CTA button */}
            <div style={{
                background: modalBtnBg,
                borderRadius: "12px",
                padding: "14px",
                textAlign: "center",
                fontSize: 14,
                fontWeight: 700,
                color: "#ffffff",
                cursor: "pointer",
                marginBottom: 14,
            }}>
                Request Discount Code
            </div>

            {/* Error state */}
            <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "#fef2f2",
                border: "1.5px solid #fecaca",
                borderRadius: "12px",
                padding: "11px 14px",
                fontSize: 13,
                color: "#dc2626",
                fontWeight: 500,
            }}>
                <span style={{ fontSize: 15 }}>❌</span>
                Invalid referral code. Please check the code and try again.
            </div>
        </div>
    );
    // The * selector is intentionally scoped via the data attribute to avoid
    // overriding Shopify admin styles globally.
    const keyframes = (
        <style>{`
            @keyframes nblWidgetIn {
                from { opacity: 0; transform: translateY(16px) scale(0.97); }
                to   { opacity: 1; transform: translateY(0)     scale(1);    }
            }
            /* Scoped font reset — prevents Shopify admin font bleeding into the portal */
            [data-nbl-preview] * {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                box-sizing: border-box;
            }
            [data-nbl-preview] button {
                font-family: inherit;
            }
        `}</style>
    );

    // ── Component render ──────────────────────────────────────────────────────
    // The component itself renders only a small status chip in the sidebar.
    // The real widget UI lives in a portal so it escapes the grid entirely.
    return (
        <>
            {/* Scene indicator chip — sits inline in the right column */}
            <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 12px",
                background: DS.bgCard,
                border: `1.5px solid ${DS.accentBorder}`,
                borderRadius: DS.r10,
            }}>
                <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 600, color: DS.textMuted }}>
                    {/* Live green dot */}
                    <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 0 2px #bbf7d0", flexShrink: 0 }} />
                    Live Preview
                </span>
                {/* Active scene label */}
                <span style={{
                    fontSize: 10, fontWeight: 700, color: DS.accentText,
                    background: DS.accentBg, border: `1px solid ${DS.accentBorder}`,
                    borderRadius: 99, padding: "2px 9px", letterSpacing: "0.04em", textTransform: "uppercase",
                }}>
                    {sceneLabels[previewScene] ?? "Home tab"}
                </span>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: DS.textHint, textAlign: "center" }}>
                Launcher (bottom-right) · click to open/close
            </div>

            {/* Portal: widget popup + launcher button rendered into document.body */}
            {isMounted && createPortal(
                <>
                    {keyframes}
                    {previewScene === "modal" ? (
                        // Referral Modal scene — show only the modal, no launcher/widget
                        modalPreview
                    ) : (
                        <>
                            {launcherButton}
                            {widgetPopup}
                        </>
                    )}
                </>,
                document.body
            )}
        </>
    );
});


// ─────────────────────────────────────────────────────────────────────────────
// SIMPLE MODE FIELD COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function FieldWrapper({ isDirty, children, onRevert, disabled }) {
    return (
        <div style={{
            background: isDirty ? DS.warnBg : DS.bgCard,
            border: `1.5px solid ${isDirty ? DS.warnBorder : DS.borderLight}`,
            borderRadius: DS.r12,
            padding: `${DS.sp14} ${DS.sp16}`,
            transition: "all 0.18s",
        }}>
            {children}
            {isDirty && (
                <div style={{ marginTop: DS.sp10, display: "flex", justifyContent: "flex-end" }}>
                    <button
                        disabled={disabled}
                        onClick={onRevert}
                        style={{
                            background: "none", border: `1px solid ${DS.warnBorder}`, borderRadius: DS.r6,
                            padding: "3px 10px", fontSize: 11, color: DS.warnText,
                            cursor: disabled ? "default" : "pointer", fontWeight: 500,
                            display: "flex", alignItems: "center", gap: 4,
                        }}
                    >↩ Revert to default</button>
                </div>
            )}
        </div>
    );
}

function FieldLabel({ label, hint, isDirty }) {
    return (
        <div style={{ marginBottom: DS.sp10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: DS.sp8, marginBottom: DS.sp2 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: DS.text }}>{label}</span>
                {isDirty && (
                    <span style={{
                        background: "#fef3c7", color: "#92400e",
                        fontSize: 10, fontWeight: 600, padding: "1px 7px",
                        borderRadius: DS.r99, border: "1px solid #fde68a",
                    }}>Modified</span>
                )}
            </div>
            {hint && <p style={{ fontSize: 12, color: DS.textMuted, margin: 0, lineHeight: 1.4 }}>{hint}</p>}
        </div>
    );
}

function SimpleColorField({ field, cssVars, onChange, disabled }) {
    const rawValue = cssVars[field.maps[0]] ?? field.default;
    const displayHex = isHex(rawValue) ? rawValue : (field.resolvedDefault ?? "#cccccc");
    const isDirty = field.maps.some((v) => cssVars[v] !== CSS_DEFAULTS[v]);

    function handleChange(hex) {
        const updates = {};
        field.maps.forEach((varName) => { updates[varName] = hex; });
        onChange(updates);
    }
    function handleRevert() {
        const updates = {};
        field.maps.forEach((varName) => { updates[varName] = CSS_DEFAULTS[varName]; });
        onChange(updates);
    }

    return (
        <FieldWrapper isDirty={isDirty} onRevert={handleRevert} disabled={disabled}>
            <FieldLabel label={field.label} hint={field.hint} isDirty={isDirty} />
            <div style={{ display: "flex", alignItems: "center", gap: DS.sp12 }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: DS.r10,
                        border: `2px solid ${isDirty ? DS.warnBorder : DS.borderMid}`,
                        background: displayHex, overflow: "hidden",
                        cursor: disabled ? "default" : "pointer",
                        boxShadow: `0 2px 8px ${displayHex}55`,
                    }}>
                        {!disabled && (
                            <input
                                type="color"
                                value={displayHex}
                                onChange={(e) => handleChange(e.target.value)}
                                style={{ opacity: 0, position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "pointer", border: "none", padding: 0 }}
                            />
                        )}
                    </div>
                </div>
                <div style={{ flex: 1 }}>
                    <s-text-field
                        value={isHex(rawValue) ? rawValue : displayHex}
                        onInput={(e) => { if (isHex(e.target.value)) handleChange(e.target.value); }}
                        disabled={disabled}
                        auto-complete="off"
                        placeholder="#000000"
                        style={{ fontFamily: "monospace", maxWidth: 140 }}
                    />
                    {/* When the stored value is a CSS var() ref, tell the user what it resolved to */}
                    {!isHex(rawValue) && rawValue && rawValue.startsWith("var(") && (
                        <div style={{ fontSize: 10, color: DS.textHint, marginTop: 4 }}>
                            Using theme default ({displayHex}). Pick a color to override.
                        </div>
                    )}
                </div>
            </div>
        </FieldWrapper>
    );
}

function SimpleRangeField({ field, cssVars, onChange, disabled }) {
    const rawValue = cssVars[field.maps[0]] ?? field.default;
    const numValue = field.displayValue ? field.displayValue(rawValue) : parseInt(rawValue);
    const isDirty = field.maps.some((v) => cssVars[v] !== CSS_DEFAULTS[v]);

    function handleChange(num) {
        const cssVal = field.parseValue ? field.parseValue(num) : `${num}px`;
        const updates = {};
        field.maps.forEach((varName) => { updates[varName] = cssVal; });
        onChange(updates);
    }
    function handleRevert() {
        const updates = {};
        field.maps.forEach((varName) => { updates[varName] = CSS_DEFAULTS[varName]; });
        onChange(updates);
    }

    const safeNum = isNaN(numValue) ? field.min : numValue;

    return (
        <FieldWrapper isDirty={isDirty} onRevert={handleRevert} disabled={disabled}>
            <FieldLabel label={field.label} hint={field.hint} isDirty={isDirty} />
            <div style={{ display: "flex", alignItems: "center", gap: DS.sp12 }}>
                <div style={{ flex: 1 }}>
                    <input
                        type="range" min={field.min} max={field.max} step={1} value={safeNum}
                        disabled={disabled}
                        onChange={(e) => handleChange(parseInt(e.target.value))}
                        style={{ width: "100%", accentColor: "#6d28d9", height: 4 }}
                    />
                </div>
                <div style={{
                    minWidth: 52, textAlign: "center",
                    background: DS.accentBg, borderRadius: DS.r8,
                    padding: "4px 10px", fontSize: 13, fontWeight: 700, color: DS.accentText,
                    border: `1px solid ${DS.accentBorder}`,
                }}>
                    {safeNum}{field.unit}
                </div>
            </div>
        </FieldWrapper>
    );
}

function SimpleTextField({ field, cssVars, onChange, disabled }) {
    const rawValue = cssVars[field.maps[0]] ?? field.default;
    const display = field.displayValue ? field.displayValue(rawValue) : rawValue;
    const isDirty = field.maps.some((v) => cssVars[v] !== CSS_DEFAULTS[v]);

    function handleChange(val) {
        const cssVal = field.parseValue ? field.parseValue(val) : val;
        const updates = {};
        field.maps.forEach((varName) => { updates[varName] = cssVal; });
        onChange(updates);
    }
    function handleRevert() {
        const updates = {};
        field.maps.forEach((varName) => { updates[varName] = CSS_DEFAULTS[varName]; });
        onChange(updates);
    }

    return (
        <FieldWrapper isDirty={isDirty} onRevert={handleRevert} disabled={disabled}>
            <FieldLabel label={field.label} hint={field.hint} isDirty={isDirty} />
            <s-text-field
                value={display}
                onInput={(e) => handleChange(e.target.value)}
                disabled={disabled}
                auto-complete="off"
            />
        </FieldWrapper>
    );
}

function SimpleEmojiField({ field, cssVars, onChange, disabled }) {
    const rawValue = cssVars[field.maps[0]] ?? field.default;
    const current = field.displayValue ? field.displayValue(rawValue) : rawValue;
    const isDirty = field.maps.some((v) => cssVars[v] !== CSS_DEFAULTS[v]);

    function handlePick(emoji) {
        const cssVal = field.parseValue ? field.parseValue(emoji) : emoji;
        const updates = {};
        field.maps.forEach((varName) => { updates[varName] = cssVal; });
        onChange(updates);
    }
    function handleRevert() {
        const updates = {};
        field.maps.forEach((varName) => { updates[varName] = CSS_DEFAULTS[varName]; });
        onChange(updates);
    }

    return (
        <FieldWrapper isDirty={isDirty} onRevert={handleRevert} disabled={disabled}>
            <FieldLabel label={field.label} hint={field.hint} isDirty={isDirty} />
            <div style={{ display: "flex", gap: DS.sp8, flexWrap: "wrap" }}>
                {field.options.map((emoji) => (
                    <button
                        key={emoji}
                        disabled={disabled}
                        onClick={() => handlePick(emoji)}
                        style={{
                            fontSize: 22, width: 46, height: 46,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            borderRadius: DS.r10,
                            border: current === emoji ? "2.5px solid #7c3aed" : `1.5px solid ${DS.borderLight}`,
                            background: current === emoji ? "#f5f3ff" : DS.bgCard,
                            cursor: disabled ? "default" : "pointer",
                            transform: current === emoji ? "scale(1.08)" : "scale(1)",
                        }}
                    >{emoji}</button>
                ))}
            </div>
        </FieldWrapper>
    );
}


function SimpleSelectField({ field, cssVars, onChange, disabled }) {
    const rawValue = cssVars[field.maps[0]] ?? field.default;
    const isDirty = field.maps.some((v) => cssVars[v] !== CSS_DEFAULTS[v]);

    function handleChange(val) {
        const updates = {};
        field.maps.forEach((varName) => { updates[varName] = val; });
        onChange(updates);
    }
    function handleRevert() {
        const updates = {};
        field.maps.forEach((varName) => { updates[varName] = CSS_DEFAULTS[varName]; });
        onChange(updates);
    }

    return (
        <FieldWrapper isDirty={isDirty} onRevert={handleRevert} disabled={disabled}>
            <FieldLabel label={field.label} hint={field.hint} isDirty={isDirty} />
            <div style={{ display: "flex", gap: DS.sp8 }}>
                {field.options.map((opt) => {
                    const isActive = rawValue === opt.value;
                    return (
                        <button
                            key={opt.value}
                            disabled={disabled}
                            onClick={() => handleChange(opt.value)}
                            style={{
                                flex: 1, padding: "9px 16px", fontSize: 13, fontWeight: isActive ? 700 : 500,
                                borderRadius: DS.r10,
                                border: `2px solid ${isActive ? "#7c3aed" : DS.borderLight}`,
                                background: isActive ? "#f5f3ff" : DS.bgCard,
                                color: isActive ? "#5b21b6" : DS.textSub,
                                cursor: disabled ? "default" : "pointer",
                                transition: "all 0.15s",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: DS.sp6,
                            }}
                        >
                            <span style={{
                                width: 14, height: 14, borderRadius: "50%", flexShrink: 0,
                                border: `2px solid ${isActive ? "#7c3aed" : DS.borderMid}`,
                                background: isActive ? "#7c3aed" : "transparent",
                                display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                                {isActive && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff" }} />}
                            </span>
                            {opt.label}
                        </button>
                    );
                })}
            </div>
        </FieldWrapper>
    );
}

function SimpleSectionPanel({ section, cssVars, onChange, disabled, notificationPreviewType, onNotificationPreviewChange }) {
    return (
        <div>
            <div style={{ marginBottom: DS.sp20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: DS.sp10, marginBottom: DS.sp6 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: DS.r10,
                        background: DS.accentBg, border: `1px solid ${DS.accentBorder}`,
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                    }}>{section.icon}</div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 17, fontWeight: 700, color: DS.text, lineHeight: 1.2 }}>{section.label}</div>
                        <div style={{ fontSize: 12, color: DS.textMuted, marginTop: 1 }}>{section.description}</div>
                    </div>
                </div>
                {/* Notification preview toggle — shown below header when in Notifications section */}
                {section.key === "notifications" && onNotificationPreviewChange && (
                    <div style={{ display: "flex", alignItems: "center", gap: DS.sp8, marginTop: DS.sp10 }}>
                        <span style={{ fontSize: 12, color: DS.textMuted, fontWeight: 500 }}>Preview:</span>
                        <div style={{ display: "flex", background: "#ede9fe", borderRadius: DS.r8, padding: 3, gap: 2 }}>
                            {[["reward", "🟢 Reward"], ["info", "⚫ Info"]].map(([val, lbl]) => (
                                <button
                                    key={val}
                                    onClick={() => onNotificationPreviewChange(val)}
                                    style={{
                                        padding: "5px 14px", borderRadius: DS.r6, border: "none", fontSize: 12,
                                        background: notificationPreviewType === val ? "#ffffff" : "transparent",
                                        color: notificationPreviewType === val ? DS.text : DS.textMuted,
                                        fontWeight: notificationPreviewType === val ? 600 : 400,
                                        cursor: "pointer",
                                        boxShadow: notificationPreviewType === val ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                                        whiteSpace: "nowrap",
                                    }}
                                >{lbl}</button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: DS.sp10 }}>
                {section.fields
                    .filter((field) => {
                        if (section.key !== "notifications") return true;
                        const commonKeys = ["notifyBgFrom", "notifyBgTo", "notifyColor"];
                        if (commonKeys.includes(field.key)) return true;
                        if (notificationPreviewType === "reward") return field.key.startsWith("notifyReward");
                        if (notificationPreviewType === "info") return field.key.startsWith("notifyInfo");
                        return true;
                    })
                    .map((field) => {
                        if (field.type === "color") return <SimpleColorField key={field.key} field={field} cssVars={cssVars} onChange={onChange} disabled={disabled} />;
                        if (field.type === "range") return <SimpleRangeField key={field.key} field={field} cssVars={cssVars} onChange={onChange} disabled={disabled} />;
                        if (field.type === "emoji") return <SimpleEmojiField key={field.key} field={field} cssVars={cssVars} onChange={onChange} disabled={disabled} />;
                        if (field.type === "select") return <SimpleSelectField key={field.key} field={field} cssVars={cssVars} onChange={onChange} disabled={disabled} />;
                        return <SimpleTextField key={field.key} field={field} cssVars={cssVars} onChange={onChange} disabled={disabled} />;
                    })}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR NAV ITEM
// ─────────────────────────────────────────────────────────────────────────────

function SidebarNavItem({ label, icon, isActive, badge, onClick, disabled }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                width: "100%",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: `${DS.sp8} ${DS.sp12}`, borderRadius: DS.r10,
                border: isActive ? `1.5px solid ${DS.accentBorder}` : "1.5px solid transparent",
                background: isActive ? DS.accentBg : "transparent",
                cursor: disabled ? "default" : "pointer", textAlign: "left", transition: "all 0.15s",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: DS.sp8 }}>
                <span style={{ fontSize: 15 }}>{icon}</span>
                <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? DS.accentText : DS.textSub }}>{label}</span>
            </div>
            {badge > 0 && (
                <span style={{
                    background: isActive ? DS.accentText : "#f59e0b", color: "#fff",
                    fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: DS.r99, minWidth: 18, textAlign: "center",
                }}>{badge}</span>
            )}
        </button>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRESET CARD — compact card in the sidebar
// ─────────────────────────────────────────────────────────────────────────────

function PresetCard({ preset, isActive, onApply, disabled }) {

    return (
        <div style={{
            background: isActive ? DS.accentBg : DS.bgCard,
            border: `2px solid ${isActive ? "#7c3aed" : DS.borderLight}`,
            borderRadius: DS.r12,
            overflow: "hidden",
            transition: "all 0.18s",
            boxShadow: isActive ? "0 0 0 3px #ede9fe" : "none",
        }}>
            {/* Card header / apply row */}
            <div style={{
                padding: `${DS.sp10} ${DS.sp12}`,
                display: "flex", alignItems: "center", gap: DS.sp8,
                cursor: disabled ? "default" : "pointer",
            }}
                onClick={() => !disabled && onApply(preset)}
            >
                {isActive && (
                    <div style={{
                        width: 18, height: 18, borderRadius: "50%",
                        background: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, color: "#fff", fontWeight: 700, flexShrink: 0,
                        boxShadow: "0 0 0 2px #fff, 0 0 0 4px #7c3aed",
                    }}>✓</div>
                )}
                {!isActive && (
                    <div style={{
                        width: 18, height: 18, borderRadius: "50%",
                        border: `2px solid ${DS.borderMid}`,
                        flexShrink: 0,
                    }} />
                )}
                <span style={{ fontSize: 16 }}>{preset.emoji}</span>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? "#5b21b6" : DS.text }}>{preset.label}</div>
                    <div style={{ fontSize: 10, color: isActive ? "#7c3aed" : DS.textHint }}>{preset.tagline}</div>
                </div>
                {/* swatches */}
                <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                    {preset.swatches.map((color, i) => (
                        <div key={i} style={{
                            width: 12, height: 12, borderRadius: "50%", background: color,
                            border: "1px solid rgba(0,0,0,0.1)",
                        }} />
                    ))}
                </div>
            </div>

        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// WIDGET CONFIG COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function ConfigToggleField({ field, widgetConfig, onChange, disabled }) {
    const value = widgetConfig[field.configKey] ?? field.default;
    const isDirty = value !== WIDGET_CONFIG_DEFAULTS[field.configKey];

    function handleRevert() { onChange(field.configKey, WIDGET_CONFIG_DEFAULTS[field.configKey]); }

    return (
        <FieldWrapper isDirty={isDirty} onRevert={handleRevert} disabled={disabled}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <FieldLabel label={field.label} hint={field.hint} isDirty={isDirty} />
                <button
                    disabled={disabled}
                    onClick={() => onChange(field.configKey, !value)}
                    style={{
                        flexShrink: 0, width: 44, height: 24, borderRadius: DS.r99,
                        background: value ? "#7c3aed" : DS.borderMid,
                        border: "none", cursor: disabled ? "default" : "pointer",
                        position: "relative", transition: "background 0.2s", marginLeft: DS.sp12,
                    }}
                >
                    <span style={{
                        position: "absolute", top: 3, left: value ? 22 : 2,
                        width: 18, height: 18, borderRadius: "50%", background: "#fff",
                        transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
                    }} />
                </button>
            </div>
        </FieldWrapper>
    );
}

function ConfigSelectField({ field, widgetConfig, onChange, disabled }) {
    const value = widgetConfig[field.configKey] ?? field.default;
    const isDirty = value !== WIDGET_CONFIG_DEFAULTS[field.configKey];

    function handleRevert() { onChange(field.configKey, WIDGET_CONFIG_DEFAULTS[field.configKey]); }

    return (
        <FieldWrapper isDirty={isDirty} onRevert={handleRevert} disabled={disabled}>
            <FieldLabel label={field.label} hint={field.hint} isDirty={isDirty} />
            <div style={{ display: "flex", gap: DS.sp6, flexWrap: "wrap" }}>
                {field.options.map((opt) => {
                    const isActive = value === opt.value;
                    return (
                        <button
                            key={opt.value}
                            disabled={disabled}
                            onClick={() => onChange(field.configKey, opt.value)}
                            style={{
                                padding: "7px 14px", fontSize: 12, fontWeight: isActive ? 700 : 500,
                                borderRadius: DS.r10,
                                border: `2px solid ${isActive ? "#7c3aed" : DS.borderLight}`,
                                background: isActive ? "#f5f3ff" : DS.bgCard,
                                color: isActive ? "#5b21b6" : DS.textSub,
                                cursor: disabled ? "default" : "pointer",
                                transition: "all 0.15s",
                            }}
                        >{opt.label}</button>
                    );
                })}
            </div>
        </FieldWrapper>
    );
}

function ConfigRangeField({ field, widgetConfig, onChange, disabled }) {
    const raw = widgetConfig[field.configKey] ?? field.default;
    const display = field.displayValue ? field.displayValue(raw) : Number(raw);
    const isDirty = raw !== WIDGET_CONFIG_DEFAULTS[field.configKey];

    function handleChange(v) {
        onChange(field.configKey, field.parseValue ? field.parseValue(v) : v);
    }
    function handleRevert() { onChange(field.configKey, WIDGET_CONFIG_DEFAULTS[field.configKey]); }

    const safeNum = isNaN(display) ? field.min : display;

    return (
        <FieldWrapper isDirty={isDirty} onRevert={handleRevert} disabled={disabled}>
            <FieldLabel label={field.label} hint={field.hint} isDirty={isDirty} />
            <div style={{ display: "flex", alignItems: "center", gap: DS.sp12 }}>
                <div style={{ flex: 1 }}>
                    <input
                        type="range" min={field.min} max={field.max} step={1} value={safeNum}
                        disabled={disabled}
                        onChange={(e) => handleChange(parseInt(e.target.value))}
                        style={{ width: "100%", accentColor: "#6d28d9", height: 4 }}
                    />
                </div>
                <div style={{
                    minWidth: 52, textAlign: "center",
                    background: DS.accentBg, borderRadius: DS.r8,
                    padding: "4px 10px", fontSize: 13, fontWeight: 700, color: DS.accentText,
                    border: `1px solid ${DS.accentBorder}`,
                }}>
                    {safeNum}{field.unit}
                </div>
            </div>
        </FieldWrapper>
    );
}

function ConfigLabelField({ field, widgetConfig, onChange, disabled }) {
    const labelKey = field.configKey.startsWith("labels.") ? field.configKey.slice(7) : field.configKey;
    const value = (widgetConfig.labels?.[labelKey]) ?? field.default;
    const isDirty = value !== field.default;

    function handleRevert() { onChange(field.configKey, field.default); }

    return (
        <FieldWrapper isDirty={isDirty} onRevert={handleRevert} disabled={disabled}>
            <FieldLabel label={field.label} hint={field.hint} isDirty={isDirty} />
            <s-text-field
                value={value}
                onInput={(e) => onChange(field.configKey, e.target.value)}
                disabled={disabled}
                auto-complete="off"
                placeholder={field.default}
            />
        </FieldWrapper>
    );
}

function ConfigSectionPanel({ section, widgetConfig, onChange, disabled }) {
    return (
        <div>
            <div style={{ marginBottom: DS.sp20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: DS.sp10, marginBottom: DS.sp6 }}>
                    <div style={{
                        width: 36, height: 36, borderRadius: DS.r10,
                        background: DS.accentBg, border: `1px solid ${DS.accentBorder}`,
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                    }}>{section.icon}</div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 17, fontWeight: 700, color: DS.text, lineHeight: 1.2 }}>{section.label}</div>
                        <div style={{ fontSize: 12, color: DS.textMuted, marginTop: 1 }}>{section.description}</div>
                    </div>
                </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: DS.sp10 }}>
                {section.fields.map((field) => {
                    if (field.type === "toggle") return <ConfigToggleField key={field.key} field={field} widgetConfig={widgetConfig} onChange={onChange} disabled={disabled} />;
                    if (field.type === "select") return <ConfigSelectField key={field.key} field={field} widgetConfig={widgetConfig} onChange={onChange} disabled={disabled} />;
                    if (field.type === "range") return <ConfigRangeField key={field.key} field={field} widgetConfig={widgetConfig} onChange={onChange} disabled={disabled} />;
                    if (field.type === "label") return <ConfigLabelField key={field.key} field={field} widgetConfig={widgetConfig} onChange={onChange} disabled={disabled} />;
                    return null;
                })}
            </div>
        </div>
    );
}

// PAGE
// ─────────────────────────────────────────────────────────────────────────────


export default function CustomizeNew() {
    const { savedCssVars, savedPresetKey, savedWidgetConfig } = useLoaderData();
    const actionData = useActionData();
    const submit = useSubmit();
    const navigation = useNavigation();

    const isSubmitting = navigation.state === "submitting";
    const initialVars = useMemo(() => buildInitialVars(savedCssVars), []);

    const [cssVars, setCssVars] = useState(() => deepClone(initialVars));
    const [persistedVars, setPersistedVars] = useState(() => deepClone(initialVars));
    const [hasSavedCustomStyles, setHasSavedCustomStyles] = useState(savedCssVars !== null);
    const [activeSimpleSection, setActiveSimpleSection] = useState(SIMPLE_SECTIONS[0].key);
    const [activePreset, setActivePreset] = useState(savedPresetKey ?? null);
    const [activeIntent, setActiveIntent] = useState(null);
    const [notificationPreviewType, setNotificationPreviewType] = useState("reward"); // "reward" | "info"

    // ── Widget Config state ───────────────────────────────────────────────────
    const [widgetConfig, setWidgetConfig] = useState(() => buildInitialWidgetConfig(savedWidgetConfig));
    const [persistedWidgetConfig, setPersistedWidgetConfig] = useState(() => buildInitialWidgetConfig(savedWidgetConfig));
    const [activeConfigSection, setActiveConfigSection] = useState(WIDGET_CONFIG_SECTIONS[0].key);
    const [pageTab, setPageTab] = useState("customize"); // "customize" | "config" | "labels"

    useEffect(() => {
        if (!actionData) return;
        shopify.toast.show(actionData.message, { isError: !actionData.ok });
        setActiveIntent(null);
        if (!actionData.ok) return;
        if (["update", "resetAll"].includes(actionData.intent)) {
            const fresh = buildInitialVars(actionData.savedCssVars);
            setCssVars(fresh);
            setPersistedVars(fresh);
            setHasSavedCustomStyles(true);
            setActivePreset(actionData.savedPresetKey ?? null);
            const freshWc = buildInitialWidgetConfig(actionData.savedWidgetConfig ?? null);
            setWidgetConfig(freshWc);
            setPersistedWidgetConfig(freshWc);
        }
        if (actionData.intent === "clearAll") {
            const fresh = deepClone(CSS_DEFAULTS);
            setCssVars(fresh);
            setPersistedVars(fresh);
            setHasSavedCustomStyles(false);
            setActivePreset(null);
            const freshWc = buildInitialWidgetConfig(null);
            setWidgetConfig(freshWc);
            setPersistedWidgetConfig(freshWc);
        }
    }, [actionData]);

    const hasConfigChanges = useMemo(() => JSON.stringify(widgetConfig) !== JSON.stringify(persistedWidgetConfig), [widgetConfig, persistedWidgetConfig]);
    const hasChanges = useMemo(() => !isEqual(cssVars, persistedVars) || hasConfigChanges, [cssVars, persistedVars, hasConfigChanges]);
    const isUpdating = isSubmitting && activeIntent === "update";
    const isFirstSave = !hasSavedCustomStyles && !hasChanges;

    // Deferred vars for the live preview — lets the sidebar stay snappy
    // while the preview re-renders slightly after (non-blocking)
    const deferredCssVars = useDeferredValue(cssVars);

    const simpleSectionDirtyCount = useCallback((section) => {
        return section.fields.filter((f) => f.maps.some((v) => cssVars[v] !== persistedVars[v])).length;
    }, [cssVars, persistedVars]);

    const handleSimpleChange = useCallback((updates) => {
        setCssVars((prev) => ({ ...prev, ...updates }));
        setActivePreset(null);
    }, []);

    const handleConfigChange = useCallback((key, value) => {
        if (key.startsWith("labels.")) {
            const labelKey = key.slice(7);
            setWidgetConfig((prev) => ({ ...prev, labels: { ...prev.labels, [labelKey]: value } }));
        } else {
            setWidgetConfig((prev) => ({ ...prev, [key]: value }));
        }
    }, []);

    const configSectionDirtyCount = useCallback((section) => {
        return section.fields.filter((f) => {
            if (f.configKey.startsWith("labels.")) {
                const labelKey = f.configKey.slice(7);
                const cur = widgetConfig.labels?.[labelKey];
                const def = LABEL_DEFAULTS[labelKey];
                return cur !== undefined && cur !== def;
            }
            const cur = widgetConfig[f.configKey];
            const def = WIDGET_CONFIG_DEFAULTS[f.configKey];
            return cur !== def && cur !== undefined;
        }).length;
    }, [widgetConfig]);

    function handlePresetApply(preset) {
        setCssVars((prev) => ({ ...prev, ...preset.vars }));
        setActivePreset(preset.key);
    }
    function handleDiscard() {
        setCssVars(deepClone(persistedVars));
        setActivePreset(savedPresetKey ?? null);
        setWidgetConfig({ ...persistedWidgetConfig });
    }
    function handleSave() {
        setActiveIntent("update");
        const fd = new FormData();
        fd.set("intent", "update");
        fd.set("cssVars", JSON.stringify(cssVars));
        if (activePreset) fd.set("presetKey", activePreset);

        fd.set("widgetConfig", JSON.stringify(widgetConfig));

        submit(fd, { method: "post" });
    }
    function handleResetAll() {
        setActiveIntent("resetAll");
        const fd = new FormData();
        fd.set("intent", "resetAll");
        submit(fd, { method: "post" });
    }
    function handleClearAll() {
        setActiveIntent("clearAll");
        const fd = new FormData();
        fd.set("intent", "clearAll");
        submit(fd, { method: "post" });
    }

    const activeSimpleSectionDef = SIMPLE_SECTIONS.find((s) => s.key === activeSimpleSection) ?? SIMPLE_SECTIONS[0];
    const totalDirty = useMemo(
        () => Object.keys(cssVars).filter((k) => cssVars[k] !== persistedVars[k]).length,
        [cssVars, persistedVars]
    );

    const filteredPresets = PRESETS;

    return (
        <s-page inlineSize="large">
            {/* ══ PAGE HEADER ══ */}
            <s-section>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: DS.sp10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: DS.sp10 }}>
                        <h1 style={{ fontSize: 22, fontWeight: 800, color: DS.text, margin: 0, letterSpacing: "-0.02em" }}>
                            Customize Widget
                        </h1>
                        {hasChanges && (
                            <span style={{ background: "#fffbeb", color: "#92400e", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: DS.r99, border: "1px solid #fde68a" }}>
                                ● Unsaved changes
                            </span>
                        )}
                        {isFirstSave && (
                            <span style={{ background: "#eff6ff", color: "#1e40af", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: DS.r99, border: "1px solid #bfdbfe" }}>
                                First setup
                            </span>
                        )}
                    </div>
                    <p style={{ fontSize: 13, color: DS.textMuted, margin: 0 }}>
                        Personalize your loyalty widget to match your store's brand. Changes show instantly in the preview.
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: DS.sp8 }}>
                        <s-button variant="plain" onClick={handleDiscard} disabled={!hasChanges || isSubmitting}>Discard</s-button>
                        <s-button variant="plain" tone="critical" onClick={handleResetAll} disabled={isSubmitting} loading={isSubmitting && activeIntent === "resetAll" ? true : undefined}>Reset all</s-button>
                        <s-button
                            variant="primary"
                            onClick={handleSave}
                            disabled={!hasChanges || isSubmitting}
                            loading={isUpdating ? true : undefined}
                        >
                            {hasChanges ? `Save changes${totalDirty > 0 ? ` (${totalDirty})` : ""}` : "Save changes"}
                        </s-button>
                    </div>
                </div>
            </s-section>

            {/* Banners */}
            {hasChanges && (
                <s-section>
                    <s-banner tone="warning" onDismiss={handleDiscard}>
                        <p>You have unsaved changes. Click <strong>Save changes</strong> to apply them to your widget.</p>
                    </s-banner>
                </s-section>
            )}
            {isFirstSave && (
                <s-section>
                    <s-banner tone="info">
                        <p>No custom styles saved yet. The widget is using default values. Edit any value below and save to apply your brand.</p>
                    </s-banner>
                </s-section>
            )}

            {/* ══ PAGE TAB SWITCHER ══ */}
            <s-section>
                <div style={{ display: "flex", gap: DS.sp4, background: DS.bg, borderRadius: DS.r10, padding: 4, width: "fit-content" }}>
                    {[{ key: "customize", label: "🎨 Customize" }, { key: "config", label: "⚙️ Widget Config" }, { key: "labels", label: "✏️ Labels & Text" }].map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setPageTab(tab.key)}
                            style={{
                                padding: "7px 18px", fontSize: 13, fontWeight: pageTab === tab.key ? 700 : 500,
                                borderRadius: DS.r8, border: "none",
                                background: pageTab === tab.key ? DS.bgCard : "transparent",
                                color: pageTab === tab.key ? DS.text : DS.textMuted,
                                cursor: "pointer",
                                boxShadow: pageTab === tab.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                                transition: "all 0.15s",
                            }}
                        >{tab.label}</button>
                    ))}
                </div>
            </s-section>

            {/* ══ CUSTOMIZE ══ */}
            {pageTab === "customize" && <s-grid gridTemplateColumns="280px 1fr" gap="base">

                {/* LEFT SIDEBAR */}
                <div>
                    <div style={{ position: "sticky", top: 16 }}>
                        <s-section>
                            {/* ── Quick Themes ── */}
                            <div style={{ marginBottom: DS.sp14 }}>
                                <div style={{
                                    fontSize: 10, fontWeight: 700, color: DS.textHint,
                                    letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: DS.sp10,
                                }}>Quick Themes</div>
                                <div style={{ display: "flex", flexDirection: "column", gap: DS.sp6 }}>
                                    {filteredPresets.map((preset) => (
                                        <PresetCard
                                            key={preset.key}
                                            preset={preset}
                                            isActive={activePreset === preset.key}
                                            onApply={handlePresetApply}
                                            disabled={isSubmitting}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div style={{ borderTop: `1px solid ${DS.borderLight}`, margin: `${DS.sp14} 0` }} />

                            {/* ── Section Nav ── */}
                            <div style={{ marginBottom: DS.sp10 }}>
                                <div style={{
                                    fontSize: 10, fontWeight: 700, color: DS.textHint,
                                    letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: DS.sp8,
                                }}>Customize</div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    {SIMPLE_SECTIONS.map((section) => (
                                        <SidebarNavItem
                                            key={section.key}
                                            label={section.label}
                                            icon={section.icon}
                                            isActive={activeSimpleSection === section.key}
                                            badge={simpleSectionDirtyCount(section)}
                                            onClick={() => setActiveSimpleSection(section.key)}
                                            disabled={isSubmitting}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div style={{ borderTop: `1px solid ${DS.borderLight}`, marginTop: DS.sp14, paddingTop: DS.sp12 }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: DS.sp6 }}>
                                    <button
                                        disabled={isSubmitting}
                                        onClick={handleResetAll}
                                        style={{
                                            background: DS.dangerBg, border: `1px solid #fecaca`, borderRadius: DS.r8,
                                            padding: "7px 12px", fontSize: 12, color: DS.dangerText,
                                            cursor: isSubmitting ? "default" : "pointer", fontWeight: 500, width: "100%",
                                        }}
                                    >🔄 Reset all to defaults</button>
                                    <button
                                        disabled={isSubmitting}
                                        onClick={handleClearAll}
                                        style={{
                                            background: "none", border: `1px solid ${DS.borderLight}`, borderRadius: DS.r8,
                                            padding: "7px 12px", fontSize: 12, color: DS.textMuted,
                                            cursor: isSubmitting ? "default" : "pointer", fontWeight: 500, width: "100%",
                                        }}
                                    >Clear (use CSS file)</button>
                                </div>
                            </div>
                        </s-section>
                    </div>
                </div>

                {/* CENTER — section editor */}
                <s-section>
                    <SimpleSectionPanel
                        section={activeSimpleSectionDef}
                        cssVars={cssVars}
                        onChange={handleSimpleChange}
                        disabled={isSubmitting}
                        notificationPreviewType={notificationPreviewType}
                        onNotificationPreviewChange={setNotificationPreviewType}
                    />
                </s-section>

                {/* Scene-aware live preview indicator + portal widget */}
                <LivePreviewPanel
                    cssVars={deferredCssVars}
                    widgetConfig={widgetConfig}
                    previewScene={
                        activeSimpleSection === "notifications"
                            ? (notificationPreviewType === "reward" ? "notification-reward" : "notification-info")
                            : (SECTION_TO_SCENE[activeSimpleSection] ?? "home")
                    }
                />
            </s-grid>}

            {/* ══ WIDGET CONFIG ══ */}
            {pageTab === "config" && (
                <s-grid gridTemplateColumns="280px 1fr" gap="base">
                    {/* LEFT — config section nav */}
                    <div>
                        <div style={{ position: "sticky", top: 16 }}>
                            <s-section>
                                <div style={{ marginBottom: DS.sp8 }}>
                                    <div style={{
                                        fontSize: 10, fontWeight: 700, color: DS.textHint,
                                        letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: DS.sp8,
                                    }}>Config</div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                        {WIDGET_CONFIG_SECTIONS.filter((s) => s.key !== "labels").map((section) => (
                                            <SidebarNavItem
                                                key={section.key}
                                                label={section.label}
                                                icon={section.icon}
                                                isActive={activeConfigSection === section.key}
                                                badge={configSectionDirtyCount(section)}
                                                onClick={() => setActiveConfigSection(section.key)}
                                                disabled={isSubmitting}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div style={{ borderTop: `1px solid ${DS.borderLight}`, marginTop: DS.sp14, paddingTop: DS.sp12 }}>
                                    <button
                                        disabled={isSubmitting}
                                        onClick={() => setWidgetConfig({ ...WIDGET_CONFIG_DEFAULTS })}
                                        style={{
                                            background: DS.dangerBg, border: `1px solid #fecaca`, borderRadius: DS.r8,
                                            padding: "7px 12px", fontSize: 12, color: DS.dangerText,
                                            cursor: isSubmitting ? "default" : "pointer", fontWeight: 500, width: "100%",
                                        }}
                                    >🔄 Reset config to defaults</button>
                                </div>
                            </s-section>
                        </div>
                    </div>

                    {/* RIGHT — config section editor */}
                    <s-section>
                        <ConfigSectionPanel
                            section={WIDGET_CONFIG_SECTIONS.filter((s) => s.key !== "labels").find((s) => s.key === activeConfigSection) ?? WIDGET_CONFIG_SECTIONS.find((s) => s.key !== "labels")}
                            widgetConfig={widgetConfig}
                            onChange={handleConfigChange}
                            disabled={isSubmitting}
                        />
                    </s-section>
                </s-grid>
            )}

            {/* ══ LABELS & TEXT ══ */}
            {pageTab === "labels" && (() => {
                const labelsSection = WIDGET_CONFIG_SECTIONS.find((s) => s.key === "labels");
                return (
                    <s-grid gridTemplateColumns="1fr 1fr 340px" gap="base">
                        {/* Column 1 — first half of fields */}
                        <s-section>
                            <div style={{ display: "flex", flexDirection: "column", gap: DS.sp10 }}>
                                {labelsSection && labelsSection.fields.slice(0, Math.ceil(labelsSection.fields.length / 2)).map((field) => (
                                    <ConfigLabelField key={field.key} field={field} widgetConfig={widgetConfig} onChange={handleConfigChange} disabled={isSubmitting} />
                                ))}
                            </div>
                        </s-section>
                        {/* Column 2 — second half of fields */}
                        <s-section>
                            <div style={{ display: "flex", flexDirection: "column", gap: DS.sp10 }}>
                                {labelsSection && labelsSection.fields.slice(Math.ceil(labelsSection.fields.length / 2)).map((field) => (
                                    <ConfigLabelField key={field.key} field={field} widgetConfig={widgetConfig} onChange={handleConfigChange} disabled={isSubmitting} />
                                ))}
                            </div>
                        </s-section>
                        {/* Column 3 — live preview */}
                        <LivePreviewPanel
                            cssVars={deferredCssVars}
                            widgetConfig={widgetConfig}
                            previewScene="home"
                        />
                    </s-grid>
                );
            })()}

            {/* ══ STICKY BOTTOM ACTION BAR ══ */}
            <div style={{
                position: "sticky",
                bottom: 0,
                zIndex: 100,
                background: "#ffffff",
                borderTop: `1px solid ${DS.borderLight}`,
                boxShadow: "0 -4px 20px rgba(0,0,0,0.08)",
                padding: `${DS.sp12} ${DS.sp20}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: DS.sp12,
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: DS.sp10 }}>
                    {hasChanges ? (
                        <span style={{ fontSize: 13, color: DS.textMuted }}>
                            <span style={{ color: "#92400e", fontWeight: 600 }}>● </span>
                            {totalDirty} unsaved change{totalDirty !== 1 ? "s" : ""}
                        </span>
                    ) : (
                        <span style={{ fontSize: 13, color: DS.textHint }}>All changes saved</span>
                    )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: DS.sp8 }}>
                    <s-button variant="plain" onClick={handleDiscard} disabled={!hasChanges || isSubmitting}>Discard</s-button>
                    <s-button variant="plain" tone="critical" onClick={handleResetAll} disabled={isSubmitting} loading={isSubmitting && activeIntent === "resetAll" ? true : undefined}>Reset all</s-button>
                    <s-button
                        variant="primary"
                        onClick={handleSave}
                        disabled={!hasChanges || isSubmitting}
                        loading={isUpdating ? true : undefined}
                    >
                        {hasChanges ? `Save changes${totalDirty > 0 ? ` (${totalDirty})` : ""}` : "Save changes"}
                    </s-button>
                </div>
            </div>

        </s-page>
    );
}
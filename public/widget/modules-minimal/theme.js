// =============================================================================
// modules/theme.js
// Applies the 11 dashboard-controllable base colors as inline CSS variable
// overrides on <nbl-widget-container>. Every derived shade (glows, tints,
// borders) is calculated FROM these 11 values via color-mix() in ui_v3.css
// — this file never sets a derived variable directly.
//
// Dashboard contract (appConfig.styles.colors), all optional:
//   primaryBackground, secondaryBackground, surfaceBackground,
//   textPrimary, textSecondary, textMuted, textOnColor,
//   successBackground, dangerBackground, warningBackground, infoBackground
//
// This replaces the old ~50-variable legacy contract (header padding,
// points badge border, launcher icon size, modal colors, etc.) — those
// fine-grained per-component controls are gone; merchants now control the
// 11 base colors and every component derives its look from them.
// =============================================================================

import { getStore } from './store.js';

var KEY_TO_CSS_VAR = {
    primaryBackground: '--nbl-primary-background',
    secondaryBackground: '--nbl-secondary-background',
    surfaceBackground: '--nbl-surface-background',
    textPrimary: '--nbl-text-primary',
    textSecondary: '--nbl-text-secondary',
    textMuted: '--nbl-text-muted',
    textOnColor: '--nbl-text-on-color',
    successBackground: '--nbl-success-background',
    dangerBackground: '--nbl-danger-background',
    warningBackground: '--nbl-warning-background',
    infoBackground: '--nbl-info-background',
};

/**
 * Applies theme color overrides.
 * Call once at boot after buildHTML().
 * @fires theme:applied
 */
export function applyTheme() {
    var { loyaltyApp, appConfig } = getStore();
    var eventBus = loyaltyApp.bus;
    var styles = appConfig.styles || {};

    var container = document.querySelector('nbl-widget-container');
    if (!container) {
        // buildHTML() should always run before applyTheme(); if this fires,
        // something called applyTheme() too early.
        console.warn('applyTheme: nbl-widget-container not found in the DOM yet.');
        return;
    }

    var colors = styles.colors || {};
    Object.keys(KEY_TO_CSS_VAR).forEach(function (key) {
        var value = colors[key];
        if (value) container.style.setProperty(KEY_TO_CSS_VAR[key], value);
    });

    /**
     * @fires theme:applied { colors }
     * Sticky so any module that subscribes after this point (lazy-loaded
     * tabs) still receives it immediately on subscribe.
     */
    eventBus.emitSticky('theme:applied', { colors: colors });
}

/**
 * Sets a single base color override at runtime (e.g. a live theme-editor
 * preview in the dashboard). Mirrors NBLColors.setOverride() in the
 * reference architecture.
 */
export function setColorOverride(key, value) {
    var cssVar = KEY_TO_CSS_VAR[key];
    if (!cssVar) {
        console.warn('setColorOverride: unknown key "' + key + '", ignoring');
        return;
    }
    var container = document.querySelector('nbl-widget-container');
    if (!container) return;
    container.style.setProperty(cssVar, value);
}

/** Clears all inline color overrides, reverting to the CSS defaults (Ocean Breeze). */
export function resetColorOverrides() {
    var container = document.querySelector('nbl-widget-container');
    if (!container) return;
    Object.keys(KEY_TO_CSS_VAR).forEach(function (key) {
        container.style.removeProperty(KEY_TO_CSS_VAR[key]);
    });
}

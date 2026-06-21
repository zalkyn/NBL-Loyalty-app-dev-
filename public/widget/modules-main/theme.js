// =============================================================================
// modules/theme.js
// Applies CSS variables and header effect animations.
// Supports both new cssVars path and legacy object-based path.
// =============================================================================

import { getStore } from './store.js';
import { getConfig } from './config.js';

/**
 * Applies theme CSS variables and header effect.
 * Call once at boot after buildHTML().
 * @fires theme:applied
 */
export function applyTheme() {
    var { loyaltyApp, appConfig } = getStore();
    var eventBus = loyaltyApp.bus;
    var WIDGET_CONFIG = getConfig();

    var styles = appConfig.styles || {};
    var header = styles.header || {};
    var navigationStyles = header.Navigation || {};
    var points = header.Points || {};
    var heading = header.Heading || {};
    var actionButtonStyles = styles.actionButton || {};
    var tabHome = styles.tabHome || {};
    var tabHomeNav = tabHome.navigation || {};
    var tabRewards = styles.tabRewards || {};
    var tabActivity = styles.tabActivity || {};
    var tabEarnPoints = styles.tabEarnPoints || {};
    var tabReferral = styles.tabReferral || {};
    var launcherStyles = styles.launcher || {};
    var modalStyles = styles.modal || {};
    var headerColor = header['Color'] || '#ffffff';

    var root = document.documentElement;

    // ── NEW PATH: cssVars ─────────────────────────────────────────────────────
    // Dashboard এর "Customize Widget" page থেকে saved হয়।
    // এটা থাকলে সরাসরি :root এ apply করো এবং legacy path skip করো।
    var savedCssVars = styles.cssVars;
    if (savedCssVars && typeof savedCssVars === 'object' && Object.keys(savedCssVars).length > 0) {
        Object.keys(savedCssVars).forEach(function (prop) {
            if (prop.indexOf('--') === 0) {
                root.style.setProperty(prop, savedCssVars[prop]);
            }
        });

        (function syncPositionClass() {
            var savedPos = (savedCssVars['--nbl-launcher-position'] || '').toLowerCase();
            if (savedPos !== 'left' && savedPos !== 'right') return;
            var wrapper = document.querySelector('.nbl-wo-wrapper-v1');
            var container = document.querySelector('.nbl-widget-container-v1');
            [wrapper, container].forEach(function (el) {
                if (!el) return;
                el.classList.remove('pos-left', 'pos-right');
                el.classList.add('pos-' + savedPos);
            });
        })();

        // cssVars applied — এখন শুধু DOM text updates করো (icon, title, sub)
        // CSS variable দিয়ে handle হয় না এমন content-only updates:
        requestAnimationFrame(function () {
            var launcherBtn = document.querySelector('.nbl-widget-open-button-v1');
            if (launcherBtn) {
                var iconEl = launcherBtn.querySelector('.nbl-wob-icon-v1');
                var titleEl = launcherBtn.querySelector('.nbl-wob-title-v1');
                var subEl = launcherBtn.querySelector('.nbl-wob-sub-v1');
                if (iconEl && launcherStyles['Icon']) iconEl.textContent = launcherStyles['Icon'];
                if (titleEl && launcherStyles['Title']) titleEl.textContent = launcherStyles['Title'];
                if (subEl && launcherStyles['Sub']) subEl.textContent = launcherStyles['Sub'];
            }

            /** @fires theme:applied */
            eventBus.emitSticky('theme:applied', {
                styles: styles,
                headerColor: headerColor,
                actionButtonStyles: actionButtonStyles,
                tabHomeNav: tabHomeNav,
                launcherStyles: launcherStyles,
                modalStyles: modalStyles,
            });

        });

        return; // ← legacy cssVariables path skip
    }

    // ── LEGACY PATH: object-based config ─────────────────────────────────────
    // cssVars না থাকলে এই path চলে (backward compatibility)
    var cssVariables = {

        // ── Brand / Primary ───────────────────────────────────────────────────
        '--nbl-primary': header['Background Color'] || '#8b5cf6',
        '--nbl-accent': styles['Accent Color'] || actionButtonStyles['Background Color'] || '#4ecba8',

        // ── Header ────────────────────────────────────────────────────────────
        '--nbl-header-bg': header['Background Color'] || '#8b5cf6',
        '--nbl-header-color': headerColor,
        '--nbl-header-padding': header['Padding'] || '20px',
        // legacy names → new CSS var names (renamed in ui_v2.css)
        '--nbl-header-title-font-size': header['Font Size'] || '16px',
        '--nbl-header-title-font-weight': header['Font Weight'] || '700',

        // ── Points Badge ──────────────────────────────────────────────────────
        '--nbl-points-bg': points['Background Color'] || 'rgba(255,255,255,0.2)',
        '--nbl-points-color': points['Color'] || headerColor,
        '--nbl-points-border-color': points['Border Color'] || 'rgba(255,255,255,0.22)',
        '--nbl-points-border-radius': points['Border Radius'] || '99px',
        '--nbl-points-padding': points['Padding'] || '5px 12px',
        '--nbl-points-font-size': points['Font Size'] || '12px',

        // ── Navigation Bar ─────────────────────────────────────────────────────
        '--nbl-nav-bg': navigationStyles['Background Color'] || '#ffffff',
        '--nbl-nav-active-color': navigationStyles['Active Color'] || '#8b5cf6',
        '--nbl-nav-active-border': navigationStyles['Active Border Color'] || '#8b5cf6',
        // legacy names → new CSS var names
        '--nbl-nav-item-font-size': navigationStyles['Font Size'] || '12px',
        '--nbl-nav-item-font-weight': navigationStyles['Font Weight'] || '500',

        // ── Action Button ──────────────────────────────────────────────────────
        '--nbl-btn-bg': actionButtonStyles['Background Color'] || '#4ecba8',
        '--nbl-btn-color': actionButtonStyles['Color'] || '#ffffff',
        '--nbl-btn-border': actionButtonStyles['Border Color'] || '#4ecba8',
        '--nbl-btn-radius': actionButtonStyles['Border Radius'] || '10px',
        '--nbl-btn-font-size': actionButtonStyles['Font Size'] || '14px',
        '--nbl-btn-font-weight': actionButtonStyles['Font Weight'] || '600',
        '--nbl-btn-padding': actionButtonStyles['Padding'] || '10px 20px',

        // ── Launcher / Open Button ─────────────────────────────────────────────
        '--nbl-launcher-bg': launcherStyles['Background Color'] || actionButtonStyles['Background Color'] || '#4ecba8',
        '--nbl-launcher-color': launcherStyles['Color'] || actionButtonStyles['Color'] || '#ffffff',
        '--nbl-launcher-border-radius': launcherStyles['Border Radius'] || '999px',
        '--nbl-launcher-icon-size': launcherStyles['Icon Size'] || '20px',
        '--nbl-launcher-icon-bg': launcherStyles['Icon Background'] || 'rgba(0,0,0,0.18)',
        '--nbl-launcher-icon-circle': launcherStyles['Icon Circle Size'] || '44px',
        '--nbl-launcher-title-size': launcherStyles['Title Font Size'] || '13px',
        '--nbl-launcher-title-weight': launcherStyles['Title Font Weight'] || '700',
        '--nbl-launcher-sub-size': launcherStyles['Sub Font Size'] || '11px',
        '--nbl-launcher-sub-weight': launcherStyles['Sub Font Weight'] || '500',
        '--nbl-launcher-sub-opacity': launcherStyles['Sub Opacity'] || '0.82',
        '--nbl-launcher-shimmer-color': launcherStyles['Shimmer Color'] || 'rgba(255,255,255,0.28)',
        '--nbl-launcher-bottom': launcherStyles['Bottom Offset'] || '24px',

        // ── Referral Modal ─────────────────────────────────────────────────────
        '--nbl-modal-bg': modalStyles['Background Color'] || '#ffffff',
        '--nbl-modal-title-color': modalStyles['Title Color'] || '#111827',
        '--nbl-modal-subtitle-color': modalStyles['Subtitle Color'] || '#4b5563',
        '--nbl-modal-text-color': modalStyles['Text Color'] || '#374151',
        '--nbl-modal-brand-bg': modalStyles['Brand Background'] || '#ecfdf5',
        '--nbl-modal-brand-color': modalStyles['Brand Color'] || '#15803d',
        '--nbl-modal-input-bg': modalStyles['Input Background'] || '#f9fafb',
        '--nbl-modal-input-border': modalStyles['Input Border Color'] || '#e5e7eb',
        '--nbl-modal-input-focus': modalStyles['Input Focus Color'] || '#16a34a',
        '--nbl-modal-btn-primary-bg': modalStyles['Button Background'] || '#111827',
        '--nbl-modal-btn-primary-hover': modalStyles['Button Hover'] || '#1f2937',
        '--nbl-modal-code-bg': modalStyles['Code Background'] || '#f8fafc',
        '--nbl-modal-code-border': modalStyles['Code Border'] || '#d1d5db',
    };

    // Apply legacy variables to :root
    Object.keys(cssVariables).forEach(function (cssVar) { root.style.setProperty(cssVar, cssVariables[cssVar]); });

    requestAnimationFrame(function () {
        // Some style properties cannot be reliably set via CSS variables
        // (e.g. inline shorthand properties, vendor edge cases) so we
        // apply them directly to the affected elements after first paint.

        var badge = document.querySelector('.nbl-wh-points-v1');
        if (badge) {
            badge.style.background = points['Background Color'] || 'rgba(255,255,255,0.2)';
            badge.style.color = points['Color'] || headerColor;
            badge.style.borderColor = points['Border Color'] || 'rgba(255,255,255,0.22)';
            badge.style.borderWidth = points['Border Width'] || '0px';
            badge.style.borderStyle = points['Border Style'] || 'solid';
            badge.style.borderRadius = points['Border Radius'] || '15px';
            badge.style.padding = points['Padding'] || '4px 7px';
            badge.style.fontSize = points['Font Size'] || '12px';
        }

        document.querySelectorAll('.nbl-home-nav-itm-v1').forEach(function (el) {
            el.style.background = tabHomeNav['Background Color'] || '';
            el.style.color = tabHomeNav['Color'] || '';
            el.style.padding = tabHomeNav['Padding'] || '';
            el.style.fontSize = tabHomeNav['Font Size'] || '';
            el.style.fontWeight = tabHomeNav['Font Weight'] || '';
            el.style.marginBottom = tabHomeNav['Margin'] ? tabHomeNav['Margin'].split(' ')[2] || '' : '';
        });

        // nbl-notify-info-claim-btn-v1 is intentionally excluded here.
        // It is now styled by --nbl-notify-info-btn-* CSS vars so that
        // dashboard "Info button" fields control it directly.
        document.querySelectorAll('.nbl-reward-btn-v1.active, .nbl-widget-cta-v1, .nbl-refer-modal-btn-primary-v1').forEach(function (el) {
            el.style.background = actionButtonStyles['Background Color'] || '';
            el.style.color = actionButtonStyles['Color'] || '';
            el.style.borderRadius = actionButtonStyles['Border Radius'] || '';
            el.style.fontSize = actionButtonStyles['Font Size'] || '';
            el.style.fontWeight = actionButtonStyles['Font Weight'] || '';
            el.style.boxShadow = actionButtonStyles['Box Shadow'] || '';
        });

        // ── Launcher button DOM updates ────────────────────────────────────────
        // CSS variables handle colors/sizes; here we update text content
        // and dynamic icon from DB (styles.launcher).
        var launcherBtn = document.querySelector('.nbl-widget-open-button-v1');
        if (launcherBtn) {
            var iconEl = launcherBtn.querySelector('.nbl-wob-icon-v1');
            var titleEl = launcherBtn.querySelector('.nbl-wob-title-v1');
            var subEl = launcherBtn.querySelector('.nbl-wob-sub-v1');
            if (iconEl && launcherStyles['Icon']) iconEl.textContent = launcherStyles['Icon'];
            if (titleEl && launcherStyles['Title']) titleEl.textContent = launcherStyles['Title'];
            if (subEl && launcherStyles['Sub']) subEl.textContent = launcherStyles['Sub'];
        }

        // Broadcast theme:applied as a sticky event so any module that
        // subscribes after this point (e.g. lazy-loaded tabs) still
        // receives the computed style data immediately on subscribe.
        /** @fires theme:applied { styles, headerColor, actionButtonStyles, tabHomeNav, launcherStyles, modalStyles } */
        eventBus.emitSticky('theme:applied', {
            styles: styles,
            headerColor: headerColor,
            actionButtonStyles: actionButtonStyles,
            tabHomeNav: tabHomeNav,
            launcherStyles: launcherStyles,
            modalStyles: modalStyles,
        });

    });
}
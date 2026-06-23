// =============================================================================
// modules/widget.js
// DOM helpers, open/close/toggle, tab navigation, points display,
// compact header on scroll, tab-nav scroll arrows.
// Call initWidget() once at boot after buildHTML() and applyTheme().
// =============================================================================

import { getStore } from './store.js';
import { getPoints } from './config.js';
import { formatNumber } from './utils.js';

/**
 * Wires all widget chrome behaviour onto loyaltyApp.
 * Call once at boot after buildHTML() and applyTheme().
 */
export function initWidget() {
    var { loyaltyApp } = getStore();
    var eventBus = loyaltyApp.bus;

    // ── DOM HELPERS ────────────────────────────────────────────────────────────

    loyaltyApp.getTabItems = function () { return document.querySelectorAll('nbl-tab-item'); };
    loyaltyApp.getPanels = function () { return document.querySelectorAll('nbl-panel'); };
    loyaltyApp.getWidget = function () { return document.querySelector('nbl-widget'); };
    loyaltyApp.getPointsElements = function () { return document.querySelectorAll('nbl-points'); };

    /**
     * Finds the nearest ancestor (or self) matching a custom tag name —
     * used by click-router.js the same way the old getTargetElement()
     * matched a class, but against tag names now.
     */
    loyaltyApp.getTargetElement = function (target, tagName) {
        if (!target) return null;
        if (target.tagName && target.tagName.toLowerCase() === tagName) return target;
        return target.closest ? target.closest(tagName) : null;
    };

    // ── WIDGET OPEN / CLOSE ──────────────────────────────────────────────────

    loyaltyApp.openWidget = function () {
        var widget = loyaltyApp.getWidget(); if (!widget) return;
        widget.removeAttribute('hidden');
        requestAnimationFrame(function () {
            if (loyaltyApp.applyVisibleTabCount) loyaltyApp.applyVisibleTabCount();
            if (loyaltyApp.updateTabArrows) loyaltyApp.updateTabArrows();
        });
        /** @fires widget:opened — widget became visible */
        eventBus.emit('widget:opened');
    };

    loyaltyApp.closeWidget = function () {
        var widget = loyaltyApp.getWidget(); if (!widget) return;
        widget.setAttribute('hidden', '');
        /** @fires widget:closed — widget hidden */
        eventBus.emit('widget:closed');
    };

    loyaltyApp.toggleWidget = function () {
        var widget = loyaltyApp.getWidget(); if (!widget) return;
        if (widget.hasAttribute('hidden')) {
            loyaltyApp.openWidget();
        } else {
            loyaltyApp.closeWidget();
        }
    };

    // Reset to the Home tab every time the widget closes.
    /** @listens widget:closed — resets active tab to home on every close */
    eventBus.on('widget:closed', function () {
        loyaltyApp.setActiveNavigation('home');
    });

    // ── widget:first-open ────────────────────────────────────────────────────
    // Fires exactly once on the first open. All heavy modules subscribe here
    // instead of dom:loaded, so they never boot until the user actually opens
    // the widget for the first time.

    /**
     * @listens widget:opened (once)
     * @fires widget:first-open
     */
    eventBus.once('widget:opened', function () {
        eventBus.emit('widget:first-open');
    });

    // ── NAVIGATION ───────────────────────────────────────────────────────────
    // setActiveNavigation emits tab:activated so every tab module can
    // subscribe and lazy-render itself on first visit.

    loyaltyApp.setActiveNavigation = function (activeTab) {
        activeTab = activeTab || 'home';

        loyaltyApp.getTabItems().forEach(function (tabEl) {
            tabEl.toggleAttribute('active', tabEl.dataset.tab === activeTab);
        });
        loyaltyApp.getPanels().forEach(function (panelEl) {
            panelEl.toggleAttribute('active', panelEl.dataset.tab === activeTab);
        });

        var panelArea = document.querySelector('nbl-panel-area');
        if (panelArea) panelArea.scrollTop = 0;
        setHeaderCompact(false);

        var activeTabEl = document.querySelector('nbl-tab-item[data-tab="' + activeTab + '"]');
        if (activeTabEl) activeTabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

        /**
         * @fires tab:activated { tab }
         * Emitted every time a tab is selected, including programmatic calls.
         * All tab renders, first-visit guards, and chevron updates subscribe here.
         */
        eventBus.emit('tab:activated', { tab: activeTab });
    };

    // ── POINTS DISPLAY ───────────────────────────────────────────────────────

    loyaltyApp.uiRender = loyaltyApp.uiRender || {};

    loyaltyApp.uiRender.pointsUpdate = function () {
        var pointsElements = loyaltyApp.getPointsElements();
        if (!pointsElements || !pointsElements.length) return;
        var formatted = formatNumber(getPoints());
        pointsElements.forEach(function (el) {
            el.textContent = formatted;
            el.classList.remove('nbl-points-bump-v1');
            void el.offsetWidth;
            el.classList.add('nbl-points-bump-v1');
        });
    };

    /**
     * @listens dom:loaded — initial points display as soon as DOM is ready.
     */
    eventBus.on('dom:loaded', function () { loyaltyApp.uiRender.pointsUpdate(); });

    /**
     * @listens points:update { newPoints }
     * Updates loyaltyApp.points and refreshes every points display element.
     */
    eventBus.on('points:update', function (newPoints) {
        loyaltyApp.points = Number(newPoints) || 0;
        loyaltyApp.uiRender.pointsUpdate();
    });

    // ── COMPACT HEADER ON SCROLL ─────────────────────────────────────────────
    // Initialises on widget:first-open — no need to attach scroll listener
    // before the user has ever opened the widget.

    function setHeaderCompact(isCompact) {
        var header = document.querySelector('nbl-header');
        if (header) header.toggleAttribute('compact', isCompact);
    }
    loyaltyApp.setHeaderCompact = setHeaderCompact;

    /**
     * @listens widget:first-open
     * Attaches the scroll listener that collapses the header.
     */
    eventBus.on('widget:first-open', function () {
        var panelArea = document.querySelector('nbl-panel-area');
        if (!panelArea) return;

        var COMPACT_AT = 60;
        var EXPAND_AT = 15;
        var rafId = null;

        panelArea.addEventListener('scroll', function () {
            if (rafId) return;
            rafId = requestAnimationFrame(function () {
                rafId = null;
                var scrollTop = panelArea.scrollTop;
                var header = document.querySelector('nbl-header');
                if (!header) return;
                var isCompact = header.hasAttribute('compact');

                if (!isCompact && scrollTop > COMPACT_AT) {
                    setHeaderCompact(true);
                } else if (isCompact && scrollTop < EXPAND_AT) {
                    setHeaderCompact(false);
                }
            });
        }, { passive: true });
    });

    // ── TAB NAV: visible-tab width + scroll arrows ───────────────────────────
    // Initialises on widget:first-open.

    eventBus.on('widget:first-open', function () {
        var tabNav = document.querySelector('nbl-tab-nav');
        var tabList = document.querySelector('nbl-tab-list');
        var prevArrow = document.querySelector('nbl-tab-nav-arrow[direction="prev"]');
        var nextArrow = document.querySelector('nbl-tab-nav-arrow[direction="next"]');
        if (!tabNav || !tabList || !prevArrow || !nextArrow) return;

        function applyVisibleTabCount() {
            var count = parseInt(tabNav.getAttribute('visible-tabs'), 10) || 4;
            var prevW = prevArrow.getBoundingClientRect().width;
            var nextW = nextArrow.getBoundingClientRect().width;
            var navW = tabNav.getBoundingClientRect().width;
            if (navW === 0) return;

            var trackWidth = navW - prevW - nextW;
            var itemWidth = Math.floor(trackWidth / count);

            loyaltyApp.getTabItems().forEach(function (tabEl) {
                tabEl.style.flexBasis = itemWidth + 'px';
                tabEl.style.minWidth = itemWidth + 'px';
                tabEl.style.maxWidth = itemWidth + 'px';
            });
        }

        function updateTabArrows() {
            var maxScroll = tabList.scrollWidth - tabList.clientWidth;
            prevArrow.toggleAttribute('disabled', tabList.scrollLeft <= 2);
            nextArrow.toggleAttribute('disabled', tabList.scrollLeft >= maxScroll - 2);
        }

        loyaltyApp.applyVisibleTabCount = applyVisibleTabCount;
        loyaltyApp.updateTabArrows = updateTabArrows;

        prevArrow.addEventListener('click', function () {
            tabList.scrollBy({ left: -120, behavior: 'smooth' });
        });
        nextArrow.addEventListener('click', function () {
            tabList.scrollBy({ left: 120, behavior: 'smooth' });
        });

        tabList.addEventListener('scroll', updateTabArrows, { passive: true });
        window.addEventListener('resize', function () {
            updateTabArrows();
            applyVisibleTabCount();
        });

        /** @listens tab:activated — refreshes arrow state after every tab switch */
        eventBus.on('tab:activated', function () { updateTabArrows(); });

        applyVisibleTabCount();
        updateTabArrows();
    });
}

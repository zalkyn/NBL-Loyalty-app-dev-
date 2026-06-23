// =============================================================================
// modules/widget.js
// DOM helpers, open/close/toggle, navigation, points display,
// home accordion, compact header scroll, nav chevrons.
// Covers ui.v3.js Sections 3 → 8b.
// Call initWidget() once at boot after buildHTML().
// =============================================================================

import { getStore } from './store.js';
import { getPoints, lbl } from './config.js';
import { formatNumber } from './utils.js';

/**
 * Wires all widget UI behaviour onto loyaltyApp.
 * Call once at boot after buildHTML() and applyTheme().
 */
export function initWidget() {
    var { loyaltyApp } = getStore();
    var eventBus = loyaltyApp.bus;

    // ── SECTION 3: DOM HELPERS ────────────────────────────────────────────────

    loyaltyApp.getNavItems = function () { return document.querySelectorAll('.nbl-wh-nav-scroll-v1 .nbl-nav-item-v1, .nbl-wh-nav-wrapper-v1 > .nbl-nav-item-v1'); };
    loyaltyApp.getTabItems = function () { return document.querySelectorAll('.nbl-tab-item-v1'); };
    loyaltyApp.getWidgetContainer = function () { return document.querySelector('.nbl-widget-container-v1'); };
    loyaltyApp.getPointsElements = function () { return document.querySelectorAll('.nbl-customer-points-v1'); };

    loyaltyApp.getTargetElement = function (target, cls) {
        if (!target) return null;
        if (target.classList && target.classList.contains(cls)) return target;
        return target.closest ? target.closest('.' + cls) : null;
    };

    // ── SECTION 4: WIDGET OPEN / CLOSE ───────────────────────────────────────

    loyaltyApp.openWidget = function () {
        var widgetContainer = loyaltyApp.getWidgetContainer(); if (!widgetContainer) return;
        widgetContainer.classList.add('active');
        /** @fires widget:opened — widget became visible */
        eventBus.emit('widget:opened');
    };

    loyaltyApp.closeWidget = function () {
        var widgetContainer = loyaltyApp.getWidgetContainer(); if (!widgetContainer) return;
        widgetContainer.classList.remove('active');
        // widget:closed listener (below) handles the home-tab reset,
        // keeping closeWidget free of direct navigation calls.
        /** @fires widget:closed — widget hidden */
        eventBus.emit('widget:closed');
    };

    loyaltyApp.toggleWidget = function () {
        var widgetContainer = loyaltyApp.getWidgetContainer(); if (!widgetContainer) return;
        var isOpen = widgetContainer.classList.toggle('active');
        // widget:closed listener handles home-tab reset on close.
        eventBus.emit(isOpen ? 'widget:opened' : 'widget:closed');
    };

    // Reset to the Home tab every time the widget closes.
    // Kept as a bus listener so the close action (button click, programmatic)
    // does not need to know about navigation — it just emits widget:closed.
    /** @listens widget:closed — resets active tab to home on every close */
    eventBus.on('widget:closed', function () {
        loyaltyApp.setActiveNavigation('home');
    });

    // ── SECTION 4b: widget:first-open ────────────────────────────────────────
    // Fires exactly once on the first open. All heavy modules subscribe here
    // instead of dom:loaded, so they never boot until the user actually opens
    // the widget for the first time. bus.once() removes the listener
    // automatically after it fires once — no flag variable needed.

    /**
     * @listens widget:opened (once)
     * Emits widget:first-open the very first time the widget opens.
     * bus.once() ensures the handler is removed after it fires, so
     * widget:first-open is guaranteed to emit exactly one time.
     * @fires widget:first-open
     */
    eventBus.once('widget:opened', function () {
        eventBus.emit('widget:first-open');
    });

    // ── SECTION 5: NAVIGATION ─────────────────────────────────────────────────
    // setActiveNavigation emits tab:activated so every tab module can
    // subscribe and lazy-render itself on first visit.

    loyaltyApp.setActiveNavigation = function (activeNav) {
        activeNav = activeNav || 'home';
        var navItems = loyaltyApp.getNavItems();
        navItems.forEach(function (el) {
            el.classList.toggle('active', el.dataset.nav === activeNav);
        });
        loyaltyApp.getTabItems().forEach(function (el) {
            el.classList.toggle('active', el.dataset.tab === activeNav);
        });
        var wrapper = document.querySelector('.nbl-widget-wrapper-v1');
        if (wrapper) wrapper.scrollTop = 0;

        var activeEl = document.querySelector('.nbl-nav-item-v1[data-nav="' + activeNav + '"]');
        var scrollEl = document.querySelector('.nbl-wh-nav-scroll-v1');
        if (activeEl && scrollEl) {
            var itemCenter = activeEl.offsetLeft + activeEl.offsetWidth / 2;
            var scrollCenter = scrollEl.clientWidth / 2;
            scrollEl.scrollTo({ left: Math.max(0, itemCenter - scrollCenter), behavior: 'smooth' });
        }

        // Nav chevrons are updated via a tab:activated listener (see Section 8b)
        // rather than a direct call here, so setActiveNavigation stays
        // decoupled from the chevron module's internal state.

        /**
         * @fires tab:activated { tab }
         * Emitted every time a nav tab is selected, including programmatic calls.
         * All tab renders, first-visit guards, and chevron updates subscribe here.
         */
        eventBus.emit('tab:activated', { tab: activeNav });
    };

    // ── SECTION 6: POINTS DISPLAY ─────────────────────────────────────────────

    loyaltyApp.uiRender = loyaltyApp.uiRender || {};

    loyaltyApp.uiRender.pointsUpdate = function () {
        var pointsElements = loyaltyApp.getPointsElements();
        if (!pointsElements || !pointsElements.length) return;
        var formatted = formatNumber(getPoints());
        pointsElements.forEach(function (el) { el.innerHTML = formatted; });
        var badge = document.querySelector('.nbl-wh-points-v1');
        if (badge) {
            badge.classList.remove('nbl-points-bump-v1');
            void badge.offsetWidth;
            badge.classList.add('nbl-points-bump-v1');
        }
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

    // ── SECTION 6b: CONFIG UPDATE ─────────────────────────────────────────────

    /**
     * @listens config:updated
     * Refreshes all label-driven DOM elements when config changes at runtime.
     */
    eventBus.on('config:updated', function () {
        var store = getStore();
        var la = store.loyaltyApp;
        var customerName = (la && la.customer && la.customer.name) || '';

        // Header title ([name] replacement)
        var titleEl = document.querySelector('.nbl-wh-title-v1');
        if (titleEl) {
            titleEl.textContent = lbl('headerLabel').replace('[name]', customerName);
        }

        // Launcher button title + subtitle
        var wobTitle = document.querySelector('.nbl-wob-title-v1');
        if (wobTitle) wobTitle.textContent = lbl('launcherTitle');

        var wobSub = document.querySelector('.nbl-wob-sub-v1');
        if (wobSub) {
            var pts = document.querySelector('.nbl-customer-points-v1');
            var ptsHTML = pts ? pts.outerHTML : '0';
            wobSub.innerHTML = lbl('launcherSubtitle').replace('[points]', ptsHTML);
        }

        // Nav buttons
        var navMap = {
            home: 'navHome',
            points: 'navEarn',
            rewards: 'navRewards',
            prizes: 'navPrizes',
            activities: 'navActivity',
            'active-rewards': 'navMyRewards',
            'my-prizes': 'navMyPrizes',
        };
        Object.keys(navMap).forEach(function (nav) {
            var btn = document.querySelector('.nbl-nav-item-v1[data-nav="' + nav + '"]');
            if (btn) btn.textContent = lbl(navMap[nav]);
        });

        // Section headings (multiple instances, e.g. home + rewards tab)
        document.querySelectorAll('.nbl-hsc-title-v1').forEach(function (el) {
            // Match by current text to decide which label to apply
            // Better approach: add data-label attr in html.js (see note below)
            var text = el.textContent.trim();
            if (text === lbl('sectionActiveRewards') || el.closest('[data-tab="home"]') || el.closest('[data-tab="rewards"]')) {
                // skip — these re-render on tab:activated anyway
            }
        });
    });

    // ── SECTION 7: HOME TAB — accordion toggles ───────────────────────────────

    loyaltyApp.homeTabs = (function () {
        var tabs = [];

        function init() {
            tabs = Array.from(document.querySelectorAll('.nbl-home-tab-v1'));
        }

        function getTab(name) {
            return tabs.find(function (tab) { return tab.dataset.tab === name; });
        }

        function setBtn(tab, text) {
            var toggleButton = tab.querySelector('.nbl-hth-toggle-btn-v1');
            if (toggleButton) toggleButton.innerText = text;
        }

        function open(name) { var tabEl = getTab(name); if (!tabEl) return; tabEl.classList.add('active'); setBtn(tabEl, 'Hide'); }
        function close(name) { var tabEl = getTab(name); if (!tabEl) return; tabEl.classList.remove('active'); setBtn(tabEl, 'Show'); }
        function toggle(name) { var tabEl = getTab(name); if (!tabEl) return; tabEl.classList.contains('active') ? close(name) : open(name); }

        /**
         * @listens widget:first-open
         * Caches accordion tab elements the first time the widget is opened.
         */
        eventBus.on('widget:first-open', function () { init(); });

        /**
         * @listens event:click
         * Delegates accordion toggle button clicks.
         */
        eventBus.on('event:click', function (data) {
            var clickedToggleButton = data.target.closest && data.target.closest('.nbl-home-tab-header-v1 .nbl-hth-toggle-btn-v1');
            if (!clickedToggleButton) return;
            var accordionTab = clickedToggleButton.closest('.nbl-home-tab-v1');
            if (accordionTab) toggle(accordionTab.dataset.tab);
        });

        return { open: open, close: close, toggle: toggle };
    })();

    // ── SECTION 8: COMPACT HEADER ON SCROLL ──────────────────────────────────
    // Initialises on widget:first-open — no need to attach scroll listener
    // before the user has ever opened the widget.

    /**
     * @listens widget:first-open
     * Attaches the scroll listener that collapses the header.
     */
    eventBus.on('widget:first-open', function () {
        var wrapper = document.querySelector('.nbl-widget-wrapper-v1');
        var header = document.querySelector('.nbl-widget-header-v1');
        if (!wrapper || !header) return;

        var COMPACT_AT = 60;
        var EXPAND_AT = 15;
        var rafId = null;
        var locked = false;

        function onTransitionEnd() {
            locked = false;
            header.removeEventListener('transitionend', onTransitionEnd);
        }

        wrapper.addEventListener('scroll', function () {
            if (rafId || locked) return;
            rafId = requestAnimationFrame(function () {
                rafId = null;
                var scrollTop = wrapper.scrollTop;
                var isCompact = header.classList.contains('compact');

                if (!isCompact && scrollTop > COMPACT_AT) {
                    locked = true;
                    header.classList.add('compact');
                    header.addEventListener('transitionend', onTransitionEnd, { once: true });
                    setTimeout(function () { locked = false; }, 400);
                } else if (isCompact && scrollTop < EXPAND_AT) {
                    locked = true;
                    header.classList.remove('compact');
                    header.addEventListener('transitionend', onTransitionEnd, { once: true });
                    setTimeout(function () { locked = false; }, 400);
                }
            });
        }, { passive: true });
    });

    // ── SECTION 8b: NAV CHEVRONS ──────────────────────────────────────────────
    // Initialises on widget:first-open.

    /**
     * @listens widget:first-open
     * Sets up the left/right scroll chevrons for the nav rail.
     */
    eventBus.on('widget:first-open', function () {
        var scrollEl = document.querySelector('.nbl-wh-nav-scroll-v1');
        var wrapper = document.querySelector('.nbl-wh-nav-wrapper-v1');
        var leftBtn = document.querySelector('.nbl-nav-chevron-left-v1');
        var rightBtn = document.querySelector('.nbl-nav-chevron-right-v1');
        if (!scrollEl || !leftBtn || !rightBtn) return;

        function updateChevrons() {
            var atStart = scrollEl.scrollLeft <= 4;
            var atEnd = scrollEl.scrollLeft + scrollEl.clientWidth >= scrollEl.scrollWidth - 4;
            leftBtn.classList.toggle('hidden', atStart);
            leftBtn.style.width = atStart ? '0' : '';
            leftBtn.style.padding = atStart ? '0' : '';
            leftBtn.style.overflow = atStart ? 'hidden' : '';
            rightBtn.classList.toggle('hidden', atEnd);
            rightBtn.style.width = atEnd ? '0' : '';
            rightBtn.style.padding = atEnd ? '0' : '';
            rightBtn.style.overflow = atEnd ? 'hidden' : '';
            if (wrapper) {
                wrapper.classList.toggle('nav-at-start', atStart);
                wrapper.classList.toggle('nav-at-end', atEnd);
            }
        }

        loyaltyApp.updateNavChevrons = updateChevrons;

        // Update chevrons on every tab switch so the rail state stays
        // correct after programmatic tab changes (not just scroll events).
        // This replaces the direct loyaltyApp.updateNavChevrons() call that
        // used to live inside setActiveNavigation().
        /** @listens tab:activated — refreshes chevron visibility after every tab switch */
        eventBus.on('tab:activated', function () { updateChevrons(); });

        var SCROLL_BY = 100;

        leftBtn.addEventListener('click', function () {
            scrollEl.scrollBy({ left: -SCROLL_BY, behavior: 'smooth' });
        });
        rightBtn.addEventListener('click', function () {
            scrollEl.scrollBy({ left: SCROLL_BY, behavior: 'smooth' });
        });

        scrollEl.addEventListener('scroll', function () {
            requestAnimationFrame(updateChevrons);
        }, { passive: true });

        updateChevrons();
        requestAnimationFrame(function () {
            requestAnimationFrame(updateChevrons);
        });
    });
}
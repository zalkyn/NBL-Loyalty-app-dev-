/* =============================================================================
   NBL LOYALTY WIDGET  |  ui.js
   Served from: app/public/widget/ui.js

   Architecture:
   - loyalty.liquid sets window.NBL_v1 (data only) then loads this file.
   - This file owns the EventBus, builds all HTML, applies theme, and wires
     every interaction. Nothing is called directly after buildHTML() and
     applyTheme() — all module boots are driven by events.

   Bootstrap sequence:
   ─────────────────────────────────────────────────────────────────────────────
   Page load
     → NBLEventBus created → NBL_v1.bus assigned
     → init() runs immediately (data is already on window.NBL_v1)
     → buildHTML()        inject shell HTML
     → applyTheme()       set CSS variables, emit theme:applied (sticky)
     → dom:loaded         trigger button becomes visible

   First widget open  (widget:first-open — fires via bus.once, exactly once)
     → Notifications panel injected + wired
     → Compact header scroll listener attached
     → Nav chevrons initialised (also updates on every tab:activated)
     → Mouse / cursor particle effect mounted
     → Home tab data rendered (active rewards + recent activities)
     → Accordion tab elements cached

   Each tab visit  (tab:activated:points / :rewards / :referral / etc.)
     → tab:activated:points         → renderEarnPointsList()  (once, then on points:update)
     → tab:activated:rewards        → renderRewardList()      (once, then on points:update)
     → tab:activated:referral       → initReferralTab()       (once — binds copy/share)
     → tab:activated:activities     → renderFullActivities()  (once, fresh via activity:add)
     → tab:activated:active-rewards → renderFullActiveRewards() (once, fresh via reward:add)

   Click routing (fully event-driven — no direct calls from the router):
     Open button  → widget:toggle  → loyaltyApp.toggleWidget()
     Close button → widget:close   → loyaltyApp.closeWidget()
     Nav item     → nav:change     → loyaltyApp.setActiveNavigation()

   Adding a new tab:
     1. Add HTML panel in loggedInBodyHTML()  →  data-tab="your-key"
     2. Add nav button in navHTML             →  data-nav="your-key"
     3. Write a render function
     4. Subscribe:  eventBus.once('tab:activated:your-key', function() { render(); });
        Optionally: eventBus.emitSticky('tab:visited:your-key', true) to enable
        data-change re-renders via eventBus.hasListeners('tab:visited:your-key').

   ─────────────────────────────────────────────────────────────────────────────
   EVENT BUS REGISTRY
   All inter-module communication runs through NBL_v1.bus.
   API: eventBus.on()         subscribe (sticky-aware: late subscribers get last payload)
        eventBus.once()       subscribe for one emission only, auto-removed after firing
        eventBus.off()        unsubscribe a specific handler
        eventBus.emit()       publish an event
        eventBus.emitSticky() publish + store payload for late subscribers
        eventBus.clear()      remove listeners (and sticky payload) for an event/namespace
        eventBus.hasListeners()  check if any listeners exist for an event
        eventBus.listenerCount() count listeners for an event

   Lifecycle
   ─────────
   dom:loaded                        Shell DOM ready. Trigger button shown.
   widget:first-open                 Fires once via bus.once. Heavy modules boot here.
   widget:opened                     Every open. Animations start.
   widget:closed                     Every close. Home tab reset runs here.
   theme:applied  { styles, ... }    Sticky. Theme computed + CSS vars set.
   tab:activated  { tab }            Every nav tab selection (programmatic or click).
   tab:activated:<key>               Per-tab event emitted by the tab:activated handler.
   tab:visited:<key>                 Sticky. Emitted once after first tab render.
   event:click    { event, target }  Every document click re-published.

   Click routing
   ─────────────
   widget:toggle                     Open button clicked → toggleWidget().
   widget:close                      Close button clicked → closeWidget().
   nav:change     { tab }            Nav item clicked → setActiveNavigation().

   Data
   ────
   points:update          { newPoints }
   reward:add             { code, title?, createdAt?, position? }
   reward:rule:add        { id, rewardValue, discountType, pointsCost }
   activity:add           { activity, points, createdAt, position? }

   Notifications
   ─────────────
   notify:reward:open     { code }
   notify:reward:close
   notify:info:open       { payload: { text, claim?, data?, isHtml?,
                             imageUrl?, imagePlaceholder?, imageTitle?,
                             imageFit?, imageHeight?, imagePosition?,
                             badge?, badgeType?, rows?, msgClass?,
                             note?, trackingUrl?, trackingLabel?, trackingText?,
                             contactUrl?, contactText? } }
   notify:info:close
   notify:info:claim:start    { data }
   notify:info:claim:success  { response, voucher }
   notify:info:claim:error    { message }

   Referral modal
   ──────────────
   referralModal:open
   referralModal:close
   referralModal:login
   referralModal:submit   { code }
   referralModal:copy     { text }
   referralModal:finish
   discount:response      { code, data }
============================================================================= */
(function () {
    'use strict';

    // =========================================================================
    // SECTION 0: EVENT BUS
    // Production-grade pub/sub. Supports priority ordering, wildcard listeners,
    // once(), off(), namespace clearing, and safe error isolation per handler.
    // =========================================================================

    function NBLEventBus() {
        this._listeners = {};
        // Stores the last payload of every emitSticky() call.
        // When a new subscriber calls on() for a sticky event, it receives
        // the stored payload immediately — even if the event fired before
        // the subscriber registered. This prevents missed one-time setup
        // events such as theme:applied firing before a module subscribes.
        this._stickyPayloads = {};

        // Logging / debug configuration.
        // Controlled via bus.setLogConfig({ ... }) or WIDGET_CONFIG.logging.
        // All options default to off so production builds are silent.
        this._logConfig = {
            // Master switch — must be true for any logging to happen.
            enabled: false,

            // Log every event emission with name, payload, and listener count.
            logEmit: true,

            // Log sticky emissions separately so they are easy to spot.
            logSticky: true,

            // Log when a late subscriber receives a sticky payload immediately.
            logLateSubscriber: true,

            // Log handler errors (always logged regardless of enabled flag
            // because errors are never intentionally silent).
            logErrors: true,

            // Restrict logging to specific event name prefixes.
            // Empty array = log everything.
            // Example: ['widget', 'tab'] logs only widget:* and tab:* events.
            filterNamespaces: [],

            // CSS color used for the event name label in the console.
            // Adjust to taste or match your brand color.
            labelColor: '#7c3aed'
        };
    }

    NBLEventBus.prototype = {

        /**
         * Subscribe to an event.
         * If the event was previously emitted via emitSticky(), the handler
         * is called immediately with the stored payload so late subscribers
         * never miss a one-time event.
         *
         * @param {string}   eventName
         * @param {Function} handler
         * @param {object}   [options]
         * @param {number}   [options.priority=0]  Higher fires first.
         * @returns {NBLEventBus} this — chainable
         */
        on: function (eventName, handler, options) {
            var priority = (options && options.priority) || 0;
            if (!this._listeners[eventName]) this._listeners[eventName] = [];
            this._listeners[eventName].push({ handler: handler, priority: priority });
            this._listeners[eventName].sort(function (listenerA, listenerB) {
                return listenerB.priority - listenerA.priority;
            });

            // If this is a sticky event that already fired, call the new
            // subscriber immediately with the last stored payload so it
            // does not miss a one-time setup broadcast.
            if (this._stickyPayloads.hasOwnProperty(eventName)) {
                if (this._logConfig.logLateSubscriber && this._shouldLog(eventName)) {
                    console.log(
                        '%c[NBL Bus]%c late subscriber: ' + eventName + ' (sticky payload delivered immediately)',
                        'color:' + this._logConfig.labelColor + ';font-weight:500',
                        'color:#d97706'
                    );
                }
                try { handler(this._stickyPayloads[eventName]); } catch (err) {
                    if (this._logConfig.logErrors) {
                        console.error('[NBL Bus] Error in late sticky handler for "' + eventName + '":', err);
                    }
                }
            }

            return this;
        },

        /**
         * Unsubscribe a specific handler from an event.
         * @param {string}   eventName
         * @param {Function} handler   Must be the exact same function reference passed to on().
         * @returns {NBLEventBus} this — chainable
         */
        off: function (eventName, handler) {
            if (!this._listeners[eventName]) return this;
            this._listeners[eventName] = this._listeners[eventName].filter(function (entry) {
                return entry.handler !== handler;
            });
            return this;
        },

        /**
         * Subscribe to an event for one emission only.
         * The handler is automatically removed after it fires once.
         * @param {string}   eventName
         * @param {Function} handler
         * @param {object}   [options]
         * @returns {NBLEventBus} this — chainable
         */
        once: function (eventName, handler, options) {
            var self = this;
            var onceWrapper = function (eventData) {
                handler(eventData);
                self.off(eventName, onceWrapper);
            };
            return this.on(eventName, onceWrapper, options);
        },

        /**
         * Returns true if logging is enabled for the given event name,
         * based on the master switch and optional namespace filter.
         * @private
         */
        _shouldLog: function (eventName) {
            if (!this._logConfig.enabled) return false;
            var filter = this._logConfig.filterNamespaces;
            if (!filter || filter.length === 0) return true;
            for (var f = 0; f < filter.length; f++) {
                if (eventName === filter[f] || eventName.indexOf(filter[f] + ':') === 0) return true;
            }
            return false;
        },

        /**
         * Emit an event, calling all matching listeners in priority order.
         * Wildcard listeners registered on '*' receive every event.
         * Each handler is wrapped in try/catch so one failing handler
         * never blocks the rest.
         * When logging is enabled, prints event name, payload, and listener
         * count to the console before dispatching.
         * @param {string} eventName
         * @param {*}      [eventData]
         * @returns {NBLEventBus} this — chainable
         */
        emit: function (eventName, eventData) {
            // Log the emission before dispatching so the log appears at the
            // correct point in the call stack (not after all handlers run).
            if (this._logConfig.logEmit && this._shouldLog(eventName)) {
                var listenerCount = (this._listeners[eventName] || []).length;
                console.groupCollapsed(
                    '%c[NBL Bus]%c ' + eventName + ' %c' + listenerCount + ' listener' + (listenerCount !== 1 ? 's' : ''),
                    'color:' + this._logConfig.labelColor + ';font-weight:500',
                    'color:inherit',
                    'color:#888;font-size:11px'
                );
                if (eventData !== undefined) console.log('payload:', eventData);
                console.log('time:', new Date().toISOString());
                console.groupEnd();
            }

            var specificListeners = this._listeners[eventName] || [];
            var wildcardListeners = this._listeners['*'] || [];
            var allListeners = specificListeners.concat(wildcardListeners);
            for (var i = 0; i < allListeners.length; i++) {
                try {
                    allListeners[i].handler(eventData);
                } catch (handlerError) {
                    // Errors are always logged regardless of the enabled flag.
                    if (this._logConfig.logErrors) {
                        console.error('[NBL Bus] Error in handler for "' + eventName + '":', handlerError);
                    }
                }
            }
            return this;
        },

        /**
         * Emit an event and store its payload as the sticky value for this
         * event name. Any subscriber that calls on() after emitSticky() has
         * been called will receive the stored payload immediately on subscribe,
         * so late-arriving modules never miss the event.
         * Use for one-time setup broadcasts: theme:applied, dom:loaded-ish events.
         *
         * @param {string} eventName
         * @param {*}      [eventData]
         * @returns {NBLEventBus} this — chainable
         */
        emitSticky: function (eventName, eventData) {
            // Store payload before emitting so any on() calls triggered
            // during emit (re-entrant subscriptions) also receive the sticky.
            this._stickyPayloads[eventName] = eventData;

            // Log sticky emissions with a distinct marker so they are easy
            // to distinguish from regular emits in the console.
            if (this._logConfig.logSticky && this._shouldLog(eventName)) {
                console.log(
                    '%c[NBL Bus]%c sticky: ' + eventName,
                    'color:' + this._logConfig.labelColor + ';font-weight:500',
                    'color:#0891b2'
                );
            }

            return this.emit(eventName, eventData);
        },

        /**
         * Remove all listeners for a specific event, or clear everything.
         * Supports namespace clearing: clear('widget') removes all events
         * whose name starts with 'widget:'.
         * Also clears any stored sticky payload for the same event(s).
         * @param {string} [eventName]  Omit to clear all listeners.
         */
        clear: function (eventName) {
            if (!eventName) {
                this._listeners = {};
                this._stickyPayloads = {};
                return;
            }
            // Clear exact match
            if (this._listeners[eventName]) {
                delete this._listeners[eventName];
                delete this._stickyPayloads[eventName];
                return;
            }
            // Clear namespace — e.g. clear('widget') removes widget:opened, widget:closed, etc.
            var namespace = eventName + ':';
            var self = this;
            Object.keys(this._listeners).forEach(function (key) {
                if (key === eventName || key.indexOf(namespace) === 0) {
                    delete self._listeners[key];
                    delete self._stickyPayloads[key];
                }
            });
        },

        /**
         * Check whether any listeners exist for an event.
         * @param {string} eventName
         * @returns {boolean}
         */
        hasListeners: function (eventName) {
            return !!(this._listeners[eventName] && this._listeners[eventName].length > 0);
        },

        /**
         * Count the number of listeners registered for an event.
         * @param {string} eventName
         * @returns {number}
         */
        listenerCount: function (eventName) {
            return (this._listeners[eventName] || []).length;
        },

        /**
         * Update one or more logging options at runtime without replacing
         * the entire config. Safe to call from the browser console.
         *
         * @param {object} options  Partial _logConfig — only provided keys are updated.
         *
         * @example
         * // Enable logging for widget and tab events only:
         * NBL_v1.bus.setLogConfig({ enabled: true, filterNamespaces: ['widget', 'tab'] })
         *
         * // Enable everything:
         * NBL_v1.bus.setLogConfig({ enabled: true, filterNamespaces: [] })
         *
         * // Disable:
         * NBL_v1.bus.setLogConfig({ enabled: false })
         */
        setLogConfig: function (options) {
            var self = this;
            Object.keys(options).forEach(function (key) {
                if (self._logConfig.hasOwnProperty(key)) {
                    self._logConfig[key] = options[key];
                }
            });
            return this;
        },

        /**
         * Shorthand to toggle the master logging switch.
         * Equivalent to setLogConfig({ enabled: true/false }).
         *
         * @param {boolean} enabled
         * @returns {NBLEventBus} this — chainable
         *
         * @example
         * NBL_v1.bus.debug(true)   // enable all logging
         * NBL_v1.bus.debug(false)  // disable all logging
         */
        debug: function (enabled) {
            this._logConfig.enabled = !!enabled;
            console.log('[NBL Bus] logging ' + (enabled ? 'enabled' : 'disabled'));
            return this;
        }
    };

    // ─── Bootstrap: create bus and attach to NBL_v1, then run init ───────────
    window.NBL_v1 = window.NBL_v1 || {};
    window.NBL_v1.bus = window.NBL_v1.bus || new NBLEventBus();

    function onReady(fn) {
        if (window.NBL_v1 && window.NBL_v1.bus) { fn(); return; }
        var tries = 0;
        var poll = setInterval(function () {
            if (window.NBL_v1 && window.NBL_v1.bus) { clearInterval(poll); fn(); }
            if (++tries > 100) { clearInterval(poll); }
        }, 50);
    }

    // ─── SVG Icon Registry ─────────────────────────────────────────────────────
    var ICONS = {
        'reward-discount': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>',
        'lightning': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
        'rewards': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
        'referral': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        'review': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
        'purchase': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
        'earn-points': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
        'chevron-right': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
        'close': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        'faq': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    };

    function icon(name) {
        return ICONS[name] || ICONS['earn-points'];
    }

    // =============================================================================
    // MAIN INIT — called once NBL_v1.bus is ready
    // =============================================================================
    function init() {
        var loyaltyApp = window.NBL_v1;
        var eventBus = loyaltyApp.bus;
        var liquidData = loyaltyApp.liquidData || {};
        var appConfig = loyaltyApp.appConfig || {};

        // ── Utility helpers ────────────────────────────────────────────────────────
        var escapeAttribute = function (s) {
            return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        };
        var escapeText = function (s) {
            return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        };
        var formatNumber = function (n) {
            return Intl.NumberFormat().format(Number(n) || 0);
        };
        var formatPoints = function (n) {
            n = Number(n) || 0;
            return formatNumber(n) + ' ' + (n === 1 ? 'point' : 'points');
        };
        var formatDiscount = function (value, type, currencySymbol) {
            return type === 'percentage' ? value + '% off' : (currencySymbol || '$') + formatNumber(value) + ' off';
        };

        var _savedCssVarsEarly = (appConfig.styles && appConfig.styles.cssVars) || {};
        var _posFromCssVars = (_savedCssVarsEarly['--nbl-launcher-position'] || '').toLowerCase();
        var _posFromLiquid = (liquidData.buttonPosition || '').toLowerCase();
        var buttonPosition = (_posFromCssVars === 'left' || _posFromCssVars === 'right')
            ? _posFromCssVars
            : (_posFromLiquid === 'right' ? 'right' : 'left');
        var isLoggedIn = !!(liquidData.isLoggedIn || (loyaltyApp.customer && loyaltyApp.customer.id));

        function getPoints() {
            if (loyaltyApp.points != null) return Number(loyaltyApp.points);
            var config = loyaltyApp.customer && loyaltyApp.customer.config;
            return config && config.points ? Number(config.points) : 0;
        }

        // ─────────────────────────────────────────────────────────────────────────
        // WIDGET CONFIG
        // ─────────────────────────────────────────────────────────────────────────
        var WIDGET_CONFIG = {
            // ── Widget behaviour ─────────────────────────────────────────────────
            showSubmitButtonOnAuto: false,

            // Show sections on Home tab
            showHomeRewardsSection: true,
            showHomeActivitiesSection: true,
            showHomePrizeRequestsSection: true,

            // Items per page
            homeRewardsPerPage: 5,
            homeActivitiesPerPage: 5,
            homePrizeRequestsPerPage: 5,
            myPrizesPerPage: 5,

            // Pagination mode: 'pagination' | 'loadmore'
            paginationMode: 'pagination',

            // ── Prize notification options ────────────────────────────────────────
            // All prize-related display options in one place (overridable from dashboard).
            prize: {
                // Show prize image (or placeholder icon) in the notification banner
                showImage: true,

                // Image fit inside the banner:
                // 'cover'   — fixed height, center-cropped (default)
                // 'contain' — fixed height, full image visible, letterboxed
                // 'auto'    — natural aspect ratio, no crop (height ignored)
                imageFit: 'cover',

                // Banner height in px (ignored when imageFit is 'auto')
                imageHeight: 150,

                // Image focal point: 'center' | 'top' | 'bottom' | 'left' | 'right'
                imagePosition: 'center',

                // "Contact us" button on PENDING and CANCELLED notifications.
                // Set to your store's contact page URL, e.g. '/pages/contact'.
                // Leave empty ('') to hide.
                contactUrl: '',

                // Show admin note (e.g. cancellation reason, delivery note)
                showAdminNote: true,

                // Show tracking info (license key, download link, etc.)
                showTrackingInfo: true,

                // Show request date (createdAt)
                showRequestDate: true,

                // Show fulfilled/completed date
                showFulfilledDate: true,
            },

            // Text labels (overridable from dashboard)
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
            // 'bubble' | 'drop' | 'wave' | 'ripple' | 'none'
            headerEffect: 'wave',
            headerEffectOpacity: 0.55,
            // 'auto' | 'light' | 'dark' | 'custom'
            headerEffectColorMode: 'auto',
            headerEffectColor: 'rgba(255,255,255,0.5)',

            // ── Mouse cursor effect ──────────────────────────────────────────────
            // 'fire' | 'smoke' | 'sparkle' | 'ripple' | 'bubble' | 'none'
            mouseEffect: 'bubble',
            // 0.0 (barely visible) → 1.0 (full strength)
            mouseEffectIntensity: 0.7,

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
                labelColor: '#7c3aed'
            }
        };

        // ── Override WIDGET_CONFIG from dashboard settings ────────────────────
        // appConfig.styles.widgetConfig holds non-CSS settings saved by the
        // dashboard Customize page (header effect, mouse effect, etc.)
        (function applyWidgetConfigOverrides() {
            var wc = appConfig.styles && appConfig.styles.widgetConfig;
            if (!wc || typeof wc !== 'object') return;

            // Behaviour
            if (wc.showHomeRewardsSection !== undefined) WIDGET_CONFIG.showHomeRewardsSection = !!wc.showHomeRewardsSection;
            if (wc.showHomeActivitiesSection !== undefined) WIDGET_CONFIG.showHomeActivitiesSection = !!wc.showHomeActivitiesSection;
            if (wc.showHomePrizeRequestsSection !== undefined) WIDGET_CONFIG.showHomePrizeRequestsSection = !!wc.showHomePrizeRequestsSection;
            if (wc.homeRewardsPerPage !== undefined) WIDGET_CONFIG.homeRewardsPerPage = Math.max(1, Number(wc.homeRewardsPerPage) || 5);
            if (wc.homeActivitiesPerPage !== undefined) WIDGET_CONFIG.homeActivitiesPerPage = Math.max(1, Number(wc.homeActivitiesPerPage) || 5);
            if (wc.homePrizeRequestsPerPage !== undefined) WIDGET_CONFIG.homePrizeRequestsPerPage = Math.max(1, Number(wc.homePrizeRequestsPerPage) || 5);
            if (wc.myPrizesPerPage !== undefined) WIDGET_CONFIG.myPrizesPerPage = Math.max(1, Number(wc.myPrizesPerPage) || 5);
            if (wc.paginationMode !== undefined) WIDGET_CONFIG.paginationMode = wc.paginationMode;

            // Prize options — deep merge so only overridden keys are replaced
            if (wc.prize && typeof wc.prize === 'object') {
                WIDGET_CONFIG.prize = Object.assign({}, WIDGET_CONFIG.prize, wc.prize);
            }
            // Legacy flat keys (backward compat)
            if (wc.prizeShowImage !== undefined) WIDGET_CONFIG.prize.showImage = !!wc.prizeShowImage;
            if (wc.prizeImageFit !== undefined) WIDGET_CONFIG.prize.imageFit = wc.prizeImageFit;
            if (wc.prizeImageHeight !== undefined) WIDGET_CONFIG.prize.imageHeight = Number(wc.prizeImageHeight) || 150;
            if (wc.prizeImagePosition !== undefined) WIDGET_CONFIG.prize.imagePosition = wc.prizeImagePosition;
            if (wc.prizeContactUrl !== undefined) WIDGET_CONFIG.prize.contactUrl = wc.prizeContactUrl;
            if (wc.prizeShowAdminNote !== undefined) WIDGET_CONFIG.prize.showAdminNote = !!wc.prizeShowAdminNote;
            if (wc.prizeShowTrackingInfo !== undefined) WIDGET_CONFIG.prize.showTrackingInfo = !!wc.prizeShowTrackingInfo;
            if (wc.prizeShowRequestDate !== undefined) WIDGET_CONFIG.prize.showRequestDate = !!wc.prizeShowRequestDate;
            if (wc.prizeShowFulfilledDate !== undefined) WIDGET_CONFIG.prize.showFulfilledDate = !!wc.prizeShowFulfilledDate;

            // Header animation
            if (wc.headerEffect !== undefined) WIDGET_CONFIG.headerEffect = wc.headerEffect;
            if (wc.headerEffectOpacity !== undefined) WIDGET_CONFIG.headerEffectOpacity = Number(wc.headerEffectOpacity);
            if (wc.headerEffectColorMode !== undefined) WIDGET_CONFIG.headerEffectColorMode = wc.headerEffectColorMode;

            // Mouse effect
            if (wc.mouseEffect !== undefined) WIDGET_CONFIG.mouseEffect = wc.mouseEffect;
            if (wc.mouseEffectIntensity !== undefined) WIDGET_CONFIG.mouseEffectIntensity = Number(wc.mouseEffectIntensity);

            // Labels — deep merge so only overridden keys are replaced
            if (wc.labels && typeof wc.labels === 'object') {
                WIDGET_CONFIG.labels = Object.assign({}, WIDGET_CONFIG.labels, wc.labels);
            }
        })();

        // Shorthand to read a label with fallback to default
        function lbl(key) {
            try { return (WIDGET_CONFIG && WIDGET_CONFIG.labels && WIDGET_CONFIG.labels[key]) || ''; } catch (e) { return ''; }
        }

        // Apply WIDGET_CONFIG.logging to the event bus. This must run after
        // WIDGET_CONFIG is declared above so all options are available.
        // Runtime changes: NBL_v1.bus.debug(true) or bus.setLogConfig({...})
        if (WIDGET_CONFIG.logging) {
            eventBus.setLogConfig(WIDGET_CONFIG.logging);
        }

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 1: BUILD HTML
        // ─────────────────────────────────────────────────────────────────────────

        function buildHTML() {
            var customerName = escapeText(loyaltyApp?.customer?.name || liquidData.customerName || '');
            var headingLabel = (liquidData.headerLabel || lbl('headerLabel') || 'Welcome, [name]').replace('[name]', customerName);
            var pointsLabel = (liquidData.pointsLabel || lbl('pointsLabel') || '[points] pts')
                .replace('[points]', '<span class="nbl-customer-points-v1">0</span>');
            var referralLink = escapeAttribute((liquidData.shopUrl || '') + '/?nbl-referral=' + (liquidData.referralCode || ''));

            var btnHTML = `
                <div class="nbl-wo-wrapper-v1 nbl-d-none-v1 pos-${buttonPosition}">
                    <button class="nbl-widget-open-button-v1${isLoggedIn ? '' : ' nbl-wob-guest-v1'}" aria-label="Open loyalty widget">
                        <div class="nbl-wob-icon-v1">🎁</div>
                        <div class="nbl-wob-label-v1">
                            <span class="nbl-wob-title-v1">${lbl('launcherTitle')}</span>
                            ${isLoggedIn ? `<span class="nbl-wob-sub-v1">${lbl('launcherSubtitle').replace('[points]', '<span class="nbl-customer-points-v1">0</span>')}</span>` : ''}
                        </div>
                    </button>
                </div>`;

            var headerTopHTML = isLoggedIn
                ? `<h3 class="nbl-wh-title-v1">${headingLabel}</h3><div class="nbl-wh-points-v1">${pointsLabel}</div>`
                : `<h3 class="nbl-wh-title-v1">NBL Loyalty Program</h3>`;

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

            var bodyHTML = isLoggedIn ? loggedInBodyHTML(referralLink) : guestBodyHTML();

            var widgetHTML = `
                <div class="nbl-widget-container-v1 pos-${buttonPosition}">
                    <div class="nbl-widget-scroll-area-v1">
                        <div class="nbl-widget-wrapper-v1">
                            <div class="nbl-widget-header-v1">
                                <button class="nbl-widget-close-button-v1" aria-label="Close">${icon('close')}</button>
                                <div class="nbl-widget-header-wrapper-v1">
                                    <div class="nbl-widget-header-top-v1">
                                        <div class="nbl-hdr-blob-v1 nbl-hdr-blob1-v1"><span class="nbl-hdr-blob-dot-v1"></span></div>
                                        <div class="nbl-hdr-blob-v1 nbl-hdr-blob2-v1"><span class="nbl-hdr-blob-dot-v1"></span></div>
                                        <div class="nbl-hdr-blob-v1 nbl-hdr-blob3-v1"><span class="nbl-hdr-blob-dot-v1"></span></div>
                                        <div class="nbl-hdr-blob-v1 nbl-hdr-blob4-v1"><span class="nbl-hdr-blob-dot-v1"></span></div>
                                        <div class="nbl-hdr-blob-v1 nbl-hdr-blob5-v1"><span class="nbl-hdr-blob-dot-v1"></span></div>
                                        <div class="nbl-hdr-drop-v1 nbl-hdr-drop1-v1"></div>
                                        <div class="nbl-hdr-drop-v1 nbl-hdr-drop2-v1"></div>
                                        <div class="nbl-hdr-drop-v1 nbl-hdr-drop3-v1"></div>
                                        <div class="nbl-hdr-drop-v1 nbl-hdr-drop4-v1"></div>
                                        <div class="nbl-hdr-drop-v1 nbl-hdr-drop5-v1"></div>
                                        <div class="nbl-hdr-drop-v1 nbl-hdr-drop6-v1"></div>
                                        <div class="nbl-hdr-wave-v1 nbl-hdr-wave1-v1"></div>
                                        <div class="nbl-hdr-wave-v1 nbl-hdr-wave2-v1"></div>
                                        <div class="nbl-hdr-wave-v1 nbl-hdr-wave3-v1"></div>
                                        <div class="nbl-hdr-ripple-canvas-v1"></div>
                                        <div class="nbl-hdr-shimmer-v1"></div>
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

            var root = document.createElement('div');
            root.id = 'nbl-loyalty-root';
            root.innerHTML = btnHTML + widgetHTML + referralModalHTML();
            document.body.appendChild(root);
        }

        function loggedInBodyHTML(referralLink) {
            var rewardsAccordion = WIDGET_CONFIG.showHomeRewardsSection ? `
                <div class="nbl-home-section-card-v1" data-home-section="rewards">
                    <div class="nbl-hsc-header-v1">
                        <span class="nbl-hsc-icon-v1">${icon('reward-discount')}</span>
                        <span class="nbl-hsc-title-v1">${lbl('sectionActiveRewards')}</span>
                    </div>
                    <div class="nbl-hta-reward-list-v1">
                        <div class="nbl-hta-rewards-empty-v1">${lbl('emptyRewards')}</div>
                    </div>
                    ${paginationHTML('home-rewards')}
                </div>` : '';

            var prizeRequestsAccordion = WIDGET_CONFIG.showHomePrizeRequestsSection !== false ? `
                <div class="nbl-home-section-card-v1" data-home-section="prize-requests">
                    <div class="nbl-hsc-header-v1">
                        <span class="nbl-hsc-icon-v1">${icon('reward-discount')}</span>
                        <span class="nbl-hsc-title-v1">${lbl('sectionPrizeRequests')}</span>
                    </div>
                    <div class="nbl-prize-requests-list-v1">
                        <div class="nbl-hta-rewards-empty-v1">${lbl('emptyMyPrizes')}</div>
                    </div>
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
                        <div class="nbl-haTa-list-wrapper-v1">
                            <div class="nbl-haTa-list-empty-v1">${lbl('emptyActivity')}</div>
                        </div>
                    </div>
                    ${paginationHTML('home-activities')}
                </div>` : '';

            return `
                <div class="nbl-wc-tab-wrapper-v1">
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
                    </div>
                    <div class="nbl-tab-item-v1" data-tab="prizes">
                        <div class="nbl-prize-list-v1"></div>
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
                                <div class="nbl-haTa-list-wrapper-full-v1">
                                    <div class="nbl-haTa-list-empty-v1">${lbl('emptyActivity')}</div>
                                </div>
                            </div>
                            ${paginationHTML('full-activities')}
                        </div>
                    </div>
                    <div class="nbl-tab-item-v1" data-tab="active-rewards">
                        <div class="nbl-active-rewards-full-wrapper-v1">
                            <div class="nbl-hta-reward-list-full-v1">
                                <div class="nbl-hta-rewards-empty-v1">${lbl('emptyRewards')}</div>
                            </div>
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

        function guestBodyHTML() {
            var loginUrl = escapeAttribute((loyaltyApp.routes && loyaltyApp.routes.login_url) || '/account/login');
            var signupUrl = escapeAttribute((loyaltyApp.routes && loyaltyApp.routes.register_url) || '/account/register');
            return `
                <div class="nbl-guest-wrapper-v1">
                    <div class="nbl-guest-hero-v1">
                        <div class="nbl-guest-hero-orb-v1"></div>
                        <div class="nbl-guest-hero-orb-v1 nbl-guest-hero-orb2-v1"></div>
                        <div class="nbl-guest-hero-icon-wrap-v1">
                            <span class="nbl-guest-hero-ring-v1"></span>
                            <span class="nbl-guest-hero-ring-v1 nbl-guest-hero-ring2-v1"></span>
                            <div class="nbl-guest-hero-icon-v1">🎁</div>
                        </div>
                        <h2 class="nbl-guest-hero-title-v1">Earn &amp; Redeem Rewards</h2>
                        <p class="nbl-guest-hero-sub-v1">Join the loyalty program and start earning points on every purchase.</p>
                    </div>
                    <div class="nbl-guest-perks-v1">
                        <div class="nbl-guest-perk-v1">
                            <span class="nbl-guest-perk-icon-v1">⚡</span>
                            <span class="nbl-guest-perk-label-v1">Earn on every order</span>
                        </div>
                        <div class="nbl-guest-perk-divider-v1"></div>
                        <div class="nbl-guest-perk-v1">
                            <span class="nbl-guest-perk-icon-v1">🏷️</span>
                            <span class="nbl-guest-perk-label-v1">Redeem for discounts</span>
                        </div>
                        <div class="nbl-guest-perk-divider-v1"></div>
                        <div class="nbl-guest-perk-v1">
                            <span class="nbl-guest-perk-icon-v1">👥</span>
                            <span class="nbl-guest-perk-label-v1">Refer &amp; earn more</span>
                        </div>
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

        function homeNavCard(navKey, iconName, label) {
            return `
                <div data-nav="${navKey}" class="nbl-home-nav-itm-v1">
                    <div class="nbl-nav-icon-wrap">${icon(iconName)}</div>
                    <span class="nbl-wct-hb-text-v1">${label}</span>
                    <div class="nbl-wchb-cai-v1">${icon('chevron-right')}</div>
                </div>`;
        }

        function accordion(tabKey, heading, openByDefault, bodyInner) {
            return `
                <div class="nbl-home-tab-v1${openByDefault ? ' active' : ''}" data-tab="${tabKey}">
                    <div class="nbl-home-tab-header-v1">
                        <div class="nbl-hth-heading-v1">${heading}</div>
                        <button class="nbl-hth-toggle-btn-v1">${openByDefault ? 'Hide' : 'Show'}</button>
                    </div>
                    <div class="nbl-home-tab-body-v1">${bodyInner}</div>
                </div>`;
        }

        function paginationHTML(key, mode) {
            mode = mode || WIDGET_CONFIG.paginationMode || 'pagination';
            var inner = mode === 'loadmore'
                ? '<button class="nbl-loadmore-btn-v1"><span class="nbl-loadmore-text-v1">' + lbl('loadMoreBtn') + '</span><span class="nbl-loadmore-dots-v1"><span></span><span></span><span></span></span><span class="nbl-loadmore-done-v1">\u2713 ' + lbl('loadMoreDone') + '</span></button>'
                : '<button class="nbl-pagination-btn-v1 nbl-pagination-prev-v1" disabled><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button><div class="nbl-pagination-dots-row-v1"></div><button class="nbl-pagination-btn-v1 nbl-pagination-next-v1" disabled><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>';
            return '<div class="nbl-pagination-v1" data-pagination="' + key + '" data-pg-mode="' + mode + '" style="display:none">' + inner + '</div>';
        }

        function referralTabHTML(referralLink) {
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

            return `
                <div class="nbl-referral-wrapper-v1">
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
                            <button class="nbl-referral-share-btn-v1" data-share="whatsapp">\uD83D\uDCF1 WhatsApp</button>
                            <button class="nbl-referral-share-btn-v1" data-share="email">\u2709\uFE0F Email</button>
                            <button class="nbl-referral-share-btn-v1" data-share="messenger">\uD83D\uDCAC Messenger</button>
                            <button class="nbl-referral-share-btn-v1" data-share="sms">\uD83D\uDCE9 SMS</button>
                        </div>
                    </div>
                </div>`;
        }

        function refStep(num, title, desc) {
            return `
                <div class="nbl-referral-step-v1">
                    <div class="nbl-referral-step-num-v1">${num}</div>
                    <div class="nbl-referral-step-content-v1">
                        <h4>${title}</h4>
                        <p>${desc}</p>
                    </div>
                </div>`;
        }

        function referralModalHTML() {
            var pointRules = appConfig.pointRules || [];
            var refRule = pointRules.find(function (pointRule) { return pointRule.event && pointRule.event.type === 'REFERRAL'; });
            var refCond = (refRule && refRule.conditions && refRule.conditions.referral) || {};
            var referrer = refCond.referrer || {};
            var referred = refCond.referred || {};
            var trigger = refCond.trigger || 'oneTime';
            var currencySymbol = (appConfig.shop && appConfig.shop.currencySymbol) || '$';

            var referrerRewardText = '';
            if (trigger === 'subscription') {
                var rewardParts = [];
                if (referrer.points > 0)
                    rewardParts.push('Earn <strong>' + formatNumber(referrer.points) + ' points</strong> when your friend places their first subscription order.');
                if (referrer.allowRenewalReward && referrer.renewalPoints > 0)
                    rewardParts.push('Earn <strong>' + formatNumber(referrer.renewalPoints) + ' points</strong> every time your friend renews their subscription.');
                referrerRewardText = rewardParts.join(' ');
            } else if (trigger === 'both') {
                var rewardParts = [];
                if (referrer.points > 0)
                    rewardParts.push('Earn <strong>' + formatNumber(referrer.points) + ' points</strong> when your friend places their first order.');
                if (referrer.allowRenewalReward && referrer.renewalPoints > 0)
                    rewardParts.push('Earn <strong>' + formatNumber(referrer.renewalPoints) + ' points</strong> every time your friend renews their subscription.');
                referrerRewardText = rewardParts.join(' ');
            } else if (referrer.points > 0) {
                // oneTime
                referrerRewardText = 'Earn <strong>' + formatNumber(referrer.points) + ' points</strong> when your friend completes their first one-time purchase.';
            }

            var friendRewardRows = [];
            if (referred.discountValue) {
                var voucherValue = referred.discountType === 'percentage'
                    ? referred.discountValue + '% discount voucher'
                    : 'a ' + currencySymbol + formatNumber(referred.discountValue) + ' discount voucher';
                var friendOrderNote = referred.minimumOrderValue
                    ? ' on orders over ' + currencySymbol + formatNumber(referred.minimumOrderValue)
                    : trigger === 'subscription'
                        ? ' for your first subscription order'
                        : trigger === 'both'
                            ? ' for your first order'
                            : ' for your first one-time purchase';
                friendRewardRows.push('🎁 You get <strong>' + voucherValue + '</strong>' + friendOrderNote + '.');
            }
            if ((trigger === 'subscription' || trigger === 'both') && referred.allowRenewalReward && referred.renewalPoints > 0) {
                friendRewardRows.push('🔄 Earn <strong>' + formatNumber(referred.renewalPoints) + ' points</strong> every time you renew your subscription.');
            }

            var rewardSummaryHTML = friendRewardRows.length ? '<div class="nbl-refer-modal-reward-summary-v1">' +
                friendRewardRows.map(function (row) { return '<div class="nbl-refer-modal-reward-row-v1">' + row + '</div>'; }).join('') +
                '</div>' : '';

            return `
                <div class="nbl-refer-modal-overlay-v1" role="dialog" aria-modal="true" aria-labelledby="nbl-modal-title">
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
                                <h3 class="nbl-refer-modal-title-v1">Get Your Referral Discount 🎁</h3>
                                <p class="nbl-refer-modal-subtitle-v1">Enter your referral code to unlock your discount.</p>
                                ${rewardSummaryHTML}
                                <input type="text" class="nbl-refer-modal-input-v1" readonly id="referralInput">
                                <button class="nbl-refer-modal-btn-v1 nbl-refer-modal-btn-primary-v1" id="submitBtn">Request Discount Code</button>
                                <div class="nbl-refer-modal-message-v1" id="formMessage"></div>
                            </div>
                            <div class="nbl-refer-modal-success-v1 nbl-hidden-v1">
                                <div class="nbl-refer-modal-brand-v1">NBL Loyalty</div>
                                <h3 class="nbl-refer-modal-title-v1">🎉 Your Discount Code</h3>
                                <div class="nbl-refer-modal-code-box-v1">
                                    <div class="nbl-refer-modal-code-v1" id="discountCode"></div>
                                    <button class="nbl-refer-modal-copy-btn-v1" id="copyBtn">Copy Code</button>
                                    <div class="nbl-refer-modal-copied-text-v1 nbl-hidden-v1">Copied ✓</div>
                                </div>
                                ${friendRewardRows.length ? '<div class="nbl-refer-modal-reward-summary-v1">' + friendRewardRows.map(function (row) { return '<div class="nbl-refer-modal-reward-row-v1">' + row + '</div>'; }).join('') + '</div>' : ''}
                                <div class="nbl-refer-modal-important-v1">
                                    <strong>Important:</strong>
                                    <ul><li>One-time code — use at checkout.</li><li>Use it quickly.</li></ul>
                                </div>
                                <button class="nbl-refer-modal-btn-v1 nbl-refer-modal-btn-finish-v1" id="finishBtn">Finish &amp; Save</button>
                                <div class="nbl-refer-modal-message-v1" id="successMessage"></div>
                            </div>
                            <div class="nbl-refer-modal-locked-v1 nbl-hidden-v1">
                                <div class="nbl-refer-modal-brand-v1">NBL Loyalty</div>
                                <h3 class="nbl-refer-modal-title-v1">🚫 Referral Already Used</h3>
                                <p class="nbl-refer-modal-subtitle-v1">Only one referral discount is allowed per customer.</p>
                                <button class="nbl-refer-modal-btn-v1 nbl-refer-modal-btn-finish-v1" id="lockedCloseBtn">Close</button>
                                <div class="nbl-refer-modal-message-v1" id="lockedMessage"></div>
                            </div>
                        </div>
                    </div>
                </div>`;
        }

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 2: THEME
        // ─────────────────────────────────────────────────────────────────────────

        function applyTheme() {
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

            // ─────────────────────────────────────────────────────────────────────
            // NEW SYSTEM: appConfig.cssVars — flat { "--nbl-*": "value" } object
            // Dashboard এর "Customize Widget" page থেকে saved হয়।
            // এটা থাকলে সরাসরি :root এ apply করো এবং legacy path skip করো।
            // CSS :root এর hardcoded defaults base হিসেবে থাকে;
            // এখানে শুধু merchant-overridden values set হয়।
            // ─────────────────────────────────────────────────────────────────────
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
                        modalStyles: modalStyles
                    });

                    // ── Header effect — cssVars path ─────────────────────────────
                    // Legacy path runs applyHeaderEffectColors() inside its own rAF.
                    // cssVars path must do the same — previously it was skipped entirely.
                    // Read --nbl-header-bg from the vars we just set so 'auto' mode
                    // can still calculate luminance correctly.
                    (function applyHeaderEffectColors() {
                        var effect = WIDGET_CONFIG.headerEffect;
                        var opacity = Math.max(0, Math.min(1,
                            WIDGET_CONFIG.headerEffectOpacity != null ? WIDGET_CONFIG.headerEffectOpacity : 0.55));
                        var mode = WIDGET_CONFIG.headerEffectColorMode || 'auto';
                        var custom = WIDGET_CONFIG.headerEffectColor || 'rgba(255,255,255,0.5)';

                        var hdrTop = document.querySelector('.nbl-widget-header-top-v1');
                        if (!hdrTop) return;
                        hdrTop.setAttribute('data-effect', effect);
                        if (effect === 'none') return;

                        var isDark;
                        if (mode === 'light') { isDark = true; }
                        else if (mode === 'dark') { isDark = false; }
                        else if (mode === 'custom') { isDark = null; }
                        else {
                            // Read from the CSS var we just set (fallback to legacy object or default)
                            var resolvedBg = (savedCssVars['--nbl-header-bg'] || header['Background Color'] || '#8b5cf6');
                            var hexColor = resolvedBg.replace('#', '');
                            if (hexColor.length === 3) hexColor = hexColor[0] + hexColor[0] + hexColor[1] + hexColor[1] + hexColor[2] + hexColor[2];
                            var redLuminance = parseInt(hexColor.slice(0, 2), 16) / 255;
                            var greenLuminance = parseInt(hexColor.slice(2, 4), 16) / 255;
                            var blueLuminance = parseInt(hexColor.slice(4, 6), 16) / 255;
                            isDark = (0.2126 * redLuminance + 0.7152 * greenLuminance + 0.0722 * blueLuminance) < 0.45;
                        }

                        function a(v) { return +(v * opacity).toFixed(2); }

                        var effectColors = isDark === null ? {
                            hi: custom, mid: custom, edge: 'transparent',
                            bdr: custom, sh: 'rgba(0,0,0,' + a(0.12) + ')', shIn: custom, dot: custom
                        } : isDark ? {
                            hi: 'rgba(255,255,255,' + a(0.65) + ')',
                            mid: 'rgba(255,255,255,' + a(0.22) + ')',
                            edge: 'rgba(0,0,0,' + a(0.08) + ')',
                            bdr: 'rgba(255,255,255,' + a(0.50) + ')',
                            sh: 'rgba(0,0,0,' + a(0.18) + ')',
                            shIn: 'rgba(255,255,255,' + a(0.45) + ')',
                            dot: 'rgba(255,255,255,' + a(0.70) + ')'
                        } : {
                            hi: 'rgba(0,0,0,' + a(0.14) + ')',
                            mid: 'rgba(0,0,0,' + a(0.06) + ')',
                            edge: 'rgba(255,255,255,' + a(0.35) + ')',
                            bdr: 'rgba(0,0,0,' + a(0.12) + ')',
                            sh: 'rgba(0,0,0,' + a(0.08) + ')',
                            shIn: 'rgba(255,255,255,' + a(0.65) + ')',
                            dot: 'rgba(255,255,255,' + a(0.75) + ')'
                        };

                        if (effect === 'bubble') {
                            hdrTop.querySelectorAll('.nbl-hdr-blob-v1').forEach(function (el) {
                                el.style.background = 'radial-gradient(circle at 32% 28%,' + effectColors.hi + ' 0%,' + effectColors.mid + ' 38%,' + effectColors.edge + ' 72%,transparent 100%)';
                                el.style.boxShadow = 'inset -2px -2px 5px ' + effectColors.sh + ',inset 2px 2px 4px ' + effectColors.shIn + ',0 4px 12px ' + effectColors.sh;
                                el.style.border = '1px solid ' + effectColors.bdr;
                                var blobDotElement = el.querySelector('.nbl-hdr-blob-dot-v1');
                                if (blobDotElement) blobDotElement.style.background = effectColors.dot;
                            });
                        }

                        if (effect === 'drop') {
                            hdrTop.querySelectorAll('.nbl-hdr-drop-v1').forEach(function (el) {
                                el.style.background = 'radial-gradient(ellipse at 35% 25%,' + effectColors.hi + ' 0%,transparent 42%),radial-gradient(ellipse at 60% 65%,' + effectColors.mid + ' 0%,transparent 75%)';
                                el.style.border = '1px solid ' + effectColors.bdr;
                                el.style.boxShadow = '0 5px 14px ' + effectColors.sh + ',inset 0 -2px 4px ' + effectColors.mid;
                            });
                        }

                        if (effect === 'wave') {
                            var waveColors = isDark === null
                                ? [custom, custom, custom]
                                : isDark
                                    ? ['rgba(255,255,255,' + a(0.22) + ')', 'rgba(255,255,255,' + a(0.13) + ')', 'rgba(255,255,255,' + a(0.07) + ')']
                                    : ['rgba(0,0,0,' + a(0.12) + ')', 'rgba(0,0,0,' + a(0.07) + ')', 'rgba(0,0,0,' + a(0.04) + ')'];
                            hdrTop.querySelectorAll('.nbl-hdr-wave-v1').forEach(function (el, i) {
                                el.style.background = waveColors[i] || waveColors[0];
                            });
                        }

                        if (effect === 'ripple') {
                            var anchor = hdrTop.querySelector('.nbl-hdr-ripple-canvas-v1');
                            if (!anchor || anchor._init) return;
                            anchor._init = true;

                            var rippleCanvas = document.createElement('canvas');
                            rippleCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;';
                            anchor.appendChild(rippleCanvas);
                            var rippleContext = rippleCanvas.getContext('2d');
                            var rings = [];
                            var rippleColorRGB = (isDark === null || isDark) ? '255,255,255' : '0,0,0';

                            function sizeCanvas() {
                                rippleCanvas.width = hdrTop.offsetWidth || 390;
                                rippleCanvas.height = hdrTop.offsetHeight || 90;
                            }
                            sizeCanvas();
                            window.addEventListener('resize', sizeCanvas, { passive: true });

                            function spawnRipple(x, y, maxR) {
                                rings.push({ x: x, y: y, r: 1, maxR: maxR, life: 1 });
                            }

                            (function tickRipple() {
                                rippleContext.clearRect(0, 0, rippleCanvas.width, rippleCanvas.height);
                                rings = rings.filter(function (ring) {
                                    ring.r += (ring.maxR - ring.r) * 0.045 + 0.3;
                                    ring.life -= 0.018;
                                    if (ring.life <= 0) return false;
                                    var alpha = ring.life * opacity * 0.6;
                                    rippleContext.beginPath();
                                    rippleContext.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
                                    rippleContext.strokeStyle = 'rgba(' + rippleColorRGB + ',' + alpha.toFixed(2) + ')';
                                    rippleContext.lineWidth = 1.5;
                                    rippleContext.stroke();
                                    return true;
                                });
                                requestAnimationFrame(tickRipple);
                            })();

                            (function spawnLoop() {
                                var w = rippleCanvas.width, h = rippleCanvas.height;
                                if (w > 0 && h > 0) {
                                    var count = 1 + Math.floor(Math.random() * 2);
                                    for (var i = 0; i < count; i++) {
                                        spawnRipple(
                                            20 + Math.random() * (w - 40),
                                            8 + Math.random() * (h - 16),
                                            10 + Math.random() * 34
                                        );
                                    }
                                }
                                setTimeout(spawnLoop, 800 + Math.random() * 600);
                            })();
                        }

                        // Trigger CSS animations — same double-rAF pattern as legacy path.
                        // nbl-hdr-animated-v1 is the gate class that enables keyframe
                        // animations on blobs, drops, waves etc. in ui_v2.css.
                        // Without this the elements are painted but never animate.
                        requestAnimationFrame(function () {
                            requestAnimationFrame(function () {
                                hdrTop.classList.add('nbl-hdr-animated-v1');
                            });
                        });
                    })();
                });
                return; // ← legacy cssVariables path skip
            }

            // ─────────────────────────────────────────────────────────────────────
            // LEGACY SYSTEM: appConfig.styles.* object-based config
            // cssVars না থাকলে এই path চলে (backward compatibility)
            // ─────────────────────────────────────────────────────────────────────
            var cssVariables = {

                // ── Brand / Primary ──────────────────────────────────────────────
                '--nbl-primary': header['Background Color'] || '#8b5cf6',
                '--nbl-accent': styles['Accent Color'] || actionButtonStyles['Background Color'] || '#4ecba8',

                // ── Header ───────────────────────────────────────────────────────
                '--nbl-header-bg': header['Background Color'] || '#8b5cf6',
                '--nbl-header-color': headerColor,
                '--nbl-header-padding': header['Padding'] || '20px',
                // legacy names → new CSS var names (renamed in ui_v2.css)
                '--nbl-header-title-font-size': header['Font Size'] || '16px',
                '--nbl-header-title-font-weight': header['Font Weight'] || '700',

                // ── Points Badge ──────────────────────────────────────────────────
                '--nbl-points-bg': points['Background Color'] || 'rgba(255,255,255,0.2)',
                '--nbl-points-color': points['Color'] || headerColor,
                '--nbl-points-border-color': points['Border Color'] || 'rgba(255,255,255,0.22)',
                '--nbl-points-border-radius': points['Border Radius'] || '99px',
                '--nbl-points-padding': points['Padding'] || '5px 12px',
                '--nbl-points-font-size': points['Font Size'] || '12px',

                // ── Navigation Bar ────────────────────────────────────────────────
                '--nbl-nav-bg': navigationStyles['Background Color'] || '#ffffff',
                '--nbl-nav-active-color': navigationStyles['Active Color'] || '#8b5cf6',
                '--nbl-nav-active-border': navigationStyles['Active Border Color'] || '#8b5cf6',
                // legacy names → new CSS var names
                '--nbl-nav-item-font-size': navigationStyles['Font Size'] || '12px',
                '--nbl-nav-item-font-weight': navigationStyles['Font Weight'] || '500',

                // ── Action Button ─────────────────────────────────────────────────
                '--nbl-btn-bg': actionButtonStyles['Background Color'] || '#4ecba8',
                '--nbl-btn-color': actionButtonStyles['Color'] || '#ffffff',
                '--nbl-btn-border': actionButtonStyles['Border Color'] || '#4ecba8',
                '--nbl-btn-radius': actionButtonStyles['Border Radius'] || '10px',
                '--nbl-btn-font-size': actionButtonStyles['Font Size'] || '14px',
                '--nbl-btn-font-weight': actionButtonStyles['Font Weight'] || '600',
                '--nbl-btn-padding': actionButtonStyles['Padding'] || '10px 20px',

                // ── Launcher / Open Button ────────────────────────────────────────
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

                // ── Referral Modal ────────────────────────────────────────────────
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
                '--nbl-modal-code-border': modalStyles['Code Border'] || '#d1d5db'
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

                // ── Launcher button DOM updates ───────────────────────────────────
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
                // Payload carries the resolved style objects so subscribers
                // do not need to re-read from appConfig.
                /** @fires theme:applied { styles, headerColor, actionButtonStyles, tabHomeNav, launcherStyles, modalStyles } */
                eventBus.emitSticky('theme:applied', {
                    styles: styles,
                    headerColor: headerColor,
                    actionButtonStyles: actionButtonStyles,
                    tabHomeNav: tabHomeNav,
                    launcherStyles: launcherStyles,
                    modalStyles: modalStyles
                });

                // ── Header effect — runs once after first paint ───────────────────
                (function applyHeaderEffectColors() {
                    var effect = WIDGET_CONFIG.headerEffect;
                    var opacity = Math.max(0, Math.min(1,
                        WIDGET_CONFIG.headerEffectOpacity != null ? WIDGET_CONFIG.headerEffectOpacity : 0.55));
                    var mode = WIDGET_CONFIG.headerEffectColorMode || 'auto';
                    var custom = WIDGET_CONFIG.headerEffectColor || 'rgba(255,255,255,0.5)';

                    var hdrTop = document.querySelector('.nbl-widget-header-top-v1');
                    if (!hdrTop) return;
                    hdrTop.setAttribute('data-effect', effect);
                    if (effect === 'none') return;

                    var isDark;
                    if (mode === 'light') { isDark = true; }
                    else if (mode === 'dark') { isDark = false; }
                    else if (mode === 'custom') { isDark = null; }
                    else {
                        var hexColor = (header['Background Color'] || '#8b5cf6').replace('#', '');
                        if (hexColor.length === 3) hexColor = hexColor[0] + hexColor[0] + hexColor[1] + hexColor[1] + hexColor[2] + hexColor[2];
                        var redLuminance = parseInt(hexColor.slice(0, 2), 16) / 255;
                        var greenLuminance = parseInt(hexColor.slice(2, 4), 16) / 255;
                        var blueLuminance = parseInt(hexColor.slice(4, 6), 16) / 255;
                        isDark = (0.2126 * redLuminance + 0.7152 * greenLuminance + 0.0722 * blueLuminance) < 0.45;
                    }

                    function a(v) { return +(v * opacity).toFixed(2); }

                    var effectColors = isDark === null ? {
                        hi: custom, mid: custom, edge: 'transparent',
                        bdr: custom, sh: 'rgba(0,0,0,' + a(0.12) + ')', shIn: custom, dot: custom
                    } : isDark ? {
                        hi: 'rgba(255,255,255,' + a(0.65) + ')',
                        mid: 'rgba(255,255,255,' + a(0.22) + ')',
                        edge: 'rgba(0,0,0,' + a(0.08) + ')',
                        bdr: 'rgba(255,255,255,' + a(0.50) + ')',
                        sh: 'rgba(0,0,0,' + a(0.18) + ')',
                        shIn: 'rgba(255,255,255,' + a(0.45) + ')',
                        dot: 'rgba(255,255,255,' + a(0.70) + ')'
                    } : {
                        hi: 'rgba(0,0,0,' + a(0.14) + ')',
                        mid: 'rgba(0,0,0,' + a(0.06) + ')',
                        edge: 'rgba(255,255,255,' + a(0.35) + ')',
                        bdr: 'rgba(0,0,0,' + a(0.12) + ')',
                        sh: 'rgba(0,0,0,' + a(0.08) + ')',
                        shIn: 'rgba(255,255,255,' + a(0.65) + ')',
                        dot: 'rgba(255,255,255,' + a(0.75) + ')'
                    };

                    if (effect === 'bubble') {
                        hdrTop.querySelectorAll('.nbl-hdr-blob-v1').forEach(function (el) {
                            el.style.background = 'radial-gradient(circle at 32% 28%,' + effectColors.hi + ' 0%,' + effectColors.mid + ' 38%,' + effectColors.edge + ' 72%,transparent 100%)';
                            el.style.boxShadow = 'inset -2px -2px 5px ' + effectColors.sh + ',inset 2px 2px 4px ' + effectColors.shIn + ',0 4px 12px ' + effectColors.sh;
                            el.style.border = '1px solid ' + effectColors.bdr;
                            var blobDotElement = el.querySelector('.nbl-hdr-blob-dot-v1');
                            if (blobDotElement) blobDotElement.style.background = effectColors.dot;
                        });
                    }

                    if (effect === 'drop') {
                        hdrTop.querySelectorAll('.nbl-hdr-drop-v1').forEach(function (el) {
                            el.style.background = 'radial-gradient(ellipse at 35% 25%,' + effectColors.hi + ' 0%,transparent 42%),radial-gradient(ellipse at 60% 65%,' + effectColors.mid + ' 0%,transparent 75%)';
                            el.style.border = '1px solid ' + effectColors.bdr;
                            el.style.boxShadow = '0 5px 14px ' + effectColors.sh + ',inset 0 -2px 4px ' + effectColors.mid;
                        });
                    }

                    if (effect === 'wave') {
                        var waveColors = isDark === null
                            ? [custom, custom, custom]
                            : isDark
                                ? ['rgba(255,255,255,' + a(0.22) + ')', 'rgba(255,255,255,' + a(0.13) + ')', 'rgba(255,255,255,' + a(0.07) + ')']
                                : ['rgba(0,0,0,' + a(0.12) + ')', 'rgba(0,0,0,' + a(0.07) + ')', 'rgba(0,0,0,' + a(0.04) + ')'];
                        hdrTop.querySelectorAll('.nbl-hdr-wave-v1').forEach(function (el, i) {
                            el.style.background = waveColors[i] || waveColors[0];
                        });
                    }

                    if (effect === 'ripple') {
                        var anchor = hdrTop.querySelector('.nbl-hdr-ripple-canvas-v1');
                        if (!anchor || anchor._init) return;
                        anchor._init = true;

                        var rippleCanvas = document.createElement('canvas');
                        rippleCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;';
                        anchor.appendChild(rippleCanvas);
                        var rippleContext = rippleCanvas.getContext('2d');
                        var rings = [];
                        var rippleColorRGB = (isDark === null || isDark) ? '255,255,255' : '0,0,0';

                        function sizeCanvas() {
                            rippleCanvas.width = hdrTop.offsetWidth || 390;
                            rippleCanvas.height = hdrTop.offsetHeight || 90;
                        }
                        sizeCanvas();
                        window.addEventListener('resize', sizeCanvas, { passive: true });

                        function spawnRipple(x, y, maxR) {
                            rings.push({ x: x, y: y, r: 1, maxR: maxR, life: 1 });
                        }

                        function spawnBatch() {
                            var canvasWidth = rippleCanvas.width, canvasHeight = rippleCanvas.height;
                            if (canvasWidth < 1 || canvasHeight < 1) return;
                            var count = 1 + Math.floor(Math.random() * 2);
                            for (var i = 0; i < count; i++) {
                                spawnRipple(
                                    20 + Math.random() * (canvasWidth - 40),
                                    8 + Math.random() * (canvasHeight - 16),
                                    10 + Math.random() * 34
                                );
                            }
                        }

                        (function initialBurst() {
                            var canvasWidth = rippleCanvas.width, canvasHeight = rippleCanvas.height;
                            if (canvasWidth < 1 || canvasHeight < 1) { setTimeout(initialBurst, 100); return; }
                            for (var i = 0; i < 4; i++) {
                                setTimeout(function () { spawnBatch(); }, i * 180);
                            }
                        })();

                        function autoSpawn() {
                            spawnBatch();
                            setTimeout(autoSpawn, 400 + Math.random() * 700);
                        }
                        setTimeout(autoSpawn, 750);

                        (function rLoop() {
                            rippleContext.clearRect(0, 0, rippleCanvas.width, rippleCanvas.height);
                            for (var i = rings.length - 1; i >= 0; i--) {
                                var rippleRing = rings[i];
                                rippleRing.r += (rippleRing.maxR - rippleRing.r) * 0.08;
                                rippleRing.life -= 0.022;
                                if (rippleRing.life <= 0) { rings.splice(i, 1); continue; }
                                for (var n = 0; n < 3; n++) {
                                    var ringRadius = rippleRing.r * (1 - n * 0.3);
                                    if (ringRadius < 1) continue;
                                    rippleContext.beginPath();
                                    rippleContext.arc(rippleRing.x, rippleRing.y, ringRadius, 0, Math.PI * 2);
                                    rippleContext.strokeStyle = 'rgba(' + rippleColorRGB + ',' + (rippleRing.life * opacity * 0.5 * (1 - n * 0.3)) + ')';
                                    rippleContext.lineWidth = (1.8 - n * 0.4) * rippleRing.life;
                                    rippleContext.stroke();
                                }
                            }
                            requestAnimationFrame(rLoop);
                        })();
                    }

                    requestAnimationFrame(function () {
                        requestAnimationFrame(function () {
                            hdrTop.classList.add('nbl-hdr-animated-v1');
                        });
                    });
                })();
            });
        }

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 3: DOM HELPERS
        // ─────────────────────────────────────────────────────────────────────────

        loyaltyApp.getNavItems = function () { return document.querySelectorAll('.nbl-wh-nav-scroll-v1 .nbl-nav-item-v1, .nbl-wh-nav-wrapper-v1 > .nbl-nav-item-v1'); };
        loyaltyApp.getTabItems = function () { return document.querySelectorAll('.nbl-tab-item-v1'); };
        loyaltyApp.getWidgetContainer = function () { return document.querySelector('.nbl-widget-container-v1'); };
        loyaltyApp.getPointsElements = function () { return document.querySelectorAll('.nbl-customer-points-v1'); };

        loyaltyApp.getTargetElement = function (target, cls) {
            if (!target) return null;
            if (target.classList && target.classList.contains(cls)) return target;
            return target.closest ? target.closest('.' + cls) : null;
        };

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 4: WIDGET OPEN / CLOSE
        // ─────────────────────────────────────────────────────────────────────────

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

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 4b: widget:first-open — fires exactly once on the first open
        // All heavy modules subscribe here instead of dom:loaded, so they never
        // boot until the user actually opens the widget for the first time.
        // bus.once() removes this listener automatically after it fires once —
        // no flag variable needed.
        // ─────────────────────────────────────────────────────────────────────────

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

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 5: NAVIGATION
        // setActiveNavigation emits tab:activated so every tab module can
        // subscribe and lazy-render itself on first visit.
        // ─────────────────────────────────────────────────────────────────────────

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

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 6: POINTS DISPLAY
        // ─────────────────────────────────────────────────────────────────────────

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

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 7: HOME TAB — accordion toggles
        // ─────────────────────────────────────────────────────────────────────────

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

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 8: COMPACT HEADER ON SCROLL
        // Initialises on widget:first-open — no need to attach scroll listener
        // before the user has ever opened the widget.
        // ─────────────────────────────────────────────────────────────────────────

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

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 8b: NAV CHEVRONS
        // Initialises on widget:first-open.
        // ─────────────────────────────────────────────────────────────────────────

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

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 9: RENDER — EARN POINTS LIST
        // Lazy-renders on first visit to the 'points' tab.
        // Re-renders on points:update only after the tab has been visited.
        // ─────────────────────────────────────────────────────────────────────────

        loyaltyApp.tab = loyaltyApp.tab || {};

        loyaltyApp.tab.renderEarnPointsList = function () {
            var container = document.querySelector('.nbl-points-list-v1');
            if (!container) return;

            var pointRules = (appConfig.pointRules || []).filter(function (r) { return r.isActive; });
            var currencySymbol = (appConfig.shop && appConfig.shop.currencySymbol) || '$';

            function buildLabel(rule) {
                var type = rule.event && rule.event.type;
                var ruleConditions = rule.conditions || {};
                // ORDER: conditions.order, REFERRAL: conditions.referral, REVIEW: conditions.review
                var order = ruleConditions.order || {};
                var referralConditions = ruleConditions.referral || {};
                var review = ruleConditions.review || {};

                if (type === 'REVIEW') {
                    // review.text/image/video are now objects { isActive, points }
                    var parts = [];
                    if (review.text && review.text.isActive && review.text.points > 0)
                        parts.push(formatPoints(review.text.points) + ' for text review');
                    if (review.image && review.image.isActive && review.image.points > 0)
                        parts.push(formatPoints(review.image.points) + ' for photo review');
                    if (review.video && review.video.isActive && review.video.points > 0)
                        parts.push(formatPoints(review.video.points) + ' for video review');
                    return parts.join('. ') || 'Earn points for reviews';
                }

                if (type === 'ORDER') {
                    // conditions.order replaces conditions.earning
                    if (order.type === 'incremental' && order.rate)
                        return 'Get ' + formatPoints(order.rate.points) + ' for every ' + currencySymbol + formatNumber(order.rate.amount) + ' spent';
                    if (order.type === 'fixed')
                        return 'Get ' + formatPoints(order.fixedPoints) + ' for every order';
                }

                if (type === 'REFERRAL') {
                    var referrer = referralConditions.referrer || {};
                    var referred = referralConditions.referred || {};
                    var trigger = referralConditions.trigger || 'oneTime';
                    var p2 = [];
                    // referrer.points replaces referrer.firstOrderPoints
                    if (trigger === 'subscription') {
                        if (referrer.points > 0)
                            p2.push('Earn ' + formatPoints(referrer.points) + ' when your friend places their first subscription order');
                        if (referrer.allowRenewalReward && referrer.renewalPoints > 0)
                            p2.push('Earn ' + formatPoints(referrer.renewalPoints) + ' for each renewal');
                    } else if (trigger === 'both') {
                        if (referrer.points > 0)
                            p2.push('Earn ' + formatPoints(referrer.points) + ' when your friend places their first order');
                        if (referrer.allowRenewalReward && referrer.renewalPoints > 0)
                            p2.push('Earn ' + formatPoints(referrer.renewalPoints) + ' for each subscription renewal');
                    } else {
                        // oneTime
                        if (referrer.points > 0)
                            p2.push('Earn ' + formatPoints(referrer.points) + ' when your friend makes their first one-time purchase');
                    }
                    if (referred.discountValue) {
                        var discountOrderNote = trigger === 'subscription'
                            ? ' on their first subscription order'
                            : trigger === 'both'
                                ? ' on their first order'
                                : ' on their first one-time purchase';
                        p2.push('Your friend gets ' + formatDiscount(referred.discountValue, referred.discountType, currencySymbol) + discountOrderNote);
                    }
                    return p2.length ? p2.join('. ') : 'Earn points by referring friends';
                }

                return 'Earn ' + formatPoints(order.fixedPoints || rule.pointsCost || 0) + ' for completing this action';
            }

            function buildPointsText(rule) {
                var type = rule.event && rule.event.type;
                var ruleConditions = rule.conditions || {};
                // ORDER: conditions.order, REFERRAL: conditions.referral, REVIEW: conditions.review
                var order = ruleConditions.order || {};
                var referralConditions = ruleConditions.referral || {};
                var review = ruleConditions.review || {};

                if (type === 'REVIEW') {
                    // review.text/image/video are now objects { isActive, points }
                    var reviewPointParts = [];
                    if (review.text && review.text.isActive && review.text.points > 0)
                        reviewPointParts.push(formatPoints(review.text.points) + ' text');
                    if (review.image && review.image.isActive && review.image.points > 0)
                        reviewPointParts.push(formatPoints(review.image.points) + ' photo');
                    if (review.video && review.video.isActive && review.video.points > 0)
                        reviewPointParts.push(formatPoints(review.video.points) + ' video');
                    return reviewPointParts.join(' · ') || '—';
                }

                if (type === 'REFERRAL') {
                    // referrer.points replaces referrer.firstOrderPoints
                    var referrer = referralConditions.referrer || {};
                    var trigger = referralConditions.trigger || 'oneTime';
                    if (trigger === 'subscription' || trigger === 'both') {
                        var pointParts = [];
                        if (referrer.points > 0)
                            pointParts.push(formatPoints(referrer.points) + ' (first subscription order)');
                        if (referrer.allowRenewalReward && referrer.renewalPoints > 0)
                            pointParts.push(formatPoints(referrer.renewalPoints) + ' (renewals)');
                        return pointParts.length ? pointParts.join(' + ') : '—';
                    }
                    // oneTime
                    if (referrer.points > 0)
                        return formatPoints(referrer.points) + ' (one-time purchase)';
                    return '—';
                }

                if (type === 'ORDER') {
                    // conditions.order replaces conditions.earning
                    if (order.type === 'incremental' && order.rate)
                        return formatPoints(order.rate.points) + ' per ' + currencySymbol + formatNumber(order.rate.amount);
                    if (order.type === 'fixed')
                        return formatPoints(order.fixedPoints) + ' per order';
                }

                return formatPoints(order.fixedPoints || rule.pointsCost || 0);
            }

            var ICON_MAP = { REVIEW: 'review', REFERRAL: 'referral', ORDER: 'purchase' };

            if (!pointRules.length) {
                container.innerHTML = '<div class="nbl-hta-rewards-empty-v1">No earn rules available</div>';
                return;
            }

            if (!pointRules.length) {
                container.innerHTML = '<div class="nbl-hta-rewards-empty-v1">No earn rules available</div>';
                return;
            }

            container.innerHTML = pointRules.map(function (rule) {
                var type = rule.event && rule.event.type;
                var title = escapeText(rule.event && rule.event.name || rule.title || 'Earn Points');
                var label = buildLabel(rule);
                return `
                    <div class="nbl-points-item-v1" data-rule-id="${rule.id}" data-label="${escapeAttribute(label)}">
                        <div class="nbl-points-icon-v1">${icon(ICON_MAP[type] || 'earn-points')}</div>
                        <div class="nbl-points-content-v1">
                            <div class="nbl-points-title-v1">${title}</div>
                            <div class="nbl-points-points-v1">${buildPointsText(rule)}</div>
                        </div>
                        <div class="nbl-points-action-v1">
                            <div class="nbl-points-chevron-icon">${icon('chevron-right')}</div>
                        </div>
                    </div>`;
            }).join('');
        };

        // ── Tab first-visit guards ────────────────────────────────────────────
        // Instead of a manual _tabVisited flag object, each tab uses
        // bus.once('tab:first-visit:<key>') to register a one-shot render.
        // bus.once() removes the handler automatically after it fires, so
        // there is no persistent flag and no per-event if-check overhead.
        //
        // Re-renders triggered by data changes (points:update, reward:add, etc.)
        // use a separate visited flag emitted as a sticky event so they only
        // re-render after the tab has been seen at least once.
        //
        // How it works:
        //   tab:activated fires on every nav click.
        //   It emits tab:first-visit:<key> (once per tab, via bus.once guard).
        //   tab:first-visit:<key> listeners render the tab content.
        //   tab:visited:<key>  is emitted sticky so data-change listeners
        //   can check hasListeners() — or simply subscribe after first visit.

        eventBus.on('tab:activated', function (data) {
            if (!data || !data.tab) return;
            // Emit tab:first-visit:<key> the first time this tab is activated.
            // The once-wrapper on the listener (set up per tab below) ensures
            // this only triggers a render once.
            eventBus.emit('tab:activated:' + data.tab, data);
        });

        // ── Earn Points tab ──────────────────────────────────────────────────

        /**
         * @listens tab:activated:points (once)
         * Renders the Earn Points list on the first visit to that tab.
         * Automatically removed after firing — no flag needed.
         */
        eventBus.once('tab:activated:points', function () {
            loyaltyApp.tab.renderEarnPointsList();
            // Sticky: marks this tab as visited so points:update can re-render.
            /** @fires tab:visited:points */
            eventBus.emitSticky('tab:visited:points', true);
        });

        /**
         * @listens points:update
         * Re-renders earn list only after the points tab has been visited.
         * Subscribes to tab:visited:points (sticky) — if it already fired,
         * this handler runs immediately on subscribe, registering the re-render.
         */
        eventBus.on('tab:visited:points', function () {
            // This handler is called once when the sticky fires (tab first visit),
            // then we set up the ongoing points:update re-render subscription.
            eventBus.on('points:update', function () {
                loyaltyApp.tab.renderEarnPointsList();
            });
        });

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 10: RENDER — REWARD LIST
        // Lazy-renders on first visit to 'rewards' tab.
        // ─────────────────────────────────────────────────────────────────────────

        loyaltyApp.tab.renderRewardList = function () {
            var wrapper = document.querySelector('.nbl-reward-list-v1');
            if (!wrapper) return;

            var customerPoints = getPoints();
            var rules = appConfig.rewardRules || [];

            if (!rules.length) {
                wrapper.innerHTML = '<div class="nbl-hta-rewards-empty-v1">No rewards available</div>';
                return;
            }

            wrapper.innerHTML = rules.map(function (reward) {
                var isFixed = reward.discountType === 'fixed';
                var title = 'Voucher ' + (isFixed ? '$' : '') + reward.rewardValue + (isFixed ? '' : '%');
                var cost = Number(reward.pointsCost) || 0;
                var canRedeem = cost > 0 && customerPoints >= cost;

                return `
                    <div class="nbl-reward-item-v1 ${canRedeem ? 'active' : 'inactive'}"
                         data-reward-rule-id="${reward.id}" data-title="${escapeAttribute(title)}">
                        <div class="nbl-reward-icon-v1">${icon('reward-discount')}</div>
                        <div class="nbl-reward-content-v1">
                            <div class="nbl-reward-title-v1">${escapeText(title)}</div>
                            <div class="nbl-reward-points-v1">${formatNumber(cost)} points</div>
                        </div>
                        <div class="nbl-reward-action-v1">
                            <button class="nbl-reward-btn-v1" ${canRedeem ? '' : 'disabled'}>
                                ${canRedeem
                        ? `<div class="nbl-reward-chevron-icon">${icon('chevron-right')}</div>`
                        : '<span class="nbl-reward-status-text">Not enough points</span>'
                    }
                            </button>
                        </div>
                    </div>`;
            }).join('');
        };

        // ── Rewards tab ──────────────────────────────────────────────────────

        /**
         * @listens tab:activated:rewards (once)
         * Renders the Rewards list on the first visit to that tab.
         */
        eventBus.once('tab:activated:rewards', function () {
            loyaltyApp.tab.renderRewardList();
            /** @fires tab:visited:rewards */
            eventBus.emitSticky('tab:visited:rewards', true);
        });

        /**
         * @listens tab:visited:rewards (sticky)
         * Once the rewards tab has been seen, register ongoing re-render
         * listeners for points:update and reward:rule:add.
         */
        eventBus.on('tab:visited:rewards', function () {
            eventBus.on('points:update', function () {
                loyaltyApp.tab.renderRewardList();
            });
        });

        /**
         * @listens reward:rule:add { id, rewardValue, discountType, pointsCost }
         * Appends a new rule at runtime and re-renders only if tab has been visited.
         */
        eventBus.on('reward:rule:add', function (rule) {
            if (!rule || !rule.id) return;
            appConfig.rewardRules = appConfig.rewardRules || [];
            var exists = appConfig.rewardRules.some(function (existingRule) { return existingRule.id === rule.id; });
            if (!exists) appConfig.rewardRules.push(rule);
            // Re-render only if the tab has been visited — tab:visited:rewards
            // is sticky so hasListeners() returns true after first visit.
            if (eventBus.hasListeners('tab:visited:rewards')) loyaltyApp.tab.renderRewardList();
        });

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 10b: RENDER — PRIZES TAB
        // ─────────────────────────────────────────────────────────────────────────

        loyaltyApp.tab.renderPrizeList = function () {
            var wrapper = document.querySelector('.nbl-prize-list-v1');
            if (!wrapper) return;

            var customerPoints = getPoints();
            var prizes = (appConfig.physicalPrizes || []).filter(function (p) { return p.isActive; });

            if (!prizes.length) {
                wrapper.innerHTML = '<div class="nbl-hta-rewards-empty-v1">' + lbl('emptyPrizes') + '</div>';
                return;
            }

            wrapper.innerHTML = prizes.map(function (prize) {
                var cost = Number(prize.pointsCost) || 0;
                var canClaim = cost > 0 && customerPoints >= cost;
                var imageHTML = prize.imageUrl
                    ? '<img class="nbl-prize-img-v1" src="' + escapeAttribute(prize.imageUrl) + '" alt="' + escapeAttribute(prize.title) + '" />'
                    : '<div class="nbl-prize-img-placeholder-v1">' + icon('reward-discount') + '</div>';

                return '<div class="nbl-prize-item-v1 ' + (canClaim ? 'active' : 'inactive') + '"'
                    + ' data-prize-id="' + prize.id + '"'
                    + ' data-title="' + escapeAttribute(prize.title) + '"'
                    + ' data-cost="' + cost + '">'
                    + '<div class="nbl-prize-img-wrap-v1">' + imageHTML + '</div>'
                    + '<div class="nbl-reward-content-v1">'
                    + '<div class="nbl-reward-title-v1">' + escapeText(prize.title) + '</div>'
                    + '<div class="nbl-reward-points-v1">' + formatNumber(cost) + ' pts</div>'
                    + '</div>'
                    + '<div class="nbl-prize-action-v1">'
                    + (canClaim
                        ? '<div class="nbl-reward-chevron-icon">' + icon('chevron-right') + '</div>'
                        : '<span class="nbl-reward-status-text nbl-prize-status-insufficient-v1">Not enough pts</span>')
                    + '</div>'
                    + '</div>';
            }).join('');
        };

        // ── Shared prize claim item builder ───────────────────────────────────
        function buildPrizeClaimItemHTML(claim, extraClass) {
            var prize = (appConfig.physicalPrizes || []).find(function (p) { return Number(p.id) === Number(claim.physicalPrizeId); });
            var title = prize ? prize.title : `Prize request #${claim.id}`;
            var imageHTML = prize && prize.imageUrl
                ? `<img class="nbl-prize-req-img-v1" src="${escapeAttribute(prize.imageUrl)}" alt="${escapeAttribute(title)}" />`
                : `<div class="nbl-prize-req-img-placeholder-v1">${icon('reward-discount')}</div>`;
            var pointsHTML = claim.pointsCost
                ? `<span class="nbl-prize-req-points-v1">${formatNumber(claim.pointsCost)} pts</span>`
                : '';
            var statusLabels = {
                PENDING: lbl('prizeStatusPending'),
                FULFILLED: lbl('prizeStatusFulfilled'),
                COMPLETED: lbl('prizeStatusCompleted'),
                CANCELLED: lbl('prizeStatusCancelled'),
            };
            var status = statusLabels[claim.status] || claim.status;
            var statusKey = (claim.status || 'pending').toLowerCase();

            return `<div class="${extraClass} nbl-my-prize-item-v1 nbl-clickable-v1"
                data-prize-claim-id="${claim.id}"
                data-prize-title="${escapeAttribute(title)}"
                data-prize-status="${claim.status || 'PENDING'}"
                data-prize-cost="${claim.pointsCost || 0}"
                data-prize-value="${prize && prize.productValue ? prize.productValue : ''}"
                data-prize-img-url="${escapeAttribute(prize && prize.imageUrl ? prize.imageUrl : '')}"
                data-prize-created="${escapeAttribute(claim.createdAt || '')}"
                data-prize-fulfilled="${escapeAttribute(claim.fulfilledAt || '')}"
                data-prize-completed="${escapeAttribute(claim.completedAt || '')}"
                data-prize-admin-note="${escapeAttribute(claim.adminNote || '')}"
                data-prize-tracking="${escapeAttribute(claim.trackingInfo || '')}">
                <div class="nbl-prize-req-img-wrap-v1">${imageHTML}</div>
                <div class="nbl-prize-req-info-v1">
                    <span class="nbl-prize-request-title-v1">${escapeText(title)}</span>
                    ${pointsHTML}
                </div>
                <span class="nbl-prize-request-status-v1 nbl-prize-status-${statusKey}-v1">${status}</span>
            </div>`;
        }

        loyaltyApp.tab.renderHomePrizeRequests = function () {
            var listEl = document.querySelector('.nbl-prize-requests-list-v1');
            if (!listEl) return;
            var claims = loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.prizeClaims;
            if (!claims || !claims.length) {
                listEl.innerHTML = `<div class="nbl-hta-rewards-empty-v1">${lbl('emptyMyPrizes')}</div>`;
                return;
            }
            function renderPage(items) {
                listEl.innerHTML = items.map(function (claim) {
                    return buildPrizeClaimItemHTML(claim, 'nbl-prize-request-item-v1');
                }).join('');
            }
            loyaltyApp.pagination.init('home-prize-requests', claims, WIDGET_CONFIG.homePrizeRequestsPerPage || 5, renderPage);
        };

        // ── Prizes tab event wiring ───────────────────────────────────────────

        eventBus.once('tab:activated:prizes', function () {
            loyaltyApp.tab.renderPrizeList();
            eventBus.emitSticky('tab:visited:prizes', true);
        });

        eventBus.on('tab:visited:prizes', function () {
            eventBus.on('points:update', function () {
                loyaltyApp.tab.renderPrizeList();
            });
        });

        // ── My Prizes tab ─────────────────────────────────────────────────────

        loyaltyApp.tab.renderMyPrizesTab = function () {
            var wrapper = document.querySelector('.nbl-my-prizes-wrapper-v1');
            if (!wrapper) return;
            var claims = loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.prizeClaims;
            if (!claims || !claims.length) {
                wrapper.innerHTML = `<div class="nbl-hta-rewards-empty-v1">${lbl('emptyMyPrizes')}</div>`;
                return;
            }
            function renderPage(items) {
                wrapper.innerHTML = items.map(function (claim) {
                    return buildPrizeClaimItemHTML(claim, '');
                }).join('');
            }
            loyaltyApp.pagination.init('my-prizes', claims, WIDGET_CONFIG.myPrizesPerPage || 8, renderPage);
        };

        eventBus.once('tab:activated:my-prizes', function () {
            loyaltyApp.tab.renderMyPrizesTab();
            eventBus.emitSticky('tab:visited:my-prizes', true);
        });

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 11: RENDER — HOME ACTIVE REWARDS
        // Lazy-renders on widget:first-open.
        // ─────────────────────────────────────────────────────────────────────────

        loyaltyApp.tab.renderHomeActiveRewardList = function (latestVoucher) {
            if (!WIDGET_CONFIG.showHomeRewardsSection) return;
            var listEl = document.querySelector('.nbl-hta-reward-list-v1');
            if (!listEl) return;

            if (loyaltyApp.customer && !loyaltyApp.customer.config) loyaltyApp.customer.config = {};
            if (loyaltyApp.customer && !loyaltyApp.customer.config.rewards) loyaltyApp.customer.config.rewards = [];

            var customerRewards = (loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.rewards) || [];
            var active = customerRewards.filter(function (r) { return r.discountUsed === false && r.status === 'ACTIVE'; });

            if (latestVoucher && latestVoucher.code) {
                var codes = {};
                active.forEach(function (r) { codes[r.code] = true; });
                if (!codes[latestVoucher.code]) {
                    var newReward = { code: latestVoucher.code, title: latestVoucher.title || 'Voucher', status: 'ACTIVE', discountUsed: false, createdAt: new Date().toISOString() };
                    if (loyaltyApp.customer && loyaltyApp.customer.config) loyaltyApp.customer.config.rewards.push(newReward);
                    active.push(newReward);
                }
            }

            function renderPage(items) {
                if (!items.length) { listEl.innerHTML = '<div class="nbl-hta-rewards-empty-v1">' + lbl('emptyRewards') + '</div>'; return; }
                listEl.innerHTML = items.map(function (r) {
                    return '<div class="nbl-hta-reward-item-v1" data-voucher="' + escapeAttribute(r.code) + '">' +
                        '<div class="nbl-hta-reward-icon-v1">' + icon('reward-discount') + '</div>' +
                        '<div class="nbl-hta-reward-content-v1"><div class="nbl-hta-reward-title-v1">' + escapeText(r.title || 'Voucher') + '</div></div>' +
                        '<div class="nbl-hta-reward-action-v1"><div class="nbl-hta-reward-chevron-icon">' + icon('chevron-right') + '</div></div>' +
                        '</div>';
                }).join('');
            }

            if (!active.length) { renderPage([]); return; }
            if (latestVoucher) {
                loyaltyApp.pagination.update('home-rewards', active);
            } else {
                loyaltyApp.pagination.init('home-rewards', active, WIDGET_CONFIG.homeRewardsPerPage, renderPage);
            }
        };

        /**
         * @listens widget:first-open
         * Initial render of Active Rewards on the Home tab.
         */
        eventBus.on('widget:first-open', function () { loyaltyApp.tab.renderHomeActiveRewardList(); });
        eventBus.on('widget:first-open', function () { loyaltyApp.tab.renderHomePrizeRequests(); });

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 12: RENDER — HOME ACCOUNT ACTIVITIES
        // Lazy-renders on widget:first-open.
        // ─────────────────────────────────────────────────────────────────────────

        loyaltyApp.tab.renderHomeAccountTransactionActivities = function () {
            if (!WIDGET_CONFIG.showHomeActivitiesSection) return;
            var listWrapper = document.querySelector('.nbl-haTa-list-wrapper-v1');
            if (!listWrapper) return;
            var transactions = (loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.transactions) || [];
            function renderPage(items, prevLoaded) {
                if (!items.length) { listWrapper.innerHTML = '<div class="nbl-haTa-list-empty-v1">' + lbl('emptyActivity') + '</div>'; return; }
                prevLoaded = prevLoaded || 0;
                listWrapper.innerHTML = items.map(function (t, i) {
                    var isNew = i >= prevLoaded;
                    return '<div class="nbl-haTa-list-v1' + (isNew ? ' nbl-item-new-v1' : '') + '">' +
                        '<div class="nbl-haTa-list-item-v1">' + formatDate(t.createdAt) + '</div>' +
                        '<div class="nbl-haTa-list-item-v1">' + escapeText(t.activity || t.reason || '—') + '</div>' +
                        '<div class="nbl-haTa-list-item-v1">' + formatPointsDisplay(t.points) + '</div>' +
                        '</div>';
                }).join('');
            }
            if (!transactions.length) { renderPage([]); return; }
            loyaltyApp.pagination.init('home-activities', transactions, WIDGET_CONFIG.homeActivitiesPerPage, renderPage);
        };

        /**
         * @listens widget:first-open
         * Initial render of Recent Activity on the Home tab.
         */
        eventBus.on('widget:first-open', function () { loyaltyApp.tab.renderHomeAccountTransactionActivities(); });

        /**
         * @listens reward:add { code, title?, createdAt?, position? }
         * Adds a new voucher to Home + My Rewards tab at runtime.
         */
        eventBus.on('reward:add', function (voucher) {
            if (!voucher || !voucher.code) return;

            if (loyaltyApp.customer && !loyaltyApp.customer.config) loyaltyApp.customer.config = {};
            if (loyaltyApp.customer && !loyaltyApp.customer.config.rewards) loyaltyApp.customer.config.rewards = [];

            var rewards = loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.rewards;
            if (rewards) {
                var alreadyExists = rewards.some(function (r) { return r.code === voucher.code; });
                if (!alreadyExists) {
                    var newReward = {
                        code: voucher.code,
                        title: voucher.title || 'Voucher',
                        status: 'ACTIVE',
                        discountUsed: false,
                        createdAt: voucher.createdAt || new Date().toISOString()
                    };
                    if (voucher.position === 'append') {
                        rewards.push(newReward);
                    } else {
                        rewards.unshift(newReward);
                    }
                }
            }

            loyaltyApp.tab.renderHomeActiveRewardList({ code: voucher.code, title: voucher.title || 'Voucher' });
            // Re-render full tab only if it has been visited. tab:visited:active-rewards
            // is a sticky event — hasListeners() returns true after the first visit.
            if (eventBus.hasListeners('tab:visited:active-rewards')) {
                loyaltyApp.tab.renderFullActiveRewards && loyaltyApp.tab.renderFullActiveRewards();
            }
        });

        /**
         * @listens activity:add { activity, points, createdAt, position? }
         * Inserts a new transaction into Home + Activity tab at runtime.
         */
        eventBus.on('activity:add', function (entry) {
            if (!entry) return;
            if (loyaltyApp.customer && !loyaltyApp.customer.config) loyaltyApp.customer.config = {};
            if (loyaltyApp.customer && !loyaltyApp.customer.config.transactions) loyaltyApp.customer.config.transactions = [];

            var newEntry = {
                activity: entry.activity || entry.reason || 'Activity',
                points: Number(entry.points) || 0,
                createdAt: entry.createdAt || new Date().toISOString()
            };

            var prepend = entry.position !== 'append';
            if (loyaltyApp.customer && loyaltyApp.customer.config) {
                if (prepend) {
                    loyaltyApp.customer.config.transactions.unshift(newEntry);
                } else {
                    loyaltyApp.customer.config.transactions.push(newEntry);
                }
            }

            loyaltyApp.tab.renderHomeAccountTransactionActivities();
            // Re-render full tab only if it has been visited.
            if (eventBus.hasListeners('tab:visited:activities')) {
                loyaltyApp.tab.renderFullActivities && loyaltyApp.tab.renderFullActivities();
            }
        });

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 12b: REUSABLE PAGINATION ENGINE
        // ─────────────────────────────────────────────────────────────────────────

        loyaltyApp.pagination = (function () {
            var instances = {};

            function getEl(key) {
                return document.querySelector('.nbl-pagination-v1[data-pagination="' + key + '"]');
            }

            function getMode() {
                return WIDGET_CONFIG.paginationMode === 'loadmore' ? 'loadmore' : 'pagination';
            }

            function init(key, items, perPage, renderFn) {
                perPage = perPage || 5;
                var totalPages = Math.max(1, Math.ceil(items.length / perPage));
                instances[key] = {
                    items: items,
                    perPage: perPage,
                    page: 1,
                    totalPages: totalPages,
                    renderFn: renderFn,
                    loaded: perPage
                };
                buildUI(key);
                render(key);
            }

            function update(key, items) {
                var paginationInstance = instances[key]; if (!paginationInstance) return;
                paginationInstance.items = items;
                paginationInstance.totalPages = Math.max(1, Math.ceil(items.length / paginationInstance.perPage));
                paginationInstance.page = Math.min(paginationInstance.page, paginationInstance.totalPages);
                paginationInstance.loaded = paginationInstance.perPage;
                render(key);
            }

            function buildUI(key) {
                var el = getEl(key); if (!el) return;
                if (el.dataset.pgBound) return;
                el.dataset.pgBound = '1';

                var mode = (instances[key] && instances[key].forceMode)
                    || el.dataset.pgMode
                    || getMode();

                if (mode === 'loadmore') {
                    el.querySelector('.nbl-loadmore-btn-v1').addEventListener('click', function () {
                        var paginationInstance = instances[key]; if (!paginationInstance) return;
                        if (paginationInstance.loaded >= paginationInstance.items.length) return;
                        setLoadingState(el, true);
                        setTimeout(function () {
                            paginationInstance.loaded = Math.min(paginationInstance.loaded + paginationInstance.perPage, paginationInstance.items.length);
                            renderLoadMore(key);
                            setLoadingState(el, false);
                            updateLoadMoreUI(key);
                        }, 520);
                    });
                } else {
                    el.querySelector('.nbl-pagination-prev-v1').addEventListener('click', function () {
                        var paginationInstance = instances[key]; if (!paginationInstance || paginationInstance.page <= 1) return;
                        paginationInstance.page--; render(key);
                    });
                    el.querySelector('.nbl-pagination-next-v1').addEventListener('click', function () {
                        var paginationInstance = instances[key]; if (!paginationInstance || paginationInstance.page >= paginationInstance.totalPages) return;
                        paginationInstance.page++; render(key);
                    });
                }
            }

            function setLoadingState(el, loading) {
                var loadMoreButton = el && el.querySelector('.nbl-loadmore-btn-v1');
                if (!loadMoreButton) return;
                loadMoreButton.classList.toggle('nbl-loadmore-loading-v1', loading);
                loadMoreButton.disabled = loading;
            }

            function renderLoadMore(key) {
                var paginationInstance = instances[key]; if (!paginationInstance) return;
                var allItems = paginationInstance.items.slice(0, paginationInstance.loaded);
                var prevLoaded = paginationInstance.loaded - paginationInstance.perPage;
                paginationInstance.renderFn(allItems, prevLoaded);
            }

            function updateLoadMoreUI(key) {
                var paginationInstance = instances[key]; if (!paginationInstance) return;
                var el = getEl(key); if (!el) return;
                var loadMoreButton = el.querySelector('.nbl-loadmore-btn-v1');
                if (!loadMoreButton) return;
                var allLoaded = paginationInstance.loaded >= paginationInstance.items.length;
                loadMoreButton.classList.toggle('nbl-loadmore-done-state-v1', allLoaded);
                el.style.display = paginationInstance.items.length <= paginationInstance.perPage ? 'none' : 'flex';
            }

            function render(key) {
                var paginationInstance = instances[key]; if (!paginationInstance) return;
                var mode = paginationInstance.forceMode || getMode();
                if (mode === 'loadmore') {
                    renderLoadMore(key);
                    updateLoadMoreUI(key);
                } else {
                    var start = (paginationInstance.page - 1) * paginationInstance.perPage;
                    paginationInstance.renderFn(paginationInstance.items.slice(start, start + paginationInstance.perPage));
                    updatePaginationUI(key);
                }
            }

            function updatePaginationUI(key) {
                var paginationInstance = instances[key]; if (!paginationInstance) return;
                var el = getEl(key); if (!el) return;
                var prev = el.querySelector('.nbl-pagination-prev-v1');
                var next = el.querySelector('.nbl-pagination-next-v1');
                var dotsRow = el.querySelector('.nbl-pagination-dots-row-v1');

                if (prev) prev.disabled = paginationInstance.page <= 1;
                if (next) next.disabled = paginationInstance.page >= paginationInstance.totalPages;

                if (dotsRow) {
                    if (paginationInstance.totalPages <= 1) {
                        dotsRow.innerHTML = '';
                    } else {
                        var dotMarkup = '';
                        var maxDots = 5;
                        var start = Math.max(1, Math.min(paginationInstance.page - 2, paginationInstance.totalPages - maxDots + 1));
                        var end = Math.min(paginationInstance.totalPages, start + maxDots - 1);
                        for (var i = start; i <= end; i++) {
                            dotMarkup += '<span class="nbl-pg-dot-v1' + (i === paginationInstance.page ? ' active' : '') + '" data-page="' + i + '"></span>';
                        }
                        dotsRow.innerHTML = dotMarkup;
                        dotsRow.querySelectorAll('.nbl-pg-dot-v1').forEach(function (dot) {
                            dot.addEventListener('click', function () {
                                paginationInstance.page = parseInt(dot.dataset.page);
                                render(key);
                            });
                        });
                    }
                }

                el.style.display = paginationInstance.totalPages <= 1 ? 'none' : 'flex';
            }

            function initLoadMore(key, items, perPage, renderFn) {
                perPage = perPage || 5;
                instances[key] = {
                    items: items,
                    perPage: perPage,
                    page: 1,
                    totalPages: Math.max(1, Math.ceil(items.length / perPage)),
                    renderFn: renderFn,
                    loaded: perPage,
                    forceMode: 'loadmore'
                };
                buildUI(key);
                renderLoadMore(key);
                updateLoadMoreUI(key);
            }

            function updateLoadMore(key, items) {
                var paginationInstance = instances[key]; if (!paginationInstance) return;
                paginationInstance.items = items;
                paginationInstance.totalPages = Math.max(1, Math.ceil(items.length / paginationInstance.perPage));
                paginationInstance.loaded = paginationInstance.perPage;
                renderLoadMore(key);
                updateLoadMoreUI(key);
            }

            return { init: init, update: update, initLoadMore: initLoadMore, updateLoadMore: updateLoadMore };
        })();

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 12c: FULL-TAB RENDERS — Activities & Active Rewards
        // Both lazy-render on first visit to their respective tabs.
        // ─────────────────────────────────────────────────────────────────────────

        function formatDate(d) {
            return new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
        }

        function formatPointsDisplay(pts) {
            if (pts > 0) return '<span class="nbl-points-positive">+' + pts + '</span>';
            if (pts < 0) return '<span class="nbl-points-negative">' + pts + '</span>';
            return '<span>' + pts + '</span>';
        }

        loyaltyApp.tab.renderFullActivities = function () {
            var listWrapper = document.querySelector('.nbl-haTa-list-wrapper-full-v1');
            if (!listWrapper) return;
            var transactions = (loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.transactions) || [];
            function renderPage(items, prevLoaded) {
                if (!items.length) { listWrapper.innerHTML = '<div class="nbl-haTa-list-empty-v1">' + lbl('emptyActivity') + '</div>'; return; }
                prevLoaded = prevLoaded || 0;
                listWrapper.innerHTML = items.map(function (t, i) {
                    var isNew = i >= prevLoaded;
                    return '<div class="nbl-haTa-list-v1' + (isNew ? ' nbl-item-new-v1' : '') + '">' +
                        '<div class="nbl-haTa-list-item-v1">' + formatDate(t.createdAt) + '</div>' +
                        '<div class="nbl-haTa-list-item-v1">' + escapeText(t.activity || t.reason || '—') + '</div>' +
                        '<div class="nbl-haTa-list-item-v1">' + formatPointsDisplay(t.points) + '</div>' +
                        '</div>';
                }).join('');
            }
            if (!transactions.length) { renderPage([]); return; }
            loyaltyApp.pagination.init('full-activities', transactions, 10, renderPage);
        };

        loyaltyApp.tab.renderFullActiveRewards = function () {
            var listEl = document.querySelector('.nbl-hta-reward-list-full-v1');
            if (!listEl) return;
            var customerRewards = (loyaltyApp.customer && loyaltyApp.customer.config && loyaltyApp.customer.config.rewards) || [];
            var active = customerRewards.filter(function (r) { return r.discountUsed === false && r.status === 'ACTIVE'; });
            function renderPage(items, prevLoaded) {
                if (!items.length) { listEl.innerHTML = '<div class="nbl-hta-rewards-empty-v1">' + lbl('emptyRewards') + '</div>'; return; }
                prevLoaded = prevLoaded || 0;
                listEl.innerHTML = items.map(function (r, i) {
                    var isNew = i >= prevLoaded;
                    return '<div class="nbl-hta-reward-item-v1' + (isNew ? ' nbl-item-new-v1' : '') + '" data-voucher="' + escapeAttribute(r.code) + '">' +
                        '<div class="nbl-hta-reward-icon-v1">' + icon('reward-discount') + '</div>' +
                        '<div class="nbl-hta-reward-content-v1"><div class="nbl-hta-reward-title-v1">' + escapeText(r.title || 'Voucher') + '</div></div>' +
                        '<div class="nbl-hta-reward-action-v1"><div class="nbl-hta-reward-chevron-icon">' + icon('chevron-right') + '</div></div>' +
                        '</div>';
                }).join('');
            }
            if (!active.length) { renderPage([]); return; }
            loyaltyApp.pagination.init('full-rewards', active, 8, renderPage);
        };

        // ── Activities tab ───────────────────────────────────────────────────

        /**
         * @listens tab:activated:activities (once)
         * Renders the full Activity list on the first visit to that tab.
         */
        eventBus.once('tab:activated:activities', function () {
            loyaltyApp.tab.renderFullActivities();
            /** @fires tab:visited:activities — sticky, used by activity:add to check visibility */
            eventBus.emitSticky('tab:visited:activities', true);
        });

        // ── My Rewards tab ───────────────────────────────────────────────────

        /**
         * @listens tab:activated:active-rewards (once)
         * Renders the full Active Rewards list on the first visit to that tab.
         */
        eventBus.once('tab:activated:active-rewards', function () {
            loyaltyApp.tab.renderFullActiveRewards();
            /** @fires tab:visited:active-rewards — sticky, used by reward:add to check visibility */
            eventBus.emitSticky('tab:visited:active-rewards', true);
        });

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 13: REFERRAL TAB — dynamic reward cards + sharing
        // Lazy-inits on first visit to 'referral' tab.
        // ─────────────────────────────────────────────────────────────────────────

        loyaltyApp.tab.initReferralTab = function () {
            var container = document.getElementById('nbl-referral-rewards');
            var pointRules = appConfig.pointRules || [];
            var refRule = pointRules.find(function (pointRule) { return pointRule.event && pointRule.event.type === 'REFERRAL'; });

            if (container && refRule) {
                var refCond = (refRule.conditions && refRule.conditions.referral) || {};
                var referrer = refCond.referrer || {};
                var referred = refCond.referred || {};
                var trigger = refCond.trigger || 'oneTime';
                var currencySymbol = (appConfig.shop && appConfig.shop.currencySymbol) || '$';
                var isSubscription = trigger === 'subscription' || trigger === 'both';
                var rewardRows = [];

                function rewardRow(who, whoClass, valueText, noteText) {
                    return '<div class="nbl-referral-reward-row-v1 ' + whoClass + '">' +
                        '<div class="nbl-referral-reward-who-v1">' + who + '</div>' +
                        '<div class="nbl-referral-reward-info-v1">' +
                        '<span class="nbl-referral-reward-value-v1">' + valueText + '</span>' +
                        '<span class="nbl-referral-reward-note-v1">' + noteText + '</span>' +
                        '</div>' +
                        '</div>';
                }

                if (isSubscription) {
                    // subscription | both
                    if (referrer.points > 0)
                        rewardRows.push(rewardRow('You', 'nbl-referral-reward-you-v1',
                            formatNumber(referrer.points) + ' points',
                            "When friend places their first subscription order"));
                    if (referrer.allowRenewalReward && referrer.renewalPoints > 0)
                        rewardRows.push(rewardRow('You', 'nbl-referral-reward-you-v1',
                            formatNumber(referrer.renewalPoints) + ' points',
                            'Each time friend renews their subscription'));
                } else {
                    // oneTime
                    if (referrer.points > 0)
                        rewardRows.push(rewardRow('You', 'nbl-referral-reward-you-v1',
                            formatNumber(referrer.points) + ' points',
                            "After friend's first one-time purchase"));
                }

                if (referred.discountValue) {
                    var voucherLabel = referred.discountType === 'percentage'
                        ? referred.discountValue + '% discount voucher'
                        : currencySymbol + formatNumber(referred.discountValue) + ' discount voucher';
                    var orderNote = referred.minimumOrderValue
                        ? 'On orders over ' + currencySymbol + formatNumber(referred.minimumOrderValue)
                        : trigger === 'subscription'
                            ? 'On first subscription order'
                            : trigger === 'both'
                                ? 'On first order'
                                : 'On first one-time purchase';
                    rewardRows.push(rewardRow('Friend', 'nbl-referral-reward-friend-v1', voucherLabel, orderNote));
                    if (isSubscription && referred.allowRenewalReward && referred.renewalPoints > 0)
                        rewardRows.push(rewardRow('Friend', 'nbl-referral-reward-friend-v1',
                            formatNumber(referred.renewalPoints) + ' points',
                            'Each time they renew their subscription'));
                }

                container.innerHTML = rewardRows.length
                    ? '<div class="nbl-referral-reward-list-v1">' + rewardRows.join('') + '</div>'
                    : '';
            }

            var linkInput = document.querySelector('.nbl-referral-link-v1');
            var copyBtn = document.querySelector('.nbl-referral-copy-btn-v1');
            if (linkInput && copyBtn) {
                copyBtn.addEventListener('click', function () {
                    var url = linkInput.value;
                    function afterCopy() {
                        copyBtn.textContent = 'Copied \u2713';
                        setTimeout(function () { copyBtn.textContent = 'Copy'; }, 2000);
                        eventBus.emit('notify:info:open', { payload: { text: 'Referral link copied! Share it with your friends \uD83C\uDF89' } });
                    }
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(url).then(afterCopy).catch(afterCopy);
                    } else {
                        afterCopy();
                    }
                });
            }

            document.querySelectorAll('.nbl-referral-share-btn-v1').forEach(function (shareButton) {
                shareButton.addEventListener('click', function () {
                    var url = linkInput ? linkInput.value : '';
                    var text = 'Use my referral link and get rewards! ' + url;
                    var type = shareButton.dataset.share;
                    if (type === 'whatsapp') window.open('https://wa.me/?text=' + encodeURIComponent(text));
                    if (type === 'email') window.open('mailto:?subject=Join me and get rewards&body=' + encodeURIComponent(text));
                    if (type === 'messenger') window.open('https://www.facebook.com/dialog/send?link=' + encodeURIComponent(url));
                    if (type === 'sms') window.open('sms:?body=' + encodeURIComponent(text));
                });
            });
        };

        // ── Referral tab ─────────────────────────────────────────────────────

        /**
         * @listens tab:activated:referral (once)
         * Initialises the referral tab on the first visit — binds copy link
         * and social share buttons. Auto-removed after firing.
         */
        eventBus.once('tab:activated:referral', function () {
            loyaltyApp.tab.initReferralTab();
        });

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 14: API CALLS
        // ─────────────────────────────────────────────────────────────────────────

        loyaltyApp.requestToGetRewardVoucher = function (params) {
            var rewardRuleId = params.rewardRuleId;
            var title = params.title;
            var customer = loyaltyApp.customer;

            if (!rewardRuleId || !customer || !customer.id || !customer.config || !customer.config.id) {
                /** @fires notify:info:claim:error */
                eventBus.emit('notify:info:claim:error', { message: 'Missing required data. Please refresh and try again.' });
                return;
            }

            fetch(appConfig.appUrl + '/api/get-reward-voucher', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shop: window.Shopify && window.Shopify.shop,
                    customerId: customer.id,
                    rewardRuleId: rewardRuleId,
                    title: title,
                    customerIndex: customer.config.id
                }),
                signal: AbortSignal.timeout ? AbortSignal.timeout(40000) : undefined
            })
                .then(function (res) {
                    if (!res.ok) throw new Error('Server error: ' + res.status);
                    return res.json();
                })
                .then(function (data) {
                    var voucher = data && data.voucherCode;
                    if (!voucher) throw new Error('No voucher code returned. Please try again.');
                    /** @fires notify:info:claim:success */
                    eventBus.emit('notify:info:claim:success', { response: data, voucher: voucher });
                })
                .catch(function (err) {
                    /** @fires notify:info:claim:error */
                    eventBus.emit('notify:info:claim:error', { message: err.message || 'Something went wrong. Please try again.' });
                });
        };

        loyaltyApp.requestToClaimPrize = function (params) {
            var prizeId = params.prizeId;
            var customer = loyaltyApp.customer;

            if (!prizeId || !customer || !customer.id || !customer.config || !customer.config.id) {
                eventBus.emit('notify:info:claim:error', { message: 'Missing required data. Please refresh and try again.' });
                return;
            }

            fetch(appConfig.appUrl + '/api/claim-prize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shop: window.Shopify && window.Shopify.shop,
                    customerId: customer.id,
                    customerIndex: customer.config.id,
                    prizeId: prizeId
                }),
                signal: AbortSignal.timeout ? AbortSignal.timeout(40000) : undefined
            })
                .then(function (res) {
                    if (!res.ok) throw new Error('Server error: ' + res.status);
                    return res.json();
                })
                .then(function (data) {
                    if (data.error) throw new Error(data.details || data.error);
                    eventBus.emit('notify:info:claim:prize:success', { response: data });
                })
                .catch(function (err) {
                    eventBus.emit('notify:info:claim:error', { message: err.message || 'Something went wrong. Please try again.' });
                });
        };
        // Initialises on widget:first-open — panels are injected and wired then.
        // ─────────────────────────────────────────────────────────────────────────

        /**
         * @listens widget:first-open
         * Injects notification HTML and wires all notify:* bus events.
         */
        eventBus.on('widget:first-open', function () {
            var notifyWrapper = document.getElementById('nbl-notification-wrapper');
            if (!notifyWrapper) return;
            notifyWrapper.innerHTML = `
                <div class="nbl-notify-overlay-v1"></div>

                <div class="nbl-notify-reward-container-v1 nbl-notify-base-v1">
                    <span class="nbl-notify-reward-close-v1">${icon('close')}</span>
                    <div class="nbl-notify-reward-heading-v1">${lbl('notifyRewardHeading')}</div>
                    <div class="nbl-notify-reward-copy-wrapper-v1">
                        <div class="nbl-notify-reward-code-v1"></div>
                        <button class="nbl-notify-reward-copy-btn-v1">${lbl('notifyRewardCopyBtn')}</button>
                    </div>
                </div>

                <div class="nbl-notify-info-container-v1 nbl-notify-base-v1">
                    <div class="nbl-notify-info-img-wrap-v1 nbl-notify-hidden-v1">
                        <span class="nbl-notify-info-close-v1">${icon('close')}</span>
                        <div class="nbl-notify-info-img-placeholder-v1">${icon('reward-discount')}</div>
                        <div class="nbl-notify-info-img-overlay-v1"></div>
                        <div class="nbl-notify-info-img-title-v1"></div>
                        <div class="nbl-notify-info-badge-v1 nbl-notify-hidden-v1"></div>
                    </div>
                    <span class="nbl-notify-info-close-v1 nbl-notify-info-close-noimg-v1">${icon('close')}</span>
                    <div class="nbl-notify-info-body-v1">
                        <div class="nbl-notify-info-sub-v1 nbl-notify-hidden-v1"></div>
                        <div class="nbl-notify-info-rows-v1 nbl-notify-hidden-v1"></div>
                        <div class="nbl-notify-info-text-v1"></div>
                        <div class="nbl-notify-info-msg-v1 nbl-notify-hidden-v1"></div>
                        <div class="nbl-notify-info-note-v1 nbl-notify-hidden-v1"></div>
                        <div class="nbl-notify-info-tracking-v1 nbl-notify-hidden-v1">${icon('purchase')}</div>
                        <div class="nbl-notify-info-error-v1"></div>
                        <button class="nbl-notify-info-claim-btn-v1">${lbl('notifyInfoClaimBtn')}</button>
                        <a class="nbl-notify-info-contact-btn-v1 nbl-notify-hidden-v1" target="_blank" rel="noopener"></a>
                    </div>
                </div>`;

            var notifyContainer = document.getElementById('nbl-notification-wrapper');
            var overlay = document.querySelector('.nbl-notify-overlay-v1');
            var rewardEl = document.querySelector('.nbl-notify-reward-container-v1');
            var infoEl = document.querySelector('.nbl-notify-info-container-v1');
            var rewardWrapper = rewardEl.querySelector('.nbl-notify-reward-copy-wrapper-v1');
            var infoText = infoEl.querySelector('.nbl-notify-info-text-v1');
            var infoError = infoEl.querySelector('.nbl-notify-info-error-v1');
            var claimBtn = infoEl.querySelector('.nbl-notify-info-claim-btn-v1');
            var infoImgWrap = infoEl.querySelector('.nbl-notify-info-img-wrap-v1');
            var infoImgPlaceholder = infoImgWrap.querySelector('.nbl-notify-info-img-placeholder-v1');
            var infoImgTitleEl = infoImgWrap.querySelector('.nbl-notify-info-img-title-v1');
            var infoImgBadgeEl = infoImgWrap.querySelector('.nbl-notify-info-badge-v1');
            // close buttons: one inside img wrap (shown when image present), one outside (no-image)
            var infoCloseImg = infoImgWrap.querySelector('.nbl-notify-info-close-v1');
            var infoCloseNoImg = infoEl.querySelector('.nbl-notify-info-close-noimg-v1');
            var infoBodyEl = infoEl.querySelector('.nbl-notify-info-body-v1');
            var infoSubEl = infoEl.querySelector('.nbl-notify-info-sub-v1');
            var infoRowsEl = infoEl.querySelector('.nbl-notify-info-rows-v1');
            var infoMsgEl = infoEl.querySelector('.nbl-notify-info-msg-v1');
            var infoNoteEl = infoEl.querySelector('.nbl-notify-info-note-v1');
            var infoTrackingEl = infoEl.querySelector('.nbl-notify-info-tracking-v1');
            var infoContactBtn = infoEl.querySelector('.nbl-notify-info-contact-btn-v1');

            var active = null;
            var processing = false;

            function showOverlay() {
                overlay.classList.add('nbl-notify-active-v1');
                if (notifyContainer) notifyContainer.classList.add('nbl-notify-active-v1');
            }
            function hideOverlay() {
                overlay.classList.remove('nbl-notify-active-v1');
                if (notifyContainer) notifyContainer.classList.remove('nbl-notify-active-v1');
            }

            function closeCurrent() {
                if (processing) return;
                if (active === 'reward') { rewardEl.classList.remove('nbl-notify-active-v1'); active = null; }
                if (active === 'info') { infoEl.classList.remove('nbl-notify-active-v1'); setClaimIdle(); hideError(); active = null; }
            }

            overlay.addEventListener('click', function () {
                if (processing) return;
                if (active === 'reward') closeReward();
                if (active === 'info') closeInfo();
            });

            function openReward(code) {
                if (!code) return;
                closeCurrent(); active = 'reward';
                rewardWrapper.innerHTML = `
                    <div class="nbl-notify-reward-code-v1">${escapeText(code)}</div>
                    <button class="nbl-notify-reward-copy-btn-v1">${lbl('notifyRewardCopyBtn')}</button>`;
                rewardWrapper.querySelector('button').onclick = function () {
                    navigator.clipboard && navigator.clipboard.writeText(code);
                    rewardWrapper.innerHTML = `
                        <div style="display:flex;align-items:center;gap:10px;width:100%">
                            <span>\u2714 Copied!</span>
                            <button class="nbl-notify-reward-copy-btn-v1" style="margin-left:auto;padding:6px 14px">Close</button>
                        </div>`;
                    rewardWrapper.querySelector('button').onclick = closeReward;
                };
                rewardEl.classList.add('nbl-notify-active-v1');
                showOverlay();
            }

            function closeReward() {
                rewardEl.classList.remove('nbl-notify-active-v1');
                hideOverlay(); active = null;
            }

            rewardEl.querySelector('.nbl-notify-reward-close-v1').addEventListener('click', closeReward);

            function openInfo(payload) {
                if (!payload || processing) return;
                closeCurrent(); active = 'info';

                var text = payload.text || '';
                var claim = !!payload.claim;
                var data = payload.data || null;
                var imageUrl = payload.imageUrl || '';
                var imgTitle = payload.imageTitle || '';
                var imgPlaceholder = payload.imagePlaceholder !== false;
                var imageFit = payload.imageFit || 'cover';
                var imageHeight = payload.imageHeight || 150;
                var imagePos = payload.imagePosition || 'center';
                var badge = payload.badge || '';
                var badgeType = (payload.badgeType || '').toLowerCase();
                var subText = payload.sub || '';
                var rows = Array.isArray(payload.rows) ? payload.rows : [];
                var msgText = payload.msg || '';
                var msgClass = payload.msgClass || '';
                var noteText = payload.note || '';
                var trackingUrl = payload.trackingUrl || '';
                var trackingLabel = payload.trackingLabel || 'Track your order';
                var trackingText = payload.trackingText || '';
                var contactUrl = payload.contactUrl || '';
                var contactText = payload.contactText || 'Contact us';

                // ── Image banner ──────────────────────────────────────────────
                var hasImage = (imageUrl || imgPlaceholder) && !!(imageUrl || imgTitle || badge);
                if (hasImage) {
                    var prevImg = infoImgWrap.querySelector('img');
                    if (prevImg) prevImg.remove();

                    // Set height via CSS custom property on the element — avoids inline style conflicts
                    infoImgWrap.classList.remove('nbl-notify-info-img-mode-auto-v1', 'nbl-notify-info-img-mode-cover-v1', 'nbl-notify-info-img-mode-contain-v1');
                    infoImgWrap.style.setProperty('--_img-h', `${imageHeight}px`);
                    infoImgWrap.classList.add(`nbl-notify-info-img-mode-${imageFit}-v1`);

                    if (imageUrl) {
                        var imgEl = document.createElement('img');
                        imgEl.src = imageUrl;
                        imgEl.alt = imgTitle;
                        imgEl.className = `nbl-notify-info-img-el-v1 nbl-notify-info-img-fit-${imageFit}-v1`;
                        imgEl.style.setProperty('--_img-pos', imagePos);
                        infoImgWrap.insertBefore(imgEl, infoImgWrap.firstChild);
                        infoImgPlaceholder.classList.add('nbl-notify-hidden-v1');
                    } else {
                        infoImgPlaceholder.classList.remove('nbl-notify-hidden-v1');
                    }

                    infoImgTitleEl.textContent = imgTitle;

                    if (badge) {
                        infoImgBadgeEl.textContent = badge;
                        infoImgBadgeEl.className = 'nbl-notify-info-badge-v1 nbl-notify-info-badge-' + (badgeType || 'pending') + '-v1';
                        infoImgBadgeEl.classList.remove('nbl-notify-hidden-v1');
                    } else {
                        infoImgBadgeEl.classList.add('nbl-notify-hidden-v1');
                    }

                    infoImgWrap.classList.remove('nbl-notify-hidden-v1');
                    infoEl.classList.add('nbl-notify-has-img-v1');

                    // When image is present, title is shown as overlay — hide body title
                    var bodyTitleEl = infoBodyEl.querySelector('.nbl-notify-info-body-title-v1');
                    if (bodyTitleEl) bodyTitleEl.remove();

                } else {
                    infoImgWrap.classList.add('nbl-notify-hidden-v1');
                    infoEl.classList.remove('nbl-notify-has-img-v1');

                    // No image — show title + badge in body if provided
                    var bodyTitleEl = infoBodyEl.querySelector('.nbl-notify-info-body-title-v1');
                    if (bodyTitleEl) bodyTitleEl.remove();
                    if (imgTitle || badge) {
                        var titleRow = document.createElement('div');
                        titleRow.className = 'nbl-notify-info-body-title-v1';
                        titleRow.innerHTML = (imgTitle ? '<span class="nbl-notify-info-body-title-text-v1">' + escapeText(imgTitle) + '</span>' : '')
                            + (badge ? '<span class="nbl-notify-info-badge-v1 nbl-notify-info-badge-' + (badgeType || 'pending') + '-v1 nbl-notify-info-badge-inline-v1">' + escapeText(badge) + '</span>' : '');
                        infoBodyEl.insertBefore(titleRow, infoBodyEl.firstChild);
                    }
                }

                // ── Sub-label ─────────────────────────────────────────────────
                if (subText) {
                    infoSubEl.textContent = subText;
                    infoSubEl.classList.remove('nbl-notify-hidden-v1');
                } else {
                    infoSubEl.classList.add('nbl-notify-hidden-v1');
                }

                // ── Detail rows ───────────────────────────────────────────────
                if (rows.length) {
                    infoRowsEl.innerHTML = rows.map(function (row) {
                        return '<div class="nbl-notify-info-row-v1">'
                            + '<span class="nbl-notify-info-row-key-v1">' + escapeText(row.key) + '</span>'
                            + '<span class="nbl-notify-info-row-val-v1">' + escapeText(row.val) + '</span>'
                            + '</div>';
                    }).join('');
                    infoRowsEl.classList.remove('nbl-notify-hidden-v1');
                } else {
                    infoRowsEl.classList.add('nbl-notify-hidden-v1');
                }

                // ── Main text (backward compat) ───────────────────────────────
                if (text) {
                    if (payload.isHtml) {
                        infoText.innerHTML = text;
                    } else {
                        infoText.innerText = text;
                    }
                    infoText.classList.remove('nbl-notify-hidden-v1');
                } else {
                    infoText.innerHTML = '';
                    infoText.classList.add('nbl-notify-hidden-v1');
                }

                // ── Status message box ────────────────────────────────────────
                if (msgText) {
                    infoMsgEl.innerHTML = msgText;
                    infoMsgEl.className = 'nbl-notify-info-msg-v1'
                        + (msgClass ? ' nbl-notify-info-msg-' + msgClass + '-v1' : '');
                    infoMsgEl.classList.remove('nbl-notify-hidden-v1');
                } else {
                    infoMsgEl.classList.add('nbl-notify-hidden-v1');
                }

                // ── Admin / secondary note ────────────────────────────────────
                if (noteText) {
                    infoNoteEl.textContent = noteText;
                    infoNoteEl.classList.remove('nbl-notify-hidden-v1');
                } else {
                    infoNoteEl.classList.add('nbl-notify-hidden-v1');
                }

                // ── Tracking box ──────────────────────────────────────────────
                if (trackingUrl || trackingText) {
                    var trackIcon = infoTrackingEl.querySelector('svg') || infoTrackingEl.firstChild;
                    var trackContent = trackingUrl
                        ? '<a href="' + escapeAttribute(trackingUrl) + '" target="_blank" rel="noopener">' + escapeText(trackingLabel) + '</a>'
                        : escapeText(trackingText);
                    infoTrackingEl.innerHTML = icon('purchase') + trackContent;
                    infoTrackingEl.classList.remove('nbl-notify-hidden-v1');
                } else {
                    infoTrackingEl.classList.add('nbl-notify-hidden-v1');
                }

                // ── Contact button ────────────────────────────────────────────
                if (contactUrl) {
                    infoContactBtn.href = contactUrl;
                    infoContactBtn.textContent = contactText;
                    infoContactBtn.classList.remove('nbl-notify-hidden-v1');
                } else {
                    infoContactBtn.classList.add('nbl-notify-hidden-v1');
                }

                // ── Claim button ──────────────────────────────────────────────
                hideError();
                if (claim) {
                    claimBtn.classList.remove('nbl-notify-hidden-v1');
                    setClaimIdle();
                    claimBtn.onclick = function () {
                        setClaimLoading();
                        hideError();
                        eventBus.emit('notify:info:claim:start', { data: data });
                    };
                } else {
                    claimBtn.classList.add('nbl-notify-hidden-v1');
                }

                infoEl.classList.add('nbl-notify-active-v1');
                showOverlay();
            }

            function closeInfo() {
                infoEl.classList.remove('nbl-notify-active-v1');
                infoEl.classList.remove('nbl-notify-has-img-v1');
                infoImgWrap.classList.add('nbl-notify-hidden-v1');
                infoImgWrap.classList.remove('nbl-notify-info-img-mode-auto-v1', 'nbl-notify-info-img-mode-cover-v1', 'nbl-notify-info-img-mode-contain-v1');
                infoImgWrap.style.removeProperty('--_img-h');
                infoSubEl.classList.add('nbl-notify-hidden-v1');
                infoRowsEl.classList.add('nbl-notify-hidden-v1');
                infoMsgEl.classList.add('nbl-notify-hidden-v1');
                infoNoteEl.classList.add('nbl-notify-hidden-v1');
                infoTrackingEl.classList.add('nbl-notify-hidden-v1');
                infoContactBtn.classList.add('nbl-notify-hidden-v1');
                var prevImg = infoImgWrap.querySelector('img');
                if (prevImg) prevImg.remove();
                var bodyTitle = infoBodyEl && infoBodyEl.querySelector('.nbl-notify-info-body-title-v1');
                if (bodyTitle) bodyTitle.remove();
                hideOverlay(); setClaimIdle(); hideError(); active = null;
            }

            infoCloseImg.addEventListener('click', closeInfo);
            infoCloseNoImg.addEventListener('click', closeInfo);

            function setClaimLoading() {
                processing = true;
                claimBtn.disabled = true;
                claimBtn.innerHTML = '<span class="nbl-spinner-v1"></span><span>' + (lbl('claimingLabel') || 'Processing...') + '</span>';
                claimBtn.classList.remove('nbl-notify-claim-error-v1');
            }
            function setClaimIdle() {
                processing = false;
                claimBtn.disabled = false;
                claimBtn.innerHTML = lbl('notifyInfoClaimBtn') || 'Claim';
                claimBtn.classList.remove('nbl-notify-claim-error-v1');
            }
            function setClaimError() {
                processing = false;
                claimBtn.disabled = false;
                claimBtn.innerHTML = (lbl('claimRetryLabel') || 'Try again');
                claimBtn.classList.add('nbl-notify-claim-error-v1');
            }
            function showError(msg) {
                infoError.textContent = msg;
                infoError.classList.add('nbl-notify-active-v1');
                setTimeout(function () { hideError(); }, 5000);
            }
            function hideError() {
                infoError.textContent = '';
                infoError.classList.remove('nbl-notify-active-v1');
            }

            /** @listens notify:reward:open */
            eventBus.on('notify:reward:open', function (eventData) { if (eventData && eventData.code) openReward(eventData.code); });
            /** @listens notify:reward:close */
            eventBus.on('notify:reward:close', function () { closeReward(); });
            /** @listens notify:info:open */
            eventBus.on('notify:info:open', function (eventData) { if (eventData && eventData.payload) openInfo(eventData.payload); });
            /** @listens notify:info:close */
            eventBus.on('notify:info:close', function () { closeInfo(); });

            /** @listens notify:info:claim:success */
            eventBus.on('notify:info:claim:success', function (eventData) {
                processing = false;
                closeInfo();
                if (eventData && eventData.voucher) openReward(eventData.voucher);
            });

            /** @listens notify:info:claim:prize:success */
            eventBus.on('notify:info:claim:prize:success', function (eventData) {
                processing = false;
                var response = eventData && eventData.response;
                // Update points balance
                var newPoints = response && Number(response.points);
                if (!isNaN(newPoints)) eventBus.emit('points:update', newPoints);
                // Re-render prizes tab if visited
                if (eventBus.hasListeners('tab:visited:prizes')) loyaltyApp.tab.renderPrizeList();
                // Re-render home prize requests
                if (response && response.claimId && loyaltyApp.customer && loyaltyApp.customer.config) {
                    var claims = loyaltyApp.customer.config.prizeClaims || [];
                    claims.unshift({ id: response.claimId, physicalPrizeId: response.prizeId || 0, status: 'PENDING', pointsCost: response.pointsCost ? Math.abs(response.pointsCost) : 0 });
                    loyaltyApp.customer.config.prizeClaims = claims;
                    loyaltyApp.tab.renderHomePrizeRequests();
                    if (eventBus.hasListeners('tab:visited:my-prizes')) loyaltyApp.tab.renderMyPrizesTab();
                }
                // Show clean success state via openInfo
                openInfo({
                    msg: lbl('prizeClaimSuccessMsg') || '✅ Your request has been submitted! We\'ll contact you soon to arrange delivery.',
                    claim: false,
                });
            });

            /** @listens notify:info:claim:error */
            eventBus.on('notify:info:claim:error', function (eventData) {
                processing = false;
                setClaimError();
                showError((eventData && eventData.message) || 'Something went wrong. Please try again.');
            });

            loyaltyApp.notify = { openReward: openReward, closeReward: closeReward, openInfo: openInfo, closeInfo: closeInfo };
        });

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 16: REFERRAL MODAL
        // tryInit runs immediately (URL code check must happen before navigation).
        // All internal logic is event-driven via eventBus.
        // ─────────────────────────────────────────────────────────────────────────

        (function initReferralModal() {
            var STEPS = { LOGIN: 'login', FORM: 'form', SUCCESS: 'success', LOCKED: 'locked' };
            var LOCKED_CODES = ['DISCOUNT_ALREADY_USED', 'REFERRAL_ALREADY_LOCKED'];
            var HTTP_ERRORS = { 400: 'Invalid request.', 404: 'Code not found.', 409: 'Already used.', 422: 'Not eligible.', 500: 'Server error.' };
            var CACHE_KEY = 'NBL_ReferralCache';
            var PENDING_KEY = 'NBL_PendingReferral';

            var modalElements = {};
            var activeStep = null;
            var hasCopied = false;
            var sweepId = null;
            var timeoutId = null;
            var isAutoSubmit = false;

            function getStore() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { return {}; } }
            function setStore(storeData) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(storeData)); } catch (e) { } }

            function getCache(code) {
                var store = getStore(), item = store[code]; if (!item) return null;
                if (Date.now() > item.expiresAt) { delete store[code]; setStore(store); return null; }
                return item.data;
            }
            function setCache(code, data) {
                var cacheDuration = data.success ? 60000 : 30000;
                var store = getStore(); store[code] = { data: data, expiresAt: Date.now() + cacheDuration }; setStore(store);
            }
            function hasUsedCode() {
                return Object.values(getStore()).some(function (cacheEntry) { return cacheEntry.data && cacheEntry.data.success && cacheEntry.data.referralDiscountCode; });
            }

            function getURLCode() { return new URLSearchParams(window.location.search).get('nbl-referral'); }
            function removeURLCode() { var currentUrl = new URL(window.location.href); currentUrl.searchParams.delete('nbl-referral'); history.replaceState({}, '', currentUrl); }
            function savePending(pendingCode) { if (pendingCode) localStorage.setItem(PENDING_KEY, pendingCode); }

            function restorePendingCode() {
                var urlCode = getURLCode(); if (urlCode) return urlCode;
                var saved = localStorage.getItem(PENDING_KEY); if (!saved) return null;
                var currentUrl = new URL(window.location.href); currentUrl.searchParams.set('nbl-referral', saved);
                history.replaceState({}, '', currentUrl);
                localStorage.removeItem(PENDING_KEY);
                return saved;
            }

            function cacheDOM() {
                var root = document.querySelector('.nbl-refer-modal-overlay-v1'); if (!root) return false;
                modalElements = {
                    root: root,
                    closeBtn: root.querySelector('.nbl-refer-modal-close-v1'),
                    loginStep: root.querySelector('.nbl-refer-modal-login-step-v1'),
                    formStep: root.querySelector('.nbl-refer-modal-form-v1'),
                    successStep: root.querySelector('.nbl-refer-modal-success-v1'),
                    lockedStep: root.querySelector('.nbl-refer-modal-locked-v1'),
                    referralInput: root.querySelector('#referralInput'),
                    submitBtn: root.querySelector('#submitBtn'),
                    loginBtn: root.querySelector('#loginBtn'),
                    finishBtn: root.querySelector('#finishBtn'),
                    copyBtn: root.querySelector('#copyBtn'),
                    copiedText: root.querySelector('.nbl-refer-modal-copied-text-v1'),
                    discountCodeText: root.querySelector('#discountCode'),
                    lockedCloseBtn: root.querySelector('#lockedCloseBtn'),
                    formMessage: root.querySelector('#formMessage'),
                    successMessage: root.querySelector('#successMessage'),
                    lockedMessage: root.querySelector('#lockedMessage')
                };
                return true;
            }

            function showMsg(el, type, msg) {
                if (!el) return;
                var prefix = { success: '\u2705', error: '\u274C', info: '\u2139\uFE0F' }[type] || '';
                el.className = 'nbl-refer-modal-message-v1 nbl-refer-modal-message-' + type + '-v1';
                el.textContent = prefix + ' ' + msg;
            }
            function clearMsg(el) {
                if (!el) return; el.className = 'nbl-refer-modal-message-v1'; el.textContent = '';
            }

            function showStep(step) {
                activeStep = step;
                Object.values(STEPS).forEach(function (stepKey) {
                    modalElements[stepKey + 'Step'] && modalElements[stepKey + 'Step'].classList.add('nbl-hidden-v1');
                });
                modalElements[step + 'Step'] && modalElements[step + 'Step'].classList.remove('nbl-hidden-v1');
            }

            function openModal() { modalElements.root.classList.add('show'); hasCopied = false; }
            function closeModal() { modalElements.root.classList.remove('show'); removeURLCode(); }

            function resetSubmitBtn() {
                var loader = modalElements.formStep && modalElements.formStep.querySelector('.nbl-refer-modal-loader-v1');
                if (loader) loader.remove();
                if (!modalElements.submitBtn) return;
                modalElements.submitBtn.disabled = false;
                modalElements.submitBtn.textContent = 'Request Discount Code';
                modalElements.submitBtn.classList.remove('nbl-hidden-v1');
            }

            function showLoader() {
                if (modalElements.formStep && modalElements.formStep.querySelector('.nbl-refer-modal-loader-v1')) return;
                var loader = document.createElement('div');
                loader.className = 'nbl-refer-modal-loader-v1';
                loader.innerHTML = '<span class="nbl-refer-modal-loader-spinner-v1"></span><span>Verifying your referral code...</span>';
                modalElements.submitBtn && modalElements.submitBtn.insertAdjacentElement('afterend', loader);
            }

            function fetchDiscount(code) {
                if (timeoutId) clearTimeout(timeoutId);
                timeoutId = setTimeout(function () {
                    if (!isAutoSubmit || WIDGET_CONFIG.showSubmitButtonOnAuto) resetSubmitBtn();
                    else {
                        var loader = modalElements.formStep && modalElements.formStep.querySelector('.nbl-refer-modal-loader-v1');
                        if (loader) loader.remove();
                        if (modalElements.submitBtn) { modalElements.submitBtn.disabled = false; modalElements.submitBtn.classList.add('nbl-hidden-v1'); }
                    }
                    isAutoSubmit = false;
                    showMsg(modalElements.formMessage, 'error', 'Request timed out. Please try again.');
                }, 8000);

                fetch(appConfig.appUrl + '/api/get-referral-discount', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        shop: window.Shopify && window.Shopify.shop,
                        customerId: loyaltyApp.customer && loyaltyApp.customer.id,
                        referralCode: code
                    })
                })
                    .then(function (res) {
                        return res.json().then(function (jsonBody) {
                            jsonBody._status = res.status;
                            if (!res.ok && !jsonBody.message) jsonBody.message = HTTP_ERRORS[res.status] || HTTP_ERRORS[500];
                            return jsonBody;
                        });
                    })
                    .then(function (data) { eventBus.emit('discount:response', { code: code, data: data }); })
                    .catch(function () { eventBus.emit('discount:response', { code: code, data: { success: false, message: 'Network error.' } }); })
                    .finally(function () { clearTimeout(timeoutId); });
            }

            function initBus() {
                /** @listens referralModal:open */
                eventBus.on('referralModal:open', openModal);
                /** @listens referralModal:close */
                eventBus.on('referralModal:close', closeModal);

                /** @listens referralModal:login */
                eventBus.on('referralModal:login', function () {
                    var code = getURLCode(); if (code) savePending(code);
                    window.location.href = '/account/login';
                });

                /** @listens referralModal:submit { code } */
                eventBus.on('referralModal:submit', function (code) {
                    clearMsg(modalElements.formMessage);
                    if (!code) return showMsg(modalElements.formMessage, 'error', 'Please enter a referral code.');
                    if (hasUsedCode()) { showStep(STEPS.LOCKED); return showMsg(modalElements.lockedMessage, 'error', 'You have already used a referral code.'); }

                    var cached = getCache(code);
                    if (cached) {
                        isAutoSubmit = false;
                        resetSubmitBtn();
                        if (cached.success) { showStep(STEPS.SUCCESS); modalElements.discountCodeText.textContent = cached.referralDiscountCode; return showMsg(modalElements.successMessage, 'success', cached.message || 'Your code is ready!'); }
                        if (LOCKED_CODES.indexOf(cached.code) > -1) { showStep(STEPS.LOCKED); return showMsg(modalElements.lockedMessage, 'error', cached.message); }
                        return showMsg(modalElements.formMessage, 'error', cached.message);
                    }

                    modalElements.submitBtn.classList.add('nbl-hidden-v1');
                    showLoader();
                    fetchDiscount(code);
                });

                /** @listens discount:response */
                eventBus.on('discount:response', function (response) {
                    var wasAuto = isAutoSubmit;
                    isAutoSubmit = false;
                    if (!wasAuto) resetSubmitBtn();
                    else if (WIDGET_CONFIG.showSubmitButtonOnAuto) resetSubmitBtn();
                    else {
                        var loader = modalElements.formStep && modalElements.formStep.querySelector('.nbl-refer-modal-loader-v1');
                        if (loader) loader.remove();
                        if (modalElements.submitBtn) {
                            modalElements.submitBtn.disabled = false;
                            modalElements.submitBtn.textContent = 'Request Discount Code';
                            modalElements.submitBtn.classList.add('nbl-hidden-v1');
                        }
                    }
                    setCache(response.code, response.data);
                    if (response.data.success) { showStep(STEPS.SUCCESS); modalElements.discountCodeText.textContent = response.data.referralDiscountCode; return showMsg(modalElements.successMessage, 'success', response.data.message); }
                    if (LOCKED_CODES.indexOf(response.data.code) > -1) { showStep(STEPS.LOCKED); return showMsg(modalElements.lockedMessage, 'error', response.data.message); }
                    showMsg(modalElements.formMessage, 'error', response.data.message);
                });

                /** @listens referralModal:copy */
                eventBus.on('referralModal:copy', function (text) {
                    if (!text) return;
                    navigator.clipboard && navigator.clipboard.writeText(text).then(function () {
                        hasCopied = true;
                        if (modalElements.copyBtn) { modalElements.copyBtn.textContent = 'Copied \u2713'; modalElements.copyBtn.disabled = true; }
                        if (modalElements.copiedText) modalElements.copiedText.classList.remove('nbl-hidden-v1');
                        setTimeout(function () {
                            if (modalElements.copyBtn) { modalElements.copyBtn.textContent = 'Copy Code'; modalElements.copyBtn.disabled = false; }
                            if (modalElements.copiedText) modalElements.copiedText.classList.add('nbl-hidden-v1');
                        }, 2500);
                    });
                });

                /** @listens referralModal:finish */
                eventBus.on('referralModal:finish', function () {
                    if (activeStep === STEPS.SUCCESS && !hasCopied)
                        return showMsg(modalElements.successMessage, 'error', 'Please copy your code before closing.');
                    closeModal();
                });
            }

            function bindEvents() {
                /** @fires referralModal:close */
                modalElements.closeBtn && modalElements.closeBtn.addEventListener('click', function () { eventBus.emit('referralModal:close'); });
                /** @fires referralModal:login */
                modalElements.loginBtn && modalElements.loginBtn.addEventListener('click', function () { eventBus.emit('referralModal:login'); });
                /** @fires referralModal:finish */
                modalElements.finishBtn && modalElements.finishBtn.addEventListener('click', function () { eventBus.emit('referralModal:finish'); });
                /** @fires referralModal:close */
                modalElements.lockedCloseBtn && modalElements.lockedCloseBtn.addEventListener('click', function () { eventBus.emit('referralModal:close'); });
                /** @fires referralModal:submit */
                modalElements.submitBtn && modalElements.submitBtn.addEventListener('click', function () { eventBus.emit('referralModal:submit', modalElements.referralInput && modalElements.referralInput.value.trim()); });
                /** @fires referralModal:copy */
                modalElements.copyBtn && modalElements.copyBtn.addEventListener('click', function () { eventBus.emit('referralModal:copy', modalElements.discountCodeText && modalElements.discountCodeText.textContent.trim()); });
            }

            function tryInit(retry) {
                var code = restorePendingCode();
                if (!cacheDOM()) {
                    if (retry > 0) { setTimeout(function () { tryInit(retry - 1); }, 300); return; }
                    return;
                }
                bindEvents();
                initBus();

                sweepId = setInterval(function () {
                    var store = getStore(); var now = Date.now();
                    Object.keys(store).forEach(function (cacheKey) { if (now > store[cacheKey].expiresAt) delete store[cacheKey]; });
                    setStore(store);
                }, 30000);

                if (!code) return;
                openModal();
                if (!loyaltyApp.customer || !loyaltyApp.customer.id) { showStep(STEPS.LOGIN); return; }
                showStep(STEPS.FORM);
                if (modalElements.referralInput) modalElements.referralInput.value = code;
                isAutoSubmit = true;
                modalElements.submitBtn && modalElements.submitBtn.classList.add('nbl-hidden-v1');
                showLoader();
                eventBus.emit('referralModal:submit', code);
            }

            tryInit(10);
        })();

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 17: GLOBAL CLICK DELEGATION
        // ─────────────────────────────────────────────────────────────────────────

        /**
         * Capture every click and publish on the eventBus.
         * @fires event:click { event, target }
         */
        window.addEventListener('click', function (e) {
            eventBus.emit('event:click', { event: e, target: e.target });
        });

        /**
         * @listens event:click
         * Central click router — delegates to the correct handler or emits a
         * more specific bus event.
         */
        // ── Click router: translates DOM events into semantic bus events ───────
        // The router itself never calls modules directly — it only emits events.
        // Each module listens for the event it cares about and responds.
        // This keeps the router decoupled from every module's internal API.
        eventBus.on('event:click', function (data) {
            var target = data.target;

            // Widget open button → request a toggle via the bus.
            // loyaltyApp.toggleWidget() listens for widget:toggle (below).
            if (loyaltyApp.getTargetElement(target, 'nbl-widget-open-button-v1')) {
                /** @fires widget:toggle */
                eventBus.emit('widget:toggle');
                return;
            }

            // Widget close button → request a close via the bus.
            if (loyaltyApp.getTargetElement(target, 'nbl-widget-close-button-v1')) {
                /** @fires widget:close */
                eventBus.emit('widget:close');
                return;
            }

            // Nav item or home nav card clicked → request tab change via the bus.
            // setActiveNavigation() listens for nav:change (below).
            var navEl = loyaltyApp.getTargetElement(target, 'nbl-nav-item-v1')
                || loyaltyApp.getTargetElement(target, 'nbl-home-nav-itm-v1');
            if (navEl && navEl.dataset.nav) {
                /** @fires nav:change { tab } */
                eventBus.emit('nav:change', { tab: navEl.dataset.nav });
                return;
            }

            var rewardItem = loyaltyApp.getTargetElement(target, 'nbl-hta-reward-item-v1');
            if (rewardItem && rewardItem.dataset.voucher) {
                /** @fires notify:reward:open */
                eventBus.emit('notify:reward:open', { code: rewardItem.dataset.voucher });
                return;
            }

            var ruleItem = loyaltyApp.getTargetElement(target, 'nbl-reward-item-v1');
            if (ruleItem) {
                if (ruleItem.classList.contains('active')) {
                    var ruleId = Number(ruleItem.dataset.rewardRuleId);
                    var rule = (appConfig.rewardRules || []).find(function (rewardRule) { return rewardRule.id === ruleId; });
                    /** @fires notify:info:open */
                    eventBus.emit('notify:info:open', {
                        payload: {
                            text: 'Spend ' + formatNumber(rule && rule.pointsCost) + ' points for this reward?',
                            claim: true,
                            data: { rewardRule: rule, title: ruleItem.dataset.title }
                        }
                    });
                }
                return;
            }

            var prizeItem = loyaltyApp.getTargetElement(target, 'nbl-prize-item-v1');
            if (prizeItem) {
                if (prizeItem.classList.contains('active')) {
                    var prizeId = Number(prizeItem.dataset.prizeId);
                    var cost = Number(prizeItem.dataset.cost);
                    var prizeTitle = prizeItem.dataset.title || '';
                    var prize = (appConfig.physicalPrizes || []).find(function (pr) { return Number(pr.id) === prizeId; });
                    var prizeValue = prize && prize.productValue ? prize.productValue : '';
                    var customerPts = getPoints();
                    var p = WIDGET_CONFIG.prize;

                    eventBus.emit('notify:info:open', {
                        payload: {
                            imageUrl: p.showImage ? (prize && prize.imageUrl || '') : '',
                            imagePlaceholder: p.showImage !== false,
                            imageFit: p.imageFit || 'cover',
                            imageHeight: p.imageHeight || 150,
                            imagePosition: p.imagePosition || 'center',
                            imageTitle: prizeTitle,
                            sub: prizeValue ? `$${Number(prizeValue).toLocaleString()} value  ·  ${formatNumber(cost)} pts to claim` : `${formatNumber(cost)} pts to claim`,
                            rows: [
                                { key: 'Points cost', val: `${formatNumber(cost)} pts` },
                                { key: 'Your balance', val: `${formatNumber(customerPts)} pts` },
                                { key: 'Balance after', val: `${formatNumber(customerPts - cost)} pts` },
                            ],
                            claim: true,
                            data: { prize: { id: prizeId, pointsCost: cost }, title: prizeTitle, isPrize: true }
                        }
                    });
                }
                return;
            }

            var myPrizeItem = loyaltyApp.getTargetElement(target, 'nbl-my-prize-item-v1');
            if (myPrizeItem) {
                var d = myPrizeItem.dataset;
                var claimStatus = d.prizeStatus || 'PENDING';
                var claimTitle = d.prizeTitle || 'Prize';
                var claimCost = Number(d.prizeCost) || 0;
                var claimValue = d.prizeValue || '';
                var claimCreated = d.prizeCreated || '';
                var claimFulfilled = d.prizeFulfilled || '';
                var claimCompleted = d.prizeCompleted || '';
                var claimAdminNote = d.prizeAdminNote || '';
                var claimTracking = d.prizeTracking || '';
                var claimImgUrl = d.prizeImgUrl || '';

                function fmtDate(iso) {
                    if (!iso) return '';
                    try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return ''; }
                }

                var p = WIDGET_CONFIG.prize;
                var contactUrl = p.contactUrl || '';
                var contactText = lbl('prizeContactUsText') || 'Contact us';

                var statusMessages = {
                    PENDING: `⏳ Your request is being reviewed. We'll reach out to you soon to arrange delivery.`,
                    FULFILLED: `📦 Your prize is on its way! We've dispatched your order and will follow up shortly.`,
                    COMPLETED: `✅ Your prize has been delivered. Thank you for being a loyal customer!`,
                    CANCELLED: `❌ This request was cancelled.`,
                };
                var badgeLabels = {
                    PENDING: lbl('prizeStatusPending'),
                    FULFILLED: lbl('prizeStatusFulfilled'),
                    COMPLETED: lbl('prizeStatusCompleted'),
                    CANCELLED: lbl('prizeStatusCancelled'),
                };

                var detailRows = [];
                if (claimValue) detailRows.push({ key: 'Prize value', val: `$${Number(claimValue).toLocaleString()}` });
                if (claimCost) detailRows.push({ key: 'Points spent', val: `${formatNumber(claimCost)} pts` });
                if (p.showRequestDate && claimCreated) detailRows.push({ key: 'Requested on', val: fmtDate(claimCreated) });
                if (p.showFulfilledDate) {
                    if (claimStatus === 'FULFILLED' && claimFulfilled) detailRows.push({ key: 'Dispatched on', val: fmtDate(claimFulfilled) });
                    if (claimStatus === 'COMPLETED' && claimCompleted) detailRows.push({ key: 'Completed on', val: fmtDate(claimCompleted) });
                }

                var tUrl = '', tText = '', tLabel = 'Track your order';
                if (p.showTrackingInfo && claimTracking && (claimStatus === 'FULFILLED' || claimStatus === 'COMPLETED')) {
                    if (/^https?:\/\//i.test(claimTracking)) { tUrl = claimTracking; }
                    else { tText = claimTracking; tLabel = claimTracking; }
                }

                var noteStr = '';
                if (p.showAdminNote && claimAdminNote) {
                    noteStr = (claimStatus === 'CANCELLED' ? 'Reason: ' : 'Note: ') + claimAdminNote;
                }

                eventBus.emit('notify:info:open', {
                    payload: {
                        imageUrl: p.showImage ? claimImgUrl : '',
                        imagePlaceholder: p.showImage !== false,
                        imageFit: p.imageFit || 'cover',
                        imageHeight: p.imageHeight || 150,
                        imagePosition: p.imagePosition || 'center',
                        imageTitle: claimTitle,
                        badge: badgeLabels[claimStatus] || claimStatus,
                        badgeType: claimStatus.toLowerCase(),
                        rows: detailRows,
                        msg: statusMessages[claimStatus] || statusMessages.PENDING,
                        msgClass: claimStatus === 'CANCELLED' ? 'cancelled' : '',
                        note: noteStr,
                        trackingUrl: tUrl,
                        trackingLabel: tLabel,
                        trackingText: tText,
                        contactUrl: (claimStatus === 'PENDING' || claimStatus === 'CANCELLED') ? contactUrl : '',
                        contactText: contactText,
                        claim: false,
                    }
                });
                return;
            }

            var pointItem = loyaltyApp.getTargetElement(target, 'nbl-points-item-v1');
            if (pointItem && pointItem.dataset.label) {
                /** @fires notify:info:open */
                eventBus.emit('notify:info:open', { payload: { text: pointItem.dataset.label } });
                return;
            }
        });

        // ── Bus → action wiring ──────────────────────────────────────────────
        // These listeners are the only places that call loyaltyApp methods directly.
        // The click router (above) never calls methods — it emits events.
        // This separation means: click router owns "what was clicked",
        // these listeners own "what to do about it".

        /**
         * @listens widget:toggle
         * Toggles the widget open/closed when the trigger button is clicked.
         */
        eventBus.on('widget:toggle', function () { loyaltyApp.toggleWidget(); });

        /**
         * @listens widget:close
         * Closes the widget when the close button is clicked.
         */
        eventBus.on('widget:close', function () { loyaltyApp.closeWidget(); });

        /**
         * @listens nav:change { tab }
         * Changes the active tab when a nav item or home nav card is clicked.
         */
        eventBus.on('nav:change', function (data) {
            if (data && data.tab) loyaltyApp.setActiveNavigation(data.tab);
        });

        /**
         * @listens notify:info:claim:start { data }
         * Triggers the reward voucher API call.
         */
        eventBus.on('notify:info:claim:start', function (data) {
            var claimData = data && data.data;
            if (!claimData) return;

            // Physical prize claim
            if (claimData.isPrize) {
                var prize = claimData.prize;
                if (!prize || !prize.id) return;
                loyaltyApp.requestToClaimPrize({ prizeId: prize.id, title: claimData.title });
                return;
            }

            // Discount voucher claim
            var rule = claimData.rewardRule;
            if (!rule || !rule.id) return;
            loyaltyApp.requestToGetRewardVoucher({ rewardRuleId: rule.id, title: claimData.title });
        });

        /**
         * @listens notify:info:claim:prize:success { response }
         * Adds an activity entry after a physical prize is successfully claimed.
         */
        eventBus.on('notify:info:claim:prize:success', function (data) {
            var response = data && data.response;
            var activity = (response && response.activity) || 'Prize Claimed';
            var cost = response && response.pointsCost;
            var createdAt = response && response.createdAt;
            eventBus.emit('activity:add', {
                activity: activity,
                points: cost ? -Math.abs(Number(cost)) : 0,
                createdAt: createdAt ? new Date(createdAt).toISOString() : new Date().toISOString()
            });
        });

        /**
         * @listens notify:info:claim:success { response, voucher }
         * Updates points, re-renders reward list, adds voucher + activity entries.
         */
        eventBus.on('notify:info:claim:success', function (data) {
            var response = data && data.response;

            var newPoints = response && Number(response.points);
            if (!isNaN(newPoints)) {
                // points:update listener already handles renderRewardList()
                // when the rewards tab has been visited (via tab:visited:rewards sticky).
                // No direct call needed here — emitting points:update is enough.
                eventBus.emit('points:update', newPoints);
            }

            if (data && data.voucher && data.voucher.length > 5) {
                eventBus.emit('reward:add', {
                    code: data.voucher,
                    title: (response && response.title) || 'Voucher'
                });
            }

            var activity = (response && response.activity) || 'Reward Redeemed';
            var cost = response && response.pointsCost;
            var createdAt = response && response.createdAt;
            eventBus.emit('activity:add', {
                activity: activity,
                points: cost ? -Math.abs(Number(cost)) : 0,
                createdAt: new Date(createdAt).toISOString()
            });
        });

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 17b: MOUSE CURSOR EFFECTS
        // Initialises on widget:first-open — no canvas is created until the
        // widget is opened for the first time.
        // ─────────────────────────────────────────────────────────────────────────

        /**
         * @listens widget:first-open
         * Sets up the cursor particle canvas and begins the render loop.
         */
        eventBus.on('widget:first-open', function () {
            if (WIDGET_CONFIG.mouseEffect === 'none') return;

            var effect = WIDGET_CONFIG.mouseEffect;
            var intensity = Math.max(0.1, Math.min(1, WIDGET_CONFIG.mouseEffectIntensity != null ? WIDGET_CONFIG.mouseEffectIntensity : 0.8));

            var canvas, ctx, animId;
            var particles = [];
            var isOpen = false;

            function makeSmoke(x, y) {
                var spread = 6 * intensity;
                return { type: 'smoke', x: x + (Math.random() - 0.5) * spread, y: y, vx: (Math.random() - 0.5) * 0.5, vy: -(0.4 + Math.random() * 0.6) * intensity, size: (8 + Math.random() * 10) * intensity, life: 1, maxLife: 0.9 + Math.random() * 0.6, rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 0.04 };
            }

            function makeFlame(x, y) {
                var spread = 8 * intensity;
                var hue = 5 + Math.random() * 15;
                return { type: 'flame', x: x + (Math.random() - 0.5) * spread, y: y, vx: (Math.random() - 0.5) * 1.2 * intensity, vy: -(1.5 + Math.random() * 2.0) * intensity, size: (5 + Math.random() * 9) * intensity, life: 1, maxLife: 0.5 + Math.random() * 0.4, hue: hue, turbX: (Math.random() - 0.5) * 0.3 };
            }

            function makeEmber(x, y) {
                var angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
                var speed = (2 + Math.random() * 3.5) * intensity;
                return { type: 'ember', x: x + (Math.random() - 0.5) * 6, y: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: (1.5 + Math.random() * 2.5) * intensity, life: 1, maxLife: 0.6 + Math.random() * 0.5, hue: 40 + Math.random() * 20 };
            }

            function makeSparkleParticle(x, y) {
                var angle = Math.random() * Math.PI * 2;
                var speed = (1 + Math.random() * 3) * intensity;
                var size = (2 + Math.random() * 5) * intensity;
                var life = 0.4 + Math.random() * 0.6;
                return { type: 'sparkle', x: x, y: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: size, life: life, maxLife: life, hue: Math.random() * 60 + 200 };
            }

            function makeBubble(x, y) {
                var sz = (6 + Math.random() * 14) * intensity;
                return { type: 'bubble', x: x + (Math.random() - 0.5) * 10, y: y, vx: (Math.random() - 0.5) * 0.8, vy: -(0.6 + Math.random() * 1.2) * intensity, size: sz, life: 1, maxLife: 0.8 + Math.random() * 0.8, wobble: Math.random() * Math.PI * 2, wobbleSpeed: 1.5 + Math.random() * 2 };
            }

            function makeRipple(x, y) {
                return { type: 'ripple', x: x, y: y, r: 2, maxR: (20 + Math.random() * 20) * intensity, life: 1, maxLife: 1, rings: Math.floor(2 + Math.random() * 2) };
            }

            var lastX = -1, lastY = -1, frameSkip = 0;
            var time = 0;

            function spawnFire(x, y) {
                var fc = Math.ceil(3 * intensity);
                var ec = Math.ceil(intensity * 2);
                if (Math.random() < 0.5) particles.push(makeSmoke(x, y));
                for (var i = 0; i < fc; i++) particles.push(makeFlame(x, y));
                for (var i = 0; i < ec; i++) particles.push(makeEmber(x, y));
            }

            function spawnAt(mouseX, mouseY) {
                if (effect === 'fire') {
                    spawnFire(mouseX, mouseY);
                } else if (effect === 'smoke') {
                    // Pure smoke trail — softer and slower than fire smoke.
                    // Spawns 1-2 smoke puffs per move with gentle upward drift.
                    frameSkip++;
                    if (frameSkip % 2 === 0) {
                        var sc = 1 + (Math.random() < 0.4 ? 1 : 0);
                        for (var i = 0; i < sc; i++) particles.push(makeSmoke(mouseX, mouseY));
                    }
                } else if (effect === 'sparkle') {
                    var count = Math.ceil(3 * intensity);
                    for (var i = 0; i < count; i++) particles.push(makeSparkleParticle(mouseX, mouseY));
                } else if (effect === 'bubble') {
                    frameSkip++;
                    if (frameSkip % 3 === 0) {
                        var bc = 1 + (Math.random() < 0.4 ? 1 : 0);
                        for (var i = 0; i < bc; i++) particles.push(makeBubble(mouseX, mouseY));
                    }
                } else if (effect === 'ripple') {
                    frameSkip++;
                    if (frameSkip % 3 === 0) particles.push(makeRipple(mouseX, mouseY));
                }
            }

            var deltaTime = 1 / 60;

            function tick() {
                if (!ctx || !isOpen) { animId = requestAnimationFrame(tick); return; }
                time += deltaTime;
                ctx.globalCompositeOperation = (effect === 'fire') ? 'screen' : 'source-over';
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                if (effect === 'fire') {
                    var order = { smoke: 0, flame: 1, ember: 2 };
                    particles.sort(function (a, b) { return (order[a.type] || 0) - (order[b.type] || 0); });
                }

                for (var i = particles.length - 1; i >= 0; i--) {
                    var particle = particles[i];
                    particle.life -= deltaTime;
                    if (particle.life <= 0) { particles.splice(i, 1); continue; }
                    var lifeRatio = particle.life / particle.maxLife;

                    if (particle.type === 'ripple') {
                        particle.r += (particle.maxR - particle.r) * 0.10;
                        for (var n = 0; n < particle.rings; n++) {
                            var ringRadius = particle.r * (1 - n * 0.32);
                            if (ringRadius < 1) continue;
                            var ringAlpha = lifeRatio * (1 - n * 0.35) * 0.65 * intensity;
                            var ringLineWidth = (2.2 - n * 0.6) * lifeRatio;
                            var hue = 220 + n * 40;
                            ctx.beginPath();
                            ctx.arc(particle.x, particle.y, ringRadius, 0, Math.PI * 2);
                            ctx.strokeStyle = 'hsla(' + hue + ',80%,65%,' + ringAlpha + ')';
                            ctx.lineWidth = Math.max(0.5, ringLineWidth);
                            ctx.stroke();
                        }
                        continue;
                    }

                    if (particle.type === 'bubble') {
                        particle.x += particle.vx + Math.sin(time * particle.wobbleSpeed + particle.wobble) * 0.5;
                        particle.y += particle.vy;
                        particle.vy *= 0.995;
                        var sz = particle.size;
                        var alpha = lifeRatio < 0.15 ? lifeRatio / 0.15 : (lifeRatio > 0.85 ? (1 - lifeRatio) / 0.15 : 1);
                        alpha *= 0.82 * intensity;
                        var bg = ctx.createRadialGradient(particle.x, particle.y, sz * 0.1, particle.x, particle.y, sz);
                        bg.addColorStop(0, 'rgba(200,220,255,' + (alpha * 0.08) + ')');
                        bg.addColorStop(0.75, 'rgba(180,210,255,' + (alpha * 0.15) + ')');
                        bg.addColorStop(1, 'rgba(160,200,255,' + (alpha * 0.55) + ')');
                        ctx.beginPath(); ctx.arc(particle.x, particle.y, sz, 0, Math.PI * 2); ctx.fillStyle = bg; ctx.fill();
                        ctx.strokeStyle = 'rgba(200,225,255,' + (alpha * 0.65) + ')'; ctx.lineWidth = 1; ctx.stroke();
                        var hx = particle.x - sz * 0.30, hy = particle.y - sz * 0.32;
                        var hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, sz * 0.28);
                        hg.addColorStop(0, 'rgba(255,255,255,' + (alpha * 0.90) + ')');
                        hg.addColorStop(0.5, 'rgba(220,235,255,' + (alpha * 0.45) + ')');
                        hg.addColorStop(1, 'rgba(200,220,255,0)');
                        ctx.beginPath(); ctx.ellipse(hx, hy, sz * 0.28, sz * 0.18, -0.5, 0, Math.PI * 2); ctx.fillStyle = hg; ctx.fill();
                        continue;
                    }

                    if (particle.type === 'smoke') {
                        particle.x += particle.vx; particle.y += particle.vy; particle.vx *= 0.99; particle.rot += particle.rotV;
                        var sz = particle.size * (1 + (1 - lifeRatio) * 0.8);
                        var alpha = lifeRatio < 0.3 ? lifeRatio / 0.3 * 0.18 : (1 - lifeRatio) * 0.18;
                        ctx.save(); ctx.translate(particle.x, particle.y); ctx.rotate(particle.rot);
                        var sg = ctx.createRadialGradient(0, 0, 0, 0, 0, sz);
                        sg.addColorStop(0, 'rgba(80,60,50,' + (alpha * intensity) + ')');
                        sg.addColorStop(0.6, 'rgba(60,40,30,' + (alpha * 0.5 * intensity) + ')');
                        sg.addColorStop(1, 'rgba(40,20,10,0)');
                        ctx.beginPath(); ctx.arc(0, 0, sz, 0, Math.PI * 2); ctx.fillStyle = sg; ctx.fill(); ctx.restore();
                        continue;
                    }

                    if (particle.type === 'flame') {
                        particle.vx += Math.sin(time * 8 + particle.turbX * 20) * 0.08;
                        particle.vy -= 0.04 * intensity; particle.vx *= 0.97; particle.x += particle.vx; particle.y += particle.vy;
                        var hShift = (1 - lifeRatio) * 35;
                        var bright = 45 + (1 - lifeRatio) * 45;
                        var sz = particle.size * Math.sqrt(lifeRatio);
                        var alpha = lifeRatio * 0.9 * intensity;
                        var fg = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, sz);
                        fg.addColorStop(0, 'hsla(' + (particle.hue + hShift + 40) + ',100%,95%,' + (alpha * 0.9) + ')');
                        fg.addColorStop(0.3, 'hsla(' + (particle.hue + hShift) + ',100%,' + bright + '%,' + alpha + ')');
                        fg.addColorStop(0.7, 'hsla(' + particle.hue + ',100%,40%,' + (alpha * 0.6) + ')');
                        fg.addColorStop(1, 'hsla(' + particle.hue + ',100%,20%,0)');
                        ctx.beginPath(); ctx.arc(particle.x, particle.y, sz, 0, Math.PI * 2); ctx.fillStyle = fg; ctx.fill();
                        continue;
                    }

                    if (particle.type === 'ember') {
                        particle.vy += 0.12; particle.vx *= 0.98; particle.vy *= 0.98; particle.x += particle.vx; particle.y += particle.vy;
                        var emberSize = particle.size * lifeRatio;
                        var alpha = lifeRatio * intensity;
                        var eg = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, emberSize + 1);
                        eg.addColorStop(0, 'hsla(' + (particle.hue + 20) + ',100%,100%,' + alpha + ')');
                        eg.addColorStop(0.5, 'hsla(' + particle.hue + ',100%,80%,' + (alpha * 0.7) + ')');
                        eg.addColorStop(1, 'hsla(' + particle.hue + ',100%,50%,0)');
                        ctx.beginPath(); ctx.arc(particle.x, particle.y, emberSize + 1, 0, Math.PI * 2); ctx.fillStyle = eg; ctx.fill();
                        continue;
                    }

                    if (particle.type === 'sparkle') {
                        particle.x += particle.vx; particle.y += particle.vy; particle.vy += 0.05;
                        var sz = particle.size * lifeRatio;
                        var alpha = lifeRatio * 0.85 * intensity;
                        ctx.save(); ctx.translate(particle.x, particle.y); ctx.rotate(lifeRatio * 4);
                        ctx.fillStyle = 'hsla(' + particle.hue + ',90%,75%,' + alpha + ')';
                        ctx.beginPath();
                        var sparkleHalfSize = sz;
                        ctx.moveTo(0, -sparkleHalfSize); ctx.lineTo(sparkleHalfSize * 0.25, -sparkleHalfSize * 0.25);
                        ctx.lineTo(sparkleHalfSize, 0); ctx.lineTo(sparkleHalfSize * 0.25, sparkleHalfSize * 0.25);
                        ctx.lineTo(0, sparkleHalfSize); ctx.lineTo(-sparkleHalfSize * 0.25, sparkleHalfSize * 0.25);
                        ctx.lineTo(-sparkleHalfSize, 0); ctx.lineTo(-sparkleHalfSize * 0.25, -sparkleHalfSize * 0.25);
                        ctx.closePath(); ctx.fill();
                        ctx.beginPath(); ctx.arc(0, 0, sz * 0.25, 0, Math.PI * 2);
                        ctx.fillStyle = 'hsla(60,100%,95%,' + alpha + ')'; ctx.fill();
                        ctx.restore();
                    }
                }

                ctx.globalCompositeOperation = 'source-over';
                animId = requestAnimationFrame(tick);
            }

            function mount() {
                var container = document.querySelector('.nbl-widget-scroll-area-v1');
                if (!container) return;
                canvas = document.createElement('canvas');
                canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;border-radius:inherit;';
                container.appendChild(canvas);

                function resize() { canvas.width = container.offsetWidth; canvas.height = container.offsetHeight; }
                resize();
                ctx = canvas.getContext('2d');

                container.addEventListener('mousemove', function (e) {
                    if (!isOpen) return;
                    var rect = canvas.getBoundingClientRect();
                    var mouseX = e.clientX - rect.left;
                    var mouseY = e.clientY - rect.top;
                    if (Math.abs(mouseX - lastX) > 2 || Math.abs(mouseY - lastY) > 2) {
                        spawnAt(mouseX, mouseY);
                        lastX = mouseX; lastY = mouseY;
                    }
                }, { passive: true });

                // mount() is called from widget:first-open, which fires inside
                // widget:opened — so the widget is already open at this point.
                // Set isOpen = true immediately so mousemove works on the first open.
                isOpen = true;

                /** @listens widget:opened */
                eventBus.on('widget:opened', function () { isOpen = true; });
                /** @listens widget:closed */
                eventBus.on('widget:closed', function () {
                    isOpen = false;
                    particles = [];
                    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
                });

                window.addEventListener('resize', resize, { passive: true });
                tick();
            }

            mount();
        });

        // ─────────────────────────────────────────────────────────────────────────
        // SECTION 18: BOOTSTRAP
        // Only buildHTML + applyTheme run at page load.
        // Everything else boots via events.
        // ─────────────────────────────────────────────────────────────────────────

        buildHTML();
        applyTheme();

        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                var headerElement = document.querySelector('.nbl-widget-header-v1');
                if (headerElement) headerElement.classList.add('nbl-header-ready-v1');
            });
        });

        function fireDomLoaded() {
            if (loyaltyApp.points == null) {
                var config = loyaltyApp.customer && loyaltyApp.customer.config;
                loyaltyApp.points = config && config.points ? Number(config.points) : 0;
            }

            /** @fires dom:loaded — widget shell is in the DOM, trigger button shown */
            eventBus.emit('dom:loaded', { target: document });

            var triggerButtonWrapper = document.querySelector('.nbl-wo-wrapper-v1');
            if (triggerButtonWrapper) triggerButtonWrapper.classList.remove('nbl-d-none-v1');
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fireDomLoaded);
        } else {
            fireDomLoaded();
        }

    } // end init()

    onReady(init);

})();
// =============================================================================
// modules/bus.js
// Production-grade pub/sub event bus.
// No DOM, no side effects — pure class definition.
// =============================================================================

export function NBLEventBus() {
    this._listeners = {};
    this._stickyPayloads = {};
    this._logConfig = {
        enabled: false,
        logEmit: true,
        logSticky: true,
        logLateSubscriber: true,
        logErrors: true,
        filterNamespaces: [],
        labelColor: '#7c3aed'
    };
}

NBLEventBus.prototype = {

    on: function (eventName, handler, options) {
        var priority = (options && options.priority) || 0;
        if (!this._listeners[eventName]) this._listeners[eventName] = [];
        this._listeners[eventName].push({ handler: handler, priority: priority });
        this._listeners[eventName].sort(function (a, b) { return b.priority - a.priority; });

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

    off: function (eventName, handler) {
        if (!this._listeners[eventName]) return this;
        this._listeners[eventName] = this._listeners[eventName].filter(function (entry) {
            return entry.handler !== handler;
        });
        return this;
    },

    once: function (eventName, handler, options) {
        var self = this;
        var onceWrapper = function (data) {
            handler(data);
            self.off(eventName, onceWrapper);
        };
        return this.on(eventName, onceWrapper, options);
    },

    _shouldLog: function (eventName) {
        if (!this._logConfig.enabled) return false;
        var filter = this._logConfig.filterNamespaces;
        if (!filter || filter.length === 0) return true;
        for (var f = 0; f < filter.length; f++) {
            if (eventName === filter[f] || eventName.indexOf(filter[f] + ':') === 0) return true;
        }
        return false;
    },

    emit: function (eventName, eventData) {
        if (this._logConfig.logEmit && this._shouldLog(eventName)) {
            var count = (this._listeners[eventName] || []).length;
            console.groupCollapsed(
                '%c[NBL Bus]%c ' + eventName + ' %c' + count + ' listener' + (count !== 1 ? 's' : ''),
                'color:' + this._logConfig.labelColor + ';font-weight:500',
                'color:inherit',
                'color:#888;font-size:11px'
            );
            if (eventData !== undefined) console.log('payload:', eventData);
            console.log('time:', new Date().toISOString());
            console.groupEnd();
        }

        var specific = this._listeners[eventName] || [];
        var wildcard = this._listeners['*'] || [];
        var all = specific.concat(wildcard);
        for (var i = 0; i < all.length; i++) {
            try { all[i].handler(eventData); } catch (err) {
                if (this._logConfig.logErrors) {
                    console.error('[NBL Bus] Error in handler for "' + eventName + '":', err);
                }
            }
        }
        return this;
    },

    emitSticky: function (eventName, eventData) {
        this._stickyPayloads[eventName] = eventData;
        if (this._logConfig.logSticky && this._shouldLog(eventName)) {
            console.log(
                '%c[NBL Bus]%c sticky: ' + eventName,
                'color:' + this._logConfig.labelColor + ';font-weight:500',
                'color:#0891b2'
            );
        }
        return this.emit(eventName, eventData);
    },

    clear: function (eventName) {
        if (!eventName) { this._listeners = {}; this._stickyPayloads = {}; return; }
        if (this._listeners[eventName]) {
            delete this._listeners[eventName];
            delete this._stickyPayloads[eventName];
            return;
        }
        var namespace = eventName + ':';
        var self = this;
        Object.keys(this._listeners).forEach(function (key) {
            if (key === eventName || key.indexOf(namespace) === 0) {
                delete self._listeners[key];
                delete self._stickyPayloads[key];
            }
        });
    },

    hasListeners: function (eventName) {
        return !!(this._listeners[eventName] && this._listeners[eventName].length > 0);
    },

    listenerCount: function (eventName) {
        return (this._listeners[eventName] || []).length;
    },

    setLogConfig: function (options) {
        var self = this;
        Object.keys(options).forEach(function (key) {
            if (self._logConfig.hasOwnProperty(key)) self._logConfig[key] = options[key];
        });
        return this;
    },

    debug: function (enabled) {
        this._logConfig.enabled = !!enabled;
        console.log('[NBL Bus] logging ' + (enabled ? 'enabled' : 'disabled'));
        return this;
    }
};
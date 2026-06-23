// =============================================================================
// modules/store.js
// Single shared state — init once at boot, import anywhere.
// No parameters needed in any module — just call getStore().
// =============================================================================

var _store = {
    loyaltyApp: null,
    appConfig: null,
    eventBus: null,
};

/**
 * Called once in init() before any other module boots.
 * @param {object} loyaltyApp  window.NBL_v1
 * @param {object} appConfig   loyaltyApp.appConfig
 */
export function initStore(loyaltyApp, appConfig) {
    _store.loyaltyApp = loyaltyApp;
    _store.appConfig = appConfig;
    _store.eventBus = loyaltyApp.bus;
}

/**
 * Returns the shared store object.
 * Destructure what you need:
 *   var { eventBus, loyaltyApp, appConfig } = getStore();
 */
export function getStore() {
    return _store;
}
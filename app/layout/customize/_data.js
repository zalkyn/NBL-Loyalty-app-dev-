import { WIDGET_CONFIG_DEFAULTS } from "./constants/cssVarsConfig";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG KEY HELPERS
//
// Pure — no server-only imports. configKey may be a flat key ("someKey") or
// a dotted path into a nested group ("labels.foo", "prize.bar").
// ─────────────────────────────────────────────────────────────────────────────

/** Read a (possibly nested) configKey value from widgetConfig. */
// Generic dot-path readers — configKey is either flat ("paginationMode") or
// one level deep ("labels.headerLabel", "referral.redirectEnabled",
// "resync.showUpdateBanner", etc., matching cssVarsConfig.js's
// WIDGET_CONFIG_SECTIONS `configKey` values). These used to be a hardcoded
// if/else per known prefix ("labels."/"prize."/"referral.") — the exact
// same class of bug as handleConfigChange in _hooks.js: adding a new
// section ("resync") without also adding a branch HERE meant
// getConfigValue always fell through to the flat-key `else`, which looked
// for a literal `widgetConfig["resync.showUpdateBanner"]` key that never
// existed (the real value is properly nested at
// widgetConfig.resync.showUpdateBanner) — so the toggle always read as its
// hardcoded fallback, and getConfigDefault always returned `undefined`
// (comparing an always-false value against undefined), so isDirty was
// permanently stuck `true` — "Modified" even right after Reset all.
// Splitting generically on the first "." removes the whole class of bug,
// same as handleConfigChange: any section added to cssVarsConfig.js just
// works, no second (or third) place to remember to update.

/** Read a (possibly nested) value for a configKey from widgetConfig, falling back if absent. */
export function getConfigValue(widgetConfig, configKey, fallback) {
    const dotIndex = configKey.indexOf(".");
    if (dotIndex === -1) return widgetConfig[configKey] ?? fallback;
    const section = configKey.slice(0, dotIndex);
    const fieldKey = configKey.slice(dotIndex + 1);
    return widgetConfig[section]?.[fieldKey] ?? fallback;
}

/** Read a default value for a (possibly nested) configKey from WIDGET_CONFIG_DEFAULTS. */
export function getConfigDefault(configKey) {
    const dotIndex = configKey.indexOf(".");
    if (dotIndex === -1) return WIDGET_CONFIG_DEFAULTS[configKey];
    const section = configKey.slice(0, dotIndex);
    const fieldKey = configKey.slice(dotIndex + 1);
    return WIDGET_CONFIG_DEFAULTS[section]?.[fieldKey];
}

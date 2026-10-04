import prisma from "db-server";
import syncAppConfig, { STOREFRONT_NOT_UPDATED } from "@controller/metafieldsSync/syncAppConfig";
import searchPages from "@graphql/query/shop/searchPages";
import { CSS_DEFAULTS, WIDGET_CONFIG_DEFAULTS, deepClone } from "./constants/cssVarsConfig";
import { validateCustomCss } from "./constants/customCss";
import { logger } from "app/utils/logger.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "layout/customize/_action.server.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared upsert + sync helper. Every intent below ends with the same
// "write to DB, then push the fresh config to the storefront" sequence.
// ─────────────────────────────────────────────────────────────────────────────

async function upsertAndSync(session, admin, cssVars, presetKey = null, widgetConfig = null) {
    const data = { cssVars, presetKey, widgetConfig };
    await prisma.style.upsert({
        where: { shop: session.shop },
        update: data,
        create: { shop: session.shop, sessionId: session.id, ...data },
    });
    // Whether the storefront copy was updated — see syncAppConfig's return.
    return syncAppConfig(admin, session);
}

// ── UPDATE ───────────────────────────────────────────────────────────────────

export async function handleUpdate({ formData, session, admin }) {
    const intent = "update";

    try {
        const cssVars = JSON.parse(formData.get("cssVars") || "{}");
        const presetKey = formData.get("presetKey") || null;
        const rawWidgetConfig = formData.get("widgetConfig");
        const widgetConfig = rawWidgetConfig ? JSON.parse(rawWidgetConfig) : null;

        // Same check the form runs before submitting — repeated here so a
        // request that skipped the form can't store CSS it would have refused
        // (notably "<", which could break out of the storefront <script>).
        const customCssError = validateCustomCss(widgetConfig?.customCss);
        if (customCssError) {
            return { ok: false, intent, message: customCssError };
        }

        const synced = await upsertAndSync(session, admin, cssVars, presetKey, widgetConfig);

        if (!synced) {
            // Saved in the app, but the storefront still has the old styles.
            // ok:false keeps the form dirty with the save bar showing, so one
            // more click on Save re-runs the sync.
            return {
                ok: false, intent,
                message: "Your changes were saved, but your store couldn't be updated right now. Click Save again to retry.",
            };
        }

        return {
            ok: true, intent, message: "Widget styles saved successfully.",
            savedCssVars: cssVars, savedPresetKey: presetKey, savedWidgetConfig: widgetConfig,
        };
    } catch (err) {
        logger.error("Update customize error", { module: MODULE, intent, error: err?.message, shop: session.shop });
        return { ok: false, intent, message: "Something went wrong. Please try again." };
    }
}

// ── RESET ALL — back to CSS_DEFAULTS, no preset, WIDGET_CONFIG_DEFAULTS ────

export async function handleResetAll({ session, admin }) {
    const intent = "resetAll";

    try {
        const fresh = { ...CSS_DEFAULTS };
        // Full defaults, not null — syncAppConfig.js pushes this value
        // straight to the storefront's nbl_config_v1 metafield with NO
        // defaults merge applied (that merge, buildInitialWidgetConfig(),
        // only ever runs client-side for the ADMIN's own preview/display).
        // A `null` here used to look completely fine in the admin's own
        // live preview (which merges defaults locally) while silently
        // breaking the real storefront the moment any component's lbl()
        // call lacked its own hardcoded fallback text (see
        // LauncherButton.jsx's launcherTitle/launcherSubtitle bug this
        // exact issue caused). Writing the real defaults here removes the
        // whole class of bug instead of relying on every single lbl() call
        // site remembering to duplicate a matching fallback.
        const freshWidgetConfig = deepClone(WIDGET_CONFIG_DEFAULTS);
        const synced = await upsertAndSync(session, admin, fresh, null, freshWidgetConfig);

        // Stays ok:true even if the sync failed: the reset IS saved, and
        // ok:false would leave the old values on screen, where one Save
        // would overwrite the reset. syncFailed turns the toast red instead.
        return {
            ok: true, intent, syncFailed: !synced,
            message: synced ? "All styles reset to defaults." : `All styles reset to defaults, ${STOREFRONT_NOT_UPDATED}`,
            savedCssVars: fresh, savedPresetKey: null, savedWidgetConfig: freshWidgetConfig,
        };
    } catch (err) {
        logger.error("Reset-all customize error", { module: MODULE, intent, error: err?.message, shop: session.shop });
        return { ok: false, intent, message: "Something went wrong. Please try again." };
    }
}

// ── CLEAR ALL — CSS wipes to null (ui.css's own :root defaults cover it,
//    see comment below), widgetConfig gets real defaults for the same
//    reason as handleResetAll above ────────────────────────────────────────

export async function handleClearAll({ session, admin }) {
    const intent = "clearAll";

    try {
        // cssVars: null is safe — every --nbl-* custom property has its
        // own fallback value defined directly in ui.css's :root block, so
        // the storefront renders correctly with no CSS vars synced at all.
        // widgetConfig has no equivalent browser-level fallback mechanism
        // (it's plain text/behavior data, not CSS) — see handleResetAll's
        // comment above for why null there silently breaks the real
        // storefront even though the admin's own preview looks fine.
        const freshWidgetConfig = deepClone(WIDGET_CONFIG_DEFAULTS);
        await prisma.style.upsert({
            where: { shop: session.shop },
            update: { cssVars: null, presetKey: null, widgetConfig: freshWidgetConfig },
            create: { shop: session.shop, sessionId: session.id, cssVars: null, presetKey: null, widgetConfig: freshWidgetConfig },
        });
        const synced = await syncAppConfig(admin, session);

        // ok:true for the same reason as handleResetAll.
        return {
            ok: true, intent, syncFailed: !synced,
            message: synced ? "Custom styles cleared. Widget is now using default CSS." : `Custom styles cleared, ${STOREFRONT_NOT_UPDATED}`,
            savedCssVars: null, savedPresetKey: null, savedWidgetConfig: freshWidgetConfig,
        };
    } catch (err) {
        logger.error("Clear-all customize error", { module: MODULE, intent, error: err?.message, shop: session.shop });
        return { ok: false, intent, message: "Something went wrong. Please try again." };
    }
}

// ── SEARCH PAGES — backs the "Show widget on" page picker. Called via its
//    own useFetcher (see ConfigPagePickerField.jsx), NOT through the main
//    useSubmit()/actionData flow the other three intents share — so a
//    search-as-you-type keystroke never touches isNetworkSubmitting or
//    the save/discard state the rest of the page tracks. ─────────────────

export async function handleSearchPages({ formData, admin }) {
    const intent = "searchPages";
    const term = formData.get("search") || "";
    const pages = await searchPages(admin, term);
    return { ok: true, intent, pages };
}
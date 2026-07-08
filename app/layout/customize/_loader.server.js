import prisma from "db-server";
import { logger } from "app/utils/logger.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "layout/customize/_loader.server.js";

// ─────────────────────────────────────────────────────────────────────────────
// Server-only. Never import from client code (_hooks.js or components/).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Loads the shop's saved widget style record, if any.
 *
 * Degrades to defaults (rather than throwing and crashing the whole page)
 * on a transient DB failure — the customize page is still usable with
 * empty/default styles even if we can't read the saved record right now.
 *
 * @param {string} shop
 * @returns {{ savedCssVars: object|null, savedPresetKey: string|null, savedWidgetConfig: object|null }}
 */
export async function loadCustomizeData(shop) {
    try {
        const style = await prisma.style.findUnique({ where: { shop } });
        return {
            savedCssVars: style?.cssVars ?? null,
            savedPresetKey: style?.presetKey ?? null,
            savedWidgetConfig: style?.widgetConfig ?? null,
        };
    } catch (err) {
        logger.error("Failed to load customize data", { module: MODULE, shop, error: err?.message });
        return { savedCssVars: null, savedPresetKey: null, savedWidgetConfig: null };
    }
}

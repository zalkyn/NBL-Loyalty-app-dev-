/**
 * @file scripts/migrate-resync-update-mode.js
 * @description ONE-OFF DATA MIGRATION. Converts every shop's saved
 * `Style.widgetConfig.resync.showUpdateBanner` (old boolean) to
 * `Style.widgetConfig.resync.updateMode` (new tri-state: "off" | "banner").
 *
 * Why this is needed: `resync.updateMode` replaced `resync.showUpdateBanner`
 * in cssVarsConfig.js. A shop that previously saved
 * `{ resync: { showUpdateBanner: true } }` still has exactly that JSON in
 * its `Style` row — the new code doesn't know that key anymore, defaults
 * to `updateMode: "off"`, and that shop's banner would silently disappear
 * for real customers. This script fixes that.
 *
 * Two steps per affected shop:
 *   1. Fix the DB row (Style.widgetConfig).
 *   2. Immediately re-push the corrected config to that shop's live
 *      `nbl_config_v1` storefront metafield (same call syncAppConfig.js
 *      already makes elsewhere) — otherwise the fix only reaches the
 *      storefront the NEXT time something happens to trigger a sync
 *      (Customize save, new version publish), which could be a long wait
 *      for a shop nobody happens to touch.
 *
 * Idempotent — safe to re-run; rows that already have `updateMode` set
 * (or have no `resync` section at all) are left untouched.
 *
 * Usage:
 *   node scripts/migrate-resync-update-mode.js          # dry run — logs planned changes only
 *   node scripts/migrate-resync-update-mode.js --apply   # writes the DB change AND re-syncs the shop's metafield
 * npm run migrate:resync-update-mode          # প্রথমে dry-run, কিছু বদলাবে না
 * npm run migrate:resync-update-mode -- --apply   # log ঠিক লাগলে, আসল রান
 */

import prisma from "../app/db.server.js";
import { unauthenticated } from "../app/shopify.server.js";
import syncAppConfig from "../app/controller/metafieldsSync/syncAppConfig.js";

const APPLY = process.argv.includes("--apply");

async function main() {
    const rows = await prisma.style.findMany({
        select: { id: true, shop: true, widgetConfig: true },
    });

    let toMigrate = 0;
    let migrated = 0;
    let resynced = 0;

    for (const row of rows) {
        const resync = row.widgetConfig?.resync;
        if (!resync || typeof resync !== "object") continue;
        if ("updateMode" in resync) continue; // already migrated
        if (!("showUpdateBanner" in resync)) continue; // nothing to convert

        toMigrate++;
        const updateMode = resync.showUpdateBanner === true ? "banner" : "off";

        console.log(
            `[${APPLY ? "APPLY" : "DRY RUN"}] shop=${row.shop} styleId=${row.id} ` +
            `showUpdateBanner=${resync.showUpdateBanner} -> updateMode="${updateMode}"`
        );

        if (!APPLY) continue;

        const nextResync = { ...resync, updateMode };
        delete nextResync.showUpdateBanner;

        await prisma.style.update({
            where: { id: row.id },
            data: {
                widgetConfig: {
                    ...row.widgetConfig,
                    resync: nextResync,
                },
            },
        });
        migrated++;

        // Push the fix live right away — mirrors what a Customize page
        // save or version publish already does. Best-effort: if a shop's
        // offline session is missing/expired (app uninstalled, etc.), the
        // DB row is still fixed correctly; only the immediate storefront
        // push is skipped for that shop.
        try {
            const { admin, session } = await unauthenticated.admin(row.shop);
            await syncAppConfig(admin, session);
            resynced++;
            console.log(`  -> re-synced ${row.shop}'s storefront metafield`);
        } catch (err) {
            console.warn(`  -> could not re-sync ${row.shop} live (DB fix still applied):`, err?.message);
        }
    }

    console.log(
        `\nDone. ${toMigrate} row(s) needed migration.` +
        (APPLY ? ` ${migrated} updated, ${resynced} re-synced live.` : " Re-run with --apply to write these changes.")
    );
}

main()
    .catch((err) => {
        console.error("Migration failed:", err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

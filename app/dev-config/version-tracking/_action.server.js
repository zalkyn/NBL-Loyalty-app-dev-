/**
 * @file dev-config/version-tracking/_action.server.js
 * @description Action for the Version Tracking page — publishing a new
 * ConfigUpdateVersion. Customer sync (bulk and single) moved out to its
 * own page — see dev-config/customer-sync/_action.server.js.
 */

import { authenticate } from "shopify-server";

import createConfigUpdateVersion from "@controller/configUpdateVersion/createConfigUpdateVersion";
import syncAppConfig, { syncOutcome } from "@controller/metafieldsSync/syncAppConfig";
import { logger } from "app/utils/logger.js";

const MODULE = "dev-config/version-tracking/_action.server.js";

export const action = async ({ request }) => {
    const { session, admin } = await authenticate.admin(request);
    const formData = await request.formData();

    const title = formData.get("title")?.toString() || "";
    const description = formData.get("description")?.toString() || "";

    try {
        const version = await createConfigUpdateVersion({ shop: session.shop, title, description });

        // Push the new active version to the shop metafield so it's visible
        // to the storefront right away — mirrors the Customize page's own
        // upsertAndSync pattern (save to DB, then sync).
        const synced = await syncAppConfig(admin, session);

        return {
            ok: true,
            ...syncOutcome(synced, `"${version.title}" is now the active version.`, `"${version.title}" is now the active version`),
        };
    } catch (error) {
        logger.error(MODULE, "Failed to create config update version", { shop: session.shop, error: error?.message });
        return { ok: false, message: error?.message || "Failed to create version." };
    }
};

import { authenticate } from "shopify-server";
import db from "db-server";
import { logger } from "app/utils/logger.js";
import { dbRetry } from "app/utils/retry/dbRetry.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "webhook-routes/app-uninstalled.jsx";

/**
 * POST /webhooks/app/uninstalled
 *
 * Invalidates the shop's session on uninstall by clearing its access token.
 * Rows are kept (not deleted) so shop history/config isn't lost if the
 * merchant reinstalls later — a fresh OAuth simply repopulates accessToken.
 *
 * Shopify may redeliver this webhook, including after the session has
 * already been cleared — handled as a no-op via updateMany's `where: { shop }`.
 *
 * @param {{ request: Request }} args - Remix action arguments
 * @returns {Promise<Response>}
 */
export const action = async ({ request }) => {
    const { shop, session, topic } = await authenticate.webhook(request);

    logger.info(MODULE, `Received ${topic} webhook`, { shop });

    if (!session) {
        return new Response();
    }

    try {
        await dbRetry(
            () => db.session.updateMany({ where: { shop }, data: { accessToken: "" } }),
            { module: MODULE, shop }
        );
    } catch (error) {
        logger.error(MODULE, "Failed to clear session on uninstall", { shop, error: error?.message });
    }

    return new Response();
};

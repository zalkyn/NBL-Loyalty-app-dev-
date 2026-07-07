import { authenticate } from "shopify-server";
import db from "db-server";
import { logger } from "app/utils/logger.js";
import { dbRetry } from "app/utils/retry/dbRetry.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "webhook-routes/scopes-update.jsx";

/**
 * POST /webhooks/app/scopes_update
 *
 * Fired when the merchant approves a new/changed set of access scopes.
 * Persists the updated scope list onto the shop's session row so the
 * app's stored session always reflects what's actually been granted.
 *
 * @param {{ request: Request }} args - Remix action arguments
 * @returns {Promise<Response>}
 */
export const action = async ({ request }) => {
    const { payload, session, topic, shop } = await authenticate.webhook(request);

    logger.info(MODULE, `Received ${topic} webhook`, { shop });

    if (!session) {
        return new Response();
    }

    const current = payload.current;

    try {
        await dbRetry(
            () => db.session.update({ where: { id: session.id }, data: { scope: current.toString() } }),
            { module: MODULE, shop }
        );
    } catch (error) {
        logger.error(MODULE, "Failed to persist updated scopes", { shop, error: error?.message });
    }

    return new Response();
};

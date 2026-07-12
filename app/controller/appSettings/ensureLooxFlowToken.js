import prisma from "../../db.server.js";
import generateLooxFlowToken from "../../utils/generateLooxFlowToken.js";
import { logger } from "../../utils/logger.js";
import { dbRetry } from "../../utils/retry/dbRetry.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "controller/appSettings/ensureLooxFlowToken";

/**
 * Ensures the given shop has an AppSettings row with a `looxFlowToken` set,
 * creating the row (or backfilling the token onto an existing row) if
 * needed. Idempotent — safe to call on every page load.
 *
 * @param {Object} session    - Shopify session (id + shop)
 * @param {boolean} [force]   - Overwrite an existing token with a new one
 *                              (used by the "Regenerate URL" action).
 * @returns {Promise<string>} The shop's current looxFlowToken
 */
export default async function ensureLooxFlowToken(session, force = false) {
    const existing = await dbRetry(
        () =>
            prisma.appSettings.findUnique({
                where: { sessionId: session.id },
                select: { looxFlowToken: true },
            }),
        { module: MODULE, shop: session.shop }
    );

    if (existing?.looxFlowToken && !force) {
        return existing.looxFlowToken;
    }

    const token = await generateLooxFlowToken();

    if (existing) {
        await dbRetry(
            () =>
                prisma.appSettings.update({
                    where: { sessionId: session.id },
                    data: { looxFlowToken: token },
                }),
            { module: MODULE, shop: session.shop }
        );
    } else {
        try {
            await dbRetry(
                () =>
                    prisma.appSettings.create({
                        data: {
                            shop: session.shop,
                            sessionId: session.id,
                            settings: {},
                            looxFlowToken: token,
                        },
                    }),
                { module: MODULE, shop: session.shop }
            );
        } catch (err) {
            // P2002 — a concurrent request (e.g. two open tabs) already
            // created the row first. Fall back to reading its token
            // instead of failing the page load.
            if (err?.code === "P2002") {
                const race = await dbRetry(
                    () =>
                        prisma.appSettings.findUnique({
                            where: { sessionId: session.id },
                            select: { looxFlowToken: true },
                        }),
                    { module: MODULE, shop: session.shop }
                );
                if (race?.looxFlowToken) return race.looxFlowToken;
            }
            throw err;
        }
    }

    logger.info(MODULE, force ? "Loox Flow token regenerated" : "Loox Flow token created", {
        shop: session.shop,
    });

    return token;
}

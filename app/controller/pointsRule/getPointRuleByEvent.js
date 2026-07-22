import { logger } from "../../utils/logger.js";
import prisma from "../../db.server.js";
import { dbRetry } from "../../utils/retry/dbRetry.js";

/**
 * Fetches the active PointsRule for a given event type, scoped to a single shop.
 *
 * Both PointsRule and Event are shop-scoped (`sessionId`), so `sessionId` is
 * required here — without it this query would match across every shop in
 * the database and could return another merchant's rule.
 *
 * @param {string} event - Event type e.g. "ORDER" | "REFERRAL" | "REVIEW"
 * @param {string} sessionId - Shopify session ID identifying the shop
 * @returns {Promise<Object|null>} Active PointsRule with its Event included,
 *   or null if not found, inactive, or on error
 */
export const getPointRuleByEvent = async (event = null, sessionId = null) => {
    if (!event || !sessionId) {
        logger.warn("getPointRuleByEvent called without event type or sessionId", { event, sessionId });
        return null;
    }

    try {
        const rule = await dbRetry(
            () =>
                prisma.pointsRule.findFirst({
                    where: {
                        sessionId,
                        isActive: true,
                        event: {
                            sessionId,
                            type: { equals: event, mode: "insensitive" },
                            isActive: true,
                        },
                    },
                    include: { event: true },
                }),
            { event, sessionId }
        );

        return rule ?? null;
    } catch (error) {
        logger.error("getPointRuleByEvent error", {
            event,
            sessionId,
            message: error?.message,
        });
        return null;
    }
};
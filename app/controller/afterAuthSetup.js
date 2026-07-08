import { logger } from "../utils/logger.js";
import prisma from "../db.server.js";
import syncAppConfig from "./metafieldsSync/syncAppConfig.js";
import { dbRetry } from "../utils/retry/dbRetry.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "controller/afterAuthSetup.js";

/**
 * Runs one-time setup after a shop completes OAuth (fresh install or
 * re-auth): seeds the default loyalty events and pushes the initial app
 * config metafield.
 *
 * Both steps are best-effort — a failure here does not block the OAuth
 * flow, but does mean the shop is missing default events and/or config
 * until the next successful sync (e.g. next dashboard load or cron cycle).
 *
 * @param {object} args
 * @param {object} args.admin   - Shopify Admin GraphQL client
 * @param {object} args.session - Shopify session for the newly authenticated shop
 * @returns {Promise<void>}
 */
export default async function afterAuthSetup({ admin, session }) {
    try {
        await eventSeeder(session);
        await syncAppConfig(admin, session);
    } catch (error) {
        logger.error(MODULE, "afterAuthSetup failed", { shop: session?.shop, error: error?.message });
    }
}

/**
 * Seeds initial loyalty program events for a given shop session.
 * Upserts the three core event types: ORDER, REFERRAL, and REVIEW.
 *
 * @param {object} session - The active Shopify session object.
 * @param {string} session.id - Unique session identifier.
 * @param {string} session.shop - Shop domain (e.g. "my-store.myshopify.com").
 * @returns {Promise<void>}
 */
const eventSeeder = async (session) => {
    const SEED_EVENTS = [
        {
            name: "Direct Purchase",
            type: "ORDER",
            description: "Customer places an order and completes the checkout process. Rewards are granted when the order is marked as paid in Shopify.",
        },
        {
            name: "Refer a Friend",
            type: "REFERRAL",
            description: "Customer refers a friend who makes a purchase using their referral code. Rewards are granted when the referred friend completes a purchase using the referral code.",
        },
        {
            name: "Loox Review Written",
            type: "REVIEW",
            description: "Customer writes a product review on Loox, There are three types of reviews that can be rewarded: Text Review: A standard written review without photos. Photo Review: A review that includes photos of the product. Video Review: A review that includes a video showcasing the product.",
        },
    ];

    try {
        // Wrapped in dbRetry — this runs once per install/re-auth, and a
        // transient DB blip here would silently leave the shop without any
        // seeded events, blocking every point rule until manually re-run.
        await dbRetry(
            () =>
                Promise.all(
                    SEED_EVENTS.map((event) =>
                        prisma.event.upsert({
                            where: {
                                sessionId_type: {
                                    sessionId: session.id,
                                    type: event.type,
                                },
                            },
                            update: {
                                name: event.name,
                                description: event.description,
                            },
                            create: {
                                shop: session.shop,
                                sessionId: session.id,
                                name: event.name,
                                type: event.type,
                                description: event.description,
                            },
                        })
                    )
                ),
            { module: MODULE, shop: session.shop }
        );

        logger.info(MODULE, "Seeded default events", { shop: session.shop, count: SEED_EVENTS.length });
    } catch (error) {
        logger.error(MODULE, "eventSeeder failed", { shop: session.shop, error: error?.message });
    }
};

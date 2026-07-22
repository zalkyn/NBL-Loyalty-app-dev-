import prisma from "../../db.server.js";
import { logger } from "../../utils/logger.js";
import generateReferralCode from "../../utils/generateReferralCode.js";
import { dbRetry } from "../../utils/retry/dbRetry.js";

/**
 * Upserts a single Shopify customer payload into the local Customer table.
 * Generates a referral code for new customers. Isolated failures (missing
 * email, referral code generation failure, or a DB error after retries)
 * return `null` instead of throwing, so a bulk sync can safely run this
 * over many customers via `Promise.allSettled` without one bad record
 * aborting the batch.
 *
 * @param {Object} session  - Shopify session (used to scope new customers to this shop)
 * @param {Object} customer - Raw Shopify customer payload (GraphQL node or REST webhook shape)
 * @returns {Promise<Object|null>} The upserted Prisma Customer record, or null on failure
 */
export const storeCustomer = async (session, customer) => {
    const email =
        customer?.defaultEmailAddress?.emailAddress ||
        customer?.email ||
        null;

    if (!email) {
        logger.warn("storeCustomer: no email in payload, skipping", {
            shopifyId: customer?.admin_graphql_api_id || customer?.id,
        });
        return null;
    }

    const shopifyId = customer?.admin_graphql_api_id || String(customer.id);
    const name = `${customer.firstName || customer.first_name || ""} ${customer.lastName || customer.last_name || ""}`.trim();

    const referralCode = await generateReferralCode();

    if (!referralCode) {
        logger.error("storeCustomer: failed to generate referral code", {
            shopifyId,
            email,
        });
        return null;
    }

    try {
        return await dbRetry(
            () =>
                prisma.customer.upsert({
                    where: {
                        shopifyId,
                    },
                    update: {
                        email,
                        name: name || null,
                        firstName: customer.firstName || customer.first_name || null,
                        lastName: customer.lastName || customer.last_name || null,
                        metadata: customer,
                    },
                    create: {
                        shopifyId,
                        name: name || null,
                        firstName: customer.firstName || customer.first_name || null,
                        lastName: customer.lastName || customer.last_name || null,
                        email,
                        referralCode: referralCode,
                        sessionId: session.id,
                        metadata: customer,
                        // "orders" deliberately omitted (stays null) — this
                        // path bulk-syncs customers who may already have real
                        // order history on Shopify; defaulting to 0 here
                        // would be a false "confirmed zero orders" rather
                        // than "unknown". Lazily backfilled on next admin
                        // customer-detail view — see schema.prisma.
                    },
                }),
            { shopifyId }
        );
    } catch (error) {
        logger.error("storeCustomer: upsert failed", {
            shopifyId,
            email,
            error: error?.message,
        });
        return null;
    }
};
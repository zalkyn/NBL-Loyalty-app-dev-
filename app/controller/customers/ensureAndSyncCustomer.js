/**
 * @file controller/customers/ensureAndSyncCustomer.js
 * @description Ensures an app-side Customer record exists for a given
 * Shopify customer, then always re-syncs their config metafield fresh from
 * the DB — creating the record first if it's missing.
 *
 * This is the self-healing core shared by:
 *   - widget-ui/provision-customer.jsx (silent auto-provision on page load)
 *   - widget-ui/join-program.jsx        (explicit "Join Our Program" click)
 *   - widget-ui/route.jsx               (periodic background config resync)
 *
 * Why resync needs this too, not just provision/join: a customer's Shopify
 * metafield can go on looking "valid" (has a `config.id`) even after their
 * underlying DB row is gone — e.g. someone wiped test data directly from
 * the database. Since provisionNeeded/needsJoin on the frontend only check
 * "is a config present in the metafield", a stale-but-present metafield
 * silently skips both the auto-provision and explicit-join paths forever.
 * Routing the periodic resync through this same ensure-then-sync logic
 * means it will detect and repair that case on its own, without needing
 * any separate "is this customer actually still in the DB" check anywhere
 * else in the codebase.
 */

import prisma from "../../db.server.js";
import { normalizeCustomerGid } from "./normalizeCustomerGid.js";
import { customer as fetchShopifyCustomer } from "../../graphql/query/customers.js";
import { syncCustomerConfig } from "../metafieldsSync/syncCustomerConfig.js";
import generateReferralCode from "../../utils/generateReferralCode.js";
import { withRetry } from "../../utils/retry/withRetry.js";
import { dbRetry } from "../../utils/retry/dbRetry.js";
import { logger } from "../../utils/logger.js";

const MODULE = "controller/customers/ensureAndSyncCustomer";

const FAST_RETRY = {
    maxAttempts: 2,
    baseDelayMs: 400,
    backoffFactor: 2,
    maxDelayMs: 1500,
    jitterFactor: 0.2,
    retryableErrors: ["fetch failed", "ECONNRESET", "ETIMEDOUT"],
};

/**
 * @param {Object} admin      - Shopify Admin GraphQL client
 * @param {Object} session    - Shopify session (id + shop)
 * @param {string} rawCustomerId - Raw `logged_in_customer_id` (GID or numeric)
 * @returns {Promise<{ config: Object|null, created: boolean }>}
 *          config  - The freshly-synced customer config (same shape written
 *                     to the metafield), or null if the Shopify customer
 *                     itself couldn't be found/fetched.
 *          created - true only when a NEW record was just created (lets
 *                     callers decide whether a reload is warranted).
 */
export default async function ensureAndSyncCustomer(admin, session, rawCustomerId) {
    const shop = session.shop;
    const shopifyId = normalizeCustomerGid(rawCustomerId);
    if (!shopifyId) return { config: null, created: false };

    const existing = await dbRetry(
        () => prisma.customer.findUnique({ where: { shopifyId }, select: { id: true } }),
        { module: MODULE, shop, shopifyId }
    );

    let created = false;

    if (!existing) {
        const shopifyCustomer = await withRetry(
            () => fetchShopifyCustomer(admin, shopifyId),
            { ...FAST_RETRY, context: { shop, customerId: shopifyId, module: MODULE } }
        );

        if (!shopifyCustomer) {
            logger.warn(MODULE, "Shopify customer not found — cannot create record", { shop, shopifyId });
            return { config: null, created: false };
        }

        const email = shopifyCustomer.defaultEmailAddress?.emailAddress || null;
        const referralCode = await generateReferralCode();

        try {
            await dbRetry(
                () =>
                    prisma.customer.create({
                        data: {
                            shopifyId,
                            name: `${shopifyCustomer.firstName || ""} ${shopifyCustomer.lastName || ""}`.trim() || null,
                            firstName: shopifyCustomer.firstName || null,
                            lastName: shopifyCustomer.lastName || null,
                            email,
                            referralCode,
                            sessionId: session.id,
                            metadata: shopifyCustomer,
                            // "orders" deliberately omitted (stays null) —
                            // unlike the customer-create webhook (fires the
                            // instant a brand-new Shopify customer is
                            // created, genuinely 0 orders), this path
                            // provisions customers who may have existed on
                            // Shopify for years before ever touching this
                            // app (e.g. pre-install customers, or a stale
                            // DB row being self-healed). 0 would be a false
                            // "confirmed zero orders". Lazily backfilled on
                            // next admin customer-detail view — see
                            // schema.prisma.
                        },
                        select: { id: true },
                    }),
                { module: MODULE, shop, shopifyId }
            );
            created = true;
            logger.success(MODULE, "Customer record created (self-healed)", { shop, shopifyId, referralCode });
        } catch (err) {
            // P2002 — a concurrent request (e.g. two tabs, or the explicit
            // join button firing at the same moment) already created it.
            // Not an error — just proceed to sync whatever now exists.
            if (err?.code !== "P2002") throw err;
        }
    }

    const config = await syncCustomerConfig(admin, shopifyId);
    return { config, created };
}

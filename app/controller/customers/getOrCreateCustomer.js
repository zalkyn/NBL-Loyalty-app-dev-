/**
 * @file controller/customers/getOrCreateCustomer.js
 * @description Returns the local Customer.id for a Shopify customer,
 * creating the local record via storeCustomer() ONLY if one doesn't
 * already exist.
 *
 * Deliberately checks first rather than always upserting — unlike
 * syncCustomersFromStore.js, which calls storeCustomer() unconditionally
 * for every customer in a bulk list. storeCustomer() unconditionally calls
 * generateReferralCode() before its upsert, even on the update path where
 * the generated code is never actually used (see store.js — the upsert's
 * `update` object doesn't include referralCode at all). For a customer who
 * already has a local record — the common case in a bulk operation over
 * customers who may already have used the widget before a backfill run —
 * that's a wasted DB round-trip (generateReferralCode's own
 * collision-check query) for every single one. Checking first (same shape
 * as ensureAndSyncCustomer.js's own existing-record check) skips that
 * entirely for anyone already on file. At 100k-customer scale this is the
 * difference between ~0 and ~100k pointless queries.
 */

import prisma from "../../db.server.js";
import { storeCustomer } from "./store.js";
import { dbRetry } from "../../utils/retry/dbRetry.js";

const MODULE = "controller/customers/getOrCreateCustomer";

/**
 * @param {Object} session - Shopify session (used to scope a NEW customer to this shop)
 * @param {Object} shopifyCustomer - Raw Shopify customer node — needs at
 *   least `id` (or `admin_graphql_api_id`) and an email field
 *   (`defaultEmailAddress.emailAddress` or `email`) — same shape
 *   customersPage()/customers() in graphql/query/customers.js return.
 * @returns {Promise<number|null>} Local Customer.id, or null if no local
 *   record exists AND storeCustomer() couldn't create one (e.g. the
 *   Shopify customer has no email at all — see store.js).
 */
export async function getOrCreateCustomer(session, shopifyCustomer) {
    const shopifyId = shopifyCustomer?.admin_graphql_api_id || String(shopifyCustomer?.id ?? "");
    if (!shopifyId) return null;

    const existing = await dbRetry(
        () => prisma.customer.findUnique({ where: { shopifyId }, select: { id: true } }),
        { module: MODULE, shopifyId }
    );
    if (existing) return existing.id;

    const created = await storeCustomer(session, shopifyCustomer);
    return created?.id ?? null;
}

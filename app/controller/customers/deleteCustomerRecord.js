/**
 * @file controller/customers/deleteCustomerRecord.js
 * @description Deletes a customer's Shopify app metafields
 * (INCLUDING the legacy `nbl_customer_v1` blob — see `includeLegacy` below,
 * this is the one thing that makes this tool different from "Empty
 * config") AND their app-database `Customer` row (cascading to their
 * transactions, rewards, prize claims, and referral history).
 *
 * This is deliberately a SEPARATE tool from "Empty config" (see
 * clearCustomerMetafields.js) — that one only clears the 4 split
 * metafields on purpose, to exercise the self-heal/fallback path
 * (ensureAndSyncCustomer.js finds the existing DB row and silently
 * re-syncs it, restoring the customer's real data). That's correct
 * behaviour for that tool, but it means "Empty config" can never be used
 * to see the widget's "Join our Program" step — for two independent
 * reasons, both of which this tool has to undo:
 *
 *   1. ensureAndSyncCustomer only takes the create/join path when NO DB
 *      row exists at all — "Empty config" deliberately leaves the DB row
 *      alone.
 *   2. Even with the DB row gone, main.preact.jsx's mergeCustomerConfig()
 *      falls back to the OLD single-blob `nbl_customer_v1` metafield,
 *      field by field, for anything missing from the 4 split metafields
 *      (see syncCustomerConfig.js's module comment) — and "Empty config"
 *      deliberately leaves THAT metafield alone too, since it's real
 *      production fallback behaviour for customers who predate the split.
 *      Left in place here, the widget would keep rendering the
 *      customer's old points/rewards straight out of that legacy
 *      metafield even with the DB row and all 4 split metafields gone —
 *      exactly the "still shows everything" symptom this tool exists to
 *      avoid.
 *
 * This tool clears both, so the next visit genuinely has nothing to
 * self-heal from and nothing to fall back to — reproducing the same state
 * a real pre-install/webhook-missed, never-synced-once customer would be
 * in.
 *
 * Note: `autoProvisionCustomer` (Customize > New Customer Onboarding)
 * defaults to ON, so on most shops the customer will be silently
 * auto-provisioned again on their next visit rather than seeing the
 * explicit "Join our Program" panel. To actually exercise the manual Join
 * step with this tool, the shop needs to have turned `autoProvisionCustomer`
 * OFF first — see useCustomerProvision.js.
 *
 * Also note: this does NOT touch anything on the Shopify side beyond the
 * app's own metafields — e.g. real discount codes tied to any Reward rows
 * being deleted are not deactivated. Only use this against real test
 * customers, never a real production customer with live rewards.
 */

import prisma from "../../db.server.js";
import clearCustomerMetafields from "../../graphql/mutation/metafieldsSync/clearCustomerMetafields.js";
import { logger } from "../../utils/logger.js";

const MODULE = "controller/customers/deleteCustomerRecord";

/**
 * @param {object} admin - Authenticated Admin GraphQL client.
 * @param {object} params
 * @param {string} params.shop
 * @param {number} params.customerId    - App DB `Customer.id` (not the Shopify GID).
 * @param {string} params.shopifyId     - Shopify customer GID, for the metafield delete.
 * @returns {Promise<void>}
 */
export default async function deleteCustomerRecord(admin, { shop, customerId, shopifyId }) {
    // Metafields first — if this fails, the DB row (and the customer's
    // real data) is still intact, so it's the safer order to fail in.
    // includeLegacy: true is the key difference from "Empty config" — see
    // this file's module comment above for why leaving the legacy
    // metafield behind would silently defeat the whole point of this tool.
    await clearCustomerMetafields(admin, shopifyId, { includeLegacy: true });

    await prisma.customer.delete({ where: { id: customerId } });

    logger.warn(MODULE, "Customer app record deleted (metafields incl. legacy + DB row)", {
        shop,
        shopifyId,
        customerId,
    });
}

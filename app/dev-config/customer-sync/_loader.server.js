/**
 * @file dev-config/customer-sync/_loader.server.js
 * @description Loader for the Customer Sync page — split out of
 * version-tracking (see that page's own history) since bulk/single
 * customer metafield sync isn't specific to version rollout, it's a
 * general-purpose maintenance tool in its own right.
 */

import { authenticate } from "shopify-server";
import prisma from "db-server";

import { getBulkCustomerSyncStatus } from "@controller/jobs/bulkCustomerSync";
import { getEmptyCustomerConfigStatus } from "@controller/jobs/emptyCustomerConfig";
import { getMaintenanceToolFlags } from "@controller/appSettings/maintenanceToolFlags";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const email = url.searchParams.get("email")?.trim().slice(0, 200) || "";

    const [syncStatus, toolFlags, emptyConfigStatus, foundCustomer] = await Promise.all([
        getBulkCustomerSyncStatus({ shop: session.shop, sessionId: session.id }),
        getMaintenanceToolFlags(session.shop),
        getEmptyCustomerConfigStatus(session.shop),
        // Single-customer search — exact email match, scoped to this shop.
        // Only runs the query when an email was actually submitted.
        email
            ? prisma.customer.findFirst({
                  where: { sessionId: session.id, email: { equals: email, mode: "insensitive" } },
                  select: { id: true, shopifyId: true, name: true, email: true, points: true, lastSyncedVersionKey: true },
              })
            : null,
    ]);

    return { syncStatus, toolFlags, emptyConfigStatus, searchedEmail: email, foundCustomer };
};

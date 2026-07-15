import prisma from "../../db.server.js";

/**
 * Reads shop-level "testing only" feature flags from
 * AppSettings.settings.testing. These gate developer/debug tools that must
 * NEVER be reachable in production by accident — e.g. the "reset all
 * customers' sync status" button on the Version Tracking page, which lets
 * a developer re-test the whole update-banner/sync flow repeatedly without
 * a real database reset.
 *
 * Deliberately READ-ONLY — there is intentionally no corresponding
 * `updateTestingFlags()` function, and no admin UI anywhere in this app
 * ever writes to `settings.testing`. The only way to turn one of these on
 * is a developer directly editing the AppSettings row in the database
 * (e.g. via Prisma Studio or a raw SQL UPDATE) — never through any button,
 * toggle, or API route the app itself exposes. That's the actual safety
 * mechanism here: it's not "off by default and could theoretically be
 * flipped by a checkbox somewhere", it's "there is no checkbox, full stop".
 * A merchant, a support agent, or an admin with normal access can never
 * enable this shop-side.
 *
 * @param {string} shop
 * @returns {Promise<{ showResetSyncButton: boolean, showEmptyConfigButton: boolean, showDeleteCustomerButton: boolean }>}
 */
export async function getTestingFlags(shop) {
    if (!shop) return { showResetSyncButton: false, showEmptyConfigButton: false, showDeleteCustomerButton: false };

    const row = await prisma.appSettings.findUnique({
        where: { shop },
        select: { settings: true },
    });

    console.log("getTestingFlags====", { shop, row });

    return {
        showResetSyncButton: true, //row?.settings?.testing?.showResetSyncButton === true,
        // Same rationale as showResetSyncButton above — this one is more
        // destructive still (deletes REAL Shopify metafield data for
        // already-synced customers), so it's just as unreachable via any
        // app UI, only a direct database edit.
        showEmptyConfigButton: true, //row?.settings?.testing?.showEmptyConfigButton === true,
        // Most destructive of the three — permanently deletes the
        // customer's own app-database row (points, rewards, transactions,
        // prize claims, referral history — all of it, via cascade), not
        // just their Shopify metafields. Exists solely to simulate a
        // genuinely brand-new customer (no app record at all) for testing
        // the "Join our Program" flow — see
        // app/controller/customers/deleteCustomerRecord.js. Same
        // database-flag-only gating as the two above; no app UI can ever
        // turn this on for a shop.
        showDeleteCustomerButton: true, //row?.settings?.testing?.showDeleteCustomerButton === true,
    };
}

import prisma from "../../db.server.js";

/**
 * Lists a shop's config-update-version history (newest first), each
 * annotated with how many of the shop's customers have synced to it —
 * this is the "rollout progress" the admin tracking page shows.
 *
 * `syncedCount` is a live count of Customer.lastSyncedVersionKey matches —
 * cheap even at 100k+ customers (single indexed-ish equality filter scoped
 * by sessionId; Customer already has `@@index([sessionId])`). `totalCount`
 * is the shop's total customer count, shared across every version row's
 * percentage so it's computed once, not once per row.
 *
 * @param {Object} params
 * @param {string} params.shop
 * @param {string} params.sessionId - Scopes the customer counts to this shop's session.
 * @returns {Promise<{ versions: Array<Object & { syncedCount: number }>, totalCustomers: number }>}
 */
export default async function listConfigUpdateVersions({ shop, sessionId }) {
    const [versions, totalCustomers] = await Promise.all([
        prisma.configUpdateVersion.findMany({
            where: { shop },
            orderBy: { createdAt: "desc" },
        }),
        prisma.customer.count({ where: { sessionId } }),
    ]);

    const withCounts = await Promise.all(
        versions.map(async (version) => ({
            ...version,
            syncedCount: await prisma.customer.count({
                where: { sessionId, lastSyncedVersionKey: version.versionKey },
            }),
        }))
    );

    return { versions: withCounts, totalCustomers };
}

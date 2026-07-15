import prisma from "../../db.server.js";

/**
 * Returns the currently active ConfigUpdateVersion for a shop, or null if
 * none exists (feature never used yet, or the admin hasn't announced a
 * version) — callers must treat null as "nothing to compare against", not
 * as an error.
 *
 * @param {string} shop
 * @returns {Promise<Object|null>}
 */
export default async function getActiveConfigUpdateVersion(shop) {
    if (!shop) return null;

    return prisma.configUpdateVersion.findFirst({
        where: { shop, isActive: true },
        orderBy: { createdAt: "desc" },
    });
}

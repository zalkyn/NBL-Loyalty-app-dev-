// ─────────────────────────────────────────────────────────────────────────────
// Server-only. Never import from client code (_hooks.js or components/).
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "db-server";
import { logger } from "app/utils/logger.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "layout/dashboard/_loader.server.js";

/**
 * Fetches all dashboard data in one parallel round-trip.
 *
 * Note: `prizeStats` shown on the dashboard is derived client-side from
 * `prizeClaims` (see _hooks.js) — it isn't a separate field returned here.
 *
 * Degrades to empty defaults (rather than crashing the whole page) on a
 * transient DB failure.
 *
 * @param {string} sessionId
 * @returns {{ transactions, rewards, customerCount, prizeClaims }}
 */
export async function loadDashboardData(sessionId) {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    try {
        const [transactions, rewards, customerCount, prizeClaims] = await Promise.all([

            prisma.transaction.findMany({
                where: { createdAt: { gte: twoYearsAgo }, customer: { sessionId } },
                select: { id: true, type: true, points: true, status: true, createdAt: true },
                orderBy: { createdAt: "asc" },
            }),

            prisma.reward.findMany({
                where: { createdAt: { gte: twoYearsAgo }, customer: { sessionId } },
                select: { id: true, status: true, pointsCost: true, createdAt: true },
                orderBy: { createdAt: "asc" },
            }),

            prisma.customer.count({
                where: { sessionId, activeStatus: "ACTIVE" },
            }),

            // Date-range filterable — used for both stat cards and the prize activity chart.
            prisma.physicalPrizeClaim.findMany({
                where: { createdAt: { gte: twoYearsAgo }, prize: { sessionId } },
                select: { id: true, pointsCost: true, status: true, createdAt: true },
                orderBy: { createdAt: "asc" },
            }),

        ]);

        return { transactions, rewards, customerCount, prizeClaims };
    } catch (err) {
        logger.error("Failed to load dashboard data", { module: MODULE, sessionId, error: err?.message });
        return { transactions: [], rewards: [], customerCount: 0, prizeClaims: [] };
    }
}

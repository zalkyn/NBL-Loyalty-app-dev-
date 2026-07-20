/**
 * @file dev-config/queue-jobs/_loader.server.js
 * @description Prisma queries for the Jobs admin page — server-side
 * pagination (skip/take), since the Job table can realistically grow
 * much larger than other paginated lists in this app (every order/
 * customer-sync event can create a row).
 */

import prisma from "db-server";
import { logger } from "app/utils/logger.js";
import { getDiscountDeleteSettings } from "app/controller/appSettings/discountDeleteSettings.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "dev-config/queue-jobs/_loader.server.js";

export const DEFAULT_PAGE_SIZE = 25;

/**
 * Fetches one page of jobs matching the given filters, plus the total
 * count (for page-count math) and the distinct list of job types.
 *
 * IMPORTANT: `shop` is required and scopes every query below — the Job
 * table is shared across all shops, so omitting this would let one shop's
 * admin view (and act on, via _action.server.js) every other shop's jobs.
 * The caller (route.jsx) must pass `session.shop` here.
 *
 * @param {Object} params
 * @param {string} params.shop     - shop domain, scopes all queries below
 * @param {string} [params.status] - "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED"
 * @param {string} [params.type]   - "ORDER_PAID" | "ORDER_REVERSED" | "CUSTOMER_SYNC" | ...
 * @param {number} [params.page]   - 1-indexed page number
 * @param {number} [params.perPage] - rows per page
 * @returns {Promise<{ jobs: Array, total: number, page: number, perPage: number, types: string[] }>}
 */
export async function loadJobsData({ shop, status, type, page = 1, perPage = DEFAULT_PAGE_SIZE }) {
    const where = {
        shop,
        ...(status ? { status } : {}),
        ...(type ? { type } : {}),
    };

    try {
        const [jobs, total, distinctTypes, discountDeleteSettings] = await Promise.all([
            prisma.job.findMany({
                where,
                orderBy: { updatedAt: "desc" },
                skip: (page - 1) * perPage,
                take: perPage,
            }),
            prisma.job.count({ where }),
            prisma.job.findMany({
                where: { shop },
                distinct: ["type"],
                select: { type: true },
                orderBy: { type: "asc" },
            }),
            getDiscountDeleteSettings(shop),
        ]);

        return {
            jobs,
            total,
            page,
            perPage,
            types: distinctTypes.map((t) => t.type),
            discountDeleteSettings,
        };
    } catch (err) {
        logger.error("Failed to load jobs", { module: MODULE, shop, status, type, error: err?.message });
        return { jobs: [], total: 0, page, perPage, types: [], discountDeleteSettings: { onRewardCancel: true, onRewardUsed: true } };
    }
}

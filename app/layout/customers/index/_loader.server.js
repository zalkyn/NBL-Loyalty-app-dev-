import prisma from "db-server";
import { ALLOWED_PAGE_SIZES, DEFAULT_PAGE_SIZE, SORT_OPTIONS } from "./_data";
import { logger } from "app/utils/logger.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "layout/customers/index/_loader.server.js";

const SORTABLE_FIELDS = new Set(["id", "name", "email", "points", "enrolledAt"]);

export { ALLOWED_PAGE_SIZES };

function parseSortBy(raw) {
    const fallback = "enrolledAt-desc";
    if (!raw || typeof raw !== "string") return fallback;
    return SORT_OPTIONS.map((o) => o.value).includes(raw) ? raw : fallback;
}

function parsePageSize(raw) {
    const n = parseInt(raw, 10);
    return ALLOWED_PAGE_SIZES.includes(n) ? n : DEFAULT_PAGE_SIZE;
}

/**
 * Loads customer list + active sync job status in parallel.
 *
 * @param {string}           sessionId
 * @param {string}           shop         - shop domain (for sync job lookup)
 * @param {URLSearchParams}  searchParams
 */
export async function loadCustomers(sessionId, shop, searchParams) {
    const pageSize = parsePageSize(searchParams.get("pageSize"));
    const page     = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const search   = searchParams.get("search")?.trim().slice(0, 100) || "";
    const sortBy   = parseSortBy(searchParams.get("sortBy"));

    const [field, direction] = sortBy.split("-");
    const orderDir = direction === "asc" ? "asc" : "desc";

    const where = {
        sessionId,
        ...(search && {
            OR: [
                { name:  { startsWith: search, mode: "insensitive" } },
                { email: { startsWith: search, mode: "insensitive" } },
            ],
        }),
    };

    try {
        const [[customers, totalCount], activeSyncJob, unfilteredCount] = await Promise.all([
            prisma.$transaction([
                prisma.customer.findMany({
                    where,
                    orderBy: SORTABLE_FIELDS.has(field) ? { [field]: orderDir } : { enrolledAt: "desc" },
                    skip: (page - 1) * pageSize,
                    take: pageSize,
                    select: {
                        id: true, name: true, email: true,
                        points: true, enrolledAt: true, activeStatus: true,
                        _count: { select: { rewards: true, transactions: true } },
                    },
                }),
                prisma.customer.count({ where }),
            ]),

            // Check for an active sync job for this shop.
            //
            // payload comes along for its `progress` block — the only
            // window into a job that runs for twenty minutes. Everything
            // else in payload is job-internal and is dropped below rather
            // than shipped to the browser.
            prisma.job.findFirst({
                where: {
                    type:   "CUSTOMER_SYNC",
                    shop,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
                select: { id: true, status: true, payload: true },
                orderBy: { createdAt: "desc" },
            }),

            // Every customer this app knows about, ignoring the search
            // filter above. `totalCount` is filtered and would read as "12
            // customers" on a page showing 12 search results — the wrong
            // number entirely for a confirmation screen about syncing the
            // whole shop.
            //
            // Only actually queried when a search is active. With no search
            // the two counts are the same COUNT(*) over the same 80,000
            // rows, and running it twice per load — three times a minute
            // while a sync polls — is paying twice for one number. The
            // no-search path is also the overwhelmingly common one.
            search ? prisma.customer.count({ where: { sessionId } }) : Promise.resolve(null),
        ]);

        const progress = activeSyncJob?.payload?.progress ?? null;

        return {
            customers, totalCount, page, pageSize, search, sortBy, error: null,
            localCustomerCount: unfilteredCount ?? totalCount,
            syncJobId:     activeSyncJob?.id    ?? null,
            syncJobStatus: activeSyncJob?.status ?? null,
            syncProgress:  progress && typeof progress.processed === "number" ? progress : null,
        };
    } catch (err) {
        logger.error("Failed to load customers", { module: MODULE, error: err?.message, sessionId, shop });
        return {
            customers: [], totalCount: 0, page: 1, pageSize, search, sortBy,
            error: "Failed to load customers.",
            localCustomerCount: 0,
            syncJobId: null, syncJobStatus: null, syncProgress: null,
        };
    }
}
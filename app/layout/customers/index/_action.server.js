import prisma from "db-server";
import { processCustomerSync } from "@controller/customers/customerSyncProcessor";
import { customersCount } from "@graphql/query/customers";
import { logger } from "app/utils/logger.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "layout/customers/index/_action.server.js";

// ─────────────────────────────────────────────────────────────────────────────
// Customer count (for the confirmation modal)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns how many customers Shopify currently has.
 *
 * Its own action rather than part of the loader, because the loader is
 * pure Prisma today and runs on every navigation, every search, every
 * page change — and, while a sync is running, every three-second poll.
 * Hanging a Shopify API call off all of that to populate one number on a
 * modal nobody has opened yet would be paying for it constantly and using
 * it rarely.
 *
 * Fetched when the modal opens instead: one call, at the one moment the
 * number is about to be read.
 *
 * A null count is not an error. The modal drops the comparison line and
 * still lets the sync start — refusing to sync because a decorative
 * figure was unavailable would be the tail wagging the dog.
 */
export async function handleCustomerCount({ admin }) {
    const submitType = "customer-count";

    try {
        const counted = await customersCount(admin);

        return Response.json({
            submitType,
            isError: false,
            shopifyCustomerCount: counted?.count ?? null,
            // EXACT below Shopify's aggregation ceiling, AT_LEAST above it.
            // Passed through so the modal can say "at least" when that's
            // the honest word.
            shopifyCountPrecision: counted?.precision ?? null,
        });
    } catch (err) {
        logger.error("Failed to count Shopify customers", { module: MODULE, error: err?.message });
        return Response.json({
            submitType,
            isError: false,
            shopifyCustomerCount: null,
            shopifyCountPrecision: null,
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync Customers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handles the "sync-customers" action.
 *
 * Flow:
 *   1. Guard — if a sync job is already PENDING or PROCESSING, return early
 *   2. Create a CUSTOMER_SYNC job (PENDING)
 *   3. Fire processCustomerSync via setImmediate — HTTP response returns first,
 *      sync runs in the background without blocking or timing out
 *
 * @param {{ admin: Object, session: Object }} ctx
 */
export async function handleSyncCustomers({ admin, session }) {
    const submitType = "sync-customers";

    try {
        // ── Guard: already running ────────────────────────────────────────────
        const existing = await prisma.job.findFirst({
            where: {
                type:   "CUSTOMER_SYNC",
                shop:   session.shop,
                status: { in: ["PENDING", "PROCESSING"] },
            },
            select: { id: true, status: true },
        });

        if (existing) {
            return Response.json({
                message:    "Sync is already in progress.",
                isError:    false,
                submitType,
                syncJobId:  existing.id,
                syncStatus: existing.status,
            });
        }

        // ── Create job ────────────────────────────────────────────────────────
        const job = await prisma.job.create({
            data: {
                type:            "CUSTOMER_SYNC",
                shop:            session.shop,
                status:          "PENDING",
                idempotencyKey:  `CUSTOMER_SYNC:${session.shop}:${Date.now()}`,
                payload:         { shop: session.shop, sessionId: session.id },
            },
        });

        // ── Immediate trigger — fire and forget ───────────────────────────────
        // setImmediate defers execution until after the current event loop tick,
        // so the HTTP response returns to the client before sync begins.
        // The Node.js process stays alive (Express server), so the async work
        // continues safely in the background.
        setImmediate(() => {
            processCustomerSync(admin, session, job.id).catch((err) => {
                logger.error("Background customer sync error", {
                    module: MODULE, jobId: job.id, shop: session.shop, error: err?.message,
                });
            });
        });

        return Response.json({
            message:    "Sync started.",
            isError:    false,
            submitType,
            syncJobId:  job.id,
            syncStatus: "PROCESSING",
        });
    } catch (err) {
        logger.error("Failed to start customer sync", { module: MODULE, shop: session.shop, error: err?.message });
        return Response.json({
            message: "Failed to start sync. Please try again.",
            isError: true,
            submitType,
        });
    }
}
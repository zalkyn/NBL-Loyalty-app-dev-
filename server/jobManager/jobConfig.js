import { runOrderPaidJob } from "../jobs/orderPaidJob.js";
import { runOrderReversalJob } from "../jobs/orderReversalJob.js";
import { runDiscountDeleteJob } from "../jobs/discountDeleteJob.js";
import { runBulkCustomerSyncJob } from "../jobs/bulkCustomerSyncJob.js";
import { runEmptyCustomerConfigJob } from "../jobs/emptyCustomerConfigJob.js";
import { runCustomerSyncJob } from "../jobs/customerSyncJob.js";
import { runJobCleanupJob } from "../jobs/jobCleanupJob.js";
import { runJobAutoRetryJob } from "../jobs/jobAutoRetryJob.js";
import { logger } from "../../app/utils/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Cron timing — auto dev/production switch
// ─────────────────────────────────────────────────────────────────────────────

// Driven by NODE_ENV (same signal db.server.js already uses), NOT a manual
// flag someone has to remember to flip back before deploying — a forgotten
// flag flip is exactly how a shop ends up running test-speed (3-10 second)
// crons in production, hammering the DB and Shopify's API for no reason.
// `npm run dev` sets NODE_ENV=development automatically; a production
// start (npm run start / the deployed container) sets NODE_ENV=production
// — so this needs zero manual bookkeeping either way.
const IS_DEV = process.env.NODE_ENV !== "production";

/**
 * Picks the production or dev-testing cron expression for a job, based on
 * NODE_ENV. Every job below calls this instead of hardcoding a single
 * `cron` string, so local testing is fast (seconds instead of minutes)
 * without ever risking that speed leaking into production.
 *
 * @param {string} prodExpr - Cron expression used when NODE_ENV === "production".
 * @param {string} testExpr - Cron expression used everywhere else (dev, local, staging).
 * @returns {string}
 */
function cron(prodExpr, testExpr) {
    return IS_DEV ? testExpr : prodExpr;
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default values applied to every job unless overridden in JOB_CONFIGS.
 *
 * @property {number}     lockTimeout  - Max ms a job lock is considered valid.
 *                                       If a job is still "running" after this
 *                                       duration, the lock is treated as stale
 *                                       and the next cycle may re-acquire it.
 * @property {boolean}    immediate    - Whether to run the job once on startup
 *                                       before handing off to the cron schedule.
 * @property {Function[]} preHooks     - Async functions run in parallel before handlers.
 * @property {Function[]} postHooks    - Async functions run in parallel after handlers.
 * @property {object}     retry        - withRetry options passed to every hook and handler.
 * @property {number}     jobTimeout   - Hard timeout (ms) for the full job execution.
 *                                       Prevents a hung job from holding the lock forever.
 */
export const DEFAULTS = {
    lockTimeout: 60 * 60 * 1000,   // 1 hour
    immediate: false,
    preHooks: [],
    postHooks: [],
    retry: { maxAttempts: 3 },
    jobTimeout: 30 * 60 * 1000,   // 30 minutes
};

// ─────────────────────────────────────────────────────────────────────────────
// Job Configurations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registry of all background jobs.
 *
 * Each entry is picked up by initJobs() which:
 *   - Creates a JobLock row on startup
 *   - Optionally runs the job immediately (immediate: true)
 *   - Schedules the job via node-cron using the cron expression
 *
 * Job execution order per cycle:
 *   preHooks (parallel) -> handlers (sequential) -> postHooks (parallel)
 *
 * @type {Array<{
 *   name:        string,
 *   cron:        string,
 *   lockTimeout: number,
 *   immediate:   boolean,
 *   jobTimeout:  number,
 *   preHooks:    Function[],
 *   handlers:    Function[],
 *   postHooks?:  Function[],
 *   retry:       object,
 * }>}
 */
export const JOB_CONFIGS = [
    // ── Customer Sync ────────────────────────────────────────────────────────
    // Safety-net cron for CUSTOMER_SYNC jobs. The primary trigger is setImmediate
    // in the action which fires immediately on button click.
    // This cron only handles stale/missed jobs — e.g. server crash mid-sync.
    // Production timing reviewed: 5 min is appropriate for a safety net that
    // isn't the primary trigger path — no change needed.
    {
        name: "customer_sync",
        cron: cron("*/5 * * * *", "*/10 * * * * *"),   // production: every 5 min | dev: every 10 sec
        lockTimeout: 35 * 60 * 1000,
        immediate: false,
        jobTimeout: 30 * 60 * 1000,
        preHooks: [
            // async () => logger.info("customer_sync", "Pre-hook: customer sync cycle starting"),
        ],
        handlers: [
            async () => runCustomerSyncJob(),
        ],
        retry: { maxAttempts: 1 },
    },

    // ── Order Paid ───────────────────────────────────────────────────────────
    // Processes pending ORDER_PAID jobs enqueued by the orders/paid webhook.
    // Runs every 2 minutes. Each cycle picks up all PENDING jobs and processes
    // them sequentially — points awarding, referral handling, voucher updates.
    // lockTimeout is short (5 min) so a stale lock from a crash is recovered
    // quickly and the next cycle can re-process any unfinished jobs.
    // Production timing reviewed: 30s is appropriate — this is the
    // customer-facing "how fast do points show up after a purchase" path,
    // frequent polling is the right tradeoff here (cheap query when idle).
    {
        name: "order_paid",
        cron: cron("*/30 * * * * *", "*/5 * * * * *"), // production: every 30 sec | dev: every 5 sec
        lockTimeout: 5 * 60 * 1000,           // 5 minute stale-lock threshold
        immediate: true,                     // run once on server startup
        jobTimeout: 4 * 60 * 1000,           // 4 minutes hard timeout per cycle
        preHooks: [
            // async () => logger.info("order_paid", "Pre-hook: order paid job cycle starting"),
        ],
        handlers: [
            async () => runOrderPaidJob(),
        ],
        retry: { maxAttempts: 3 },
    },

    // ── Order Reversal (Cancel / Refund) ────────────────────────────────────
    // Processes pending ORDER_REVERSED jobs enqueued by the orders/cancelled
    // and refunds/create webhooks. Reverses (partially or fully) the points
    // earned on the original order. Same cadence/shape as order_paid.
    // Production timing reviewed: same reasoning as order_paid — 30s is
    // appropriate, no change needed.
    {
        name: "order_reversal",
        cron: cron("*/30 * * * * *", "*/5 * * * * *"), // production: every 30 sec | dev: every 5 sec
        lockTimeout: 5 * 60 * 1000,           // 5 minute stale-lock threshold
        immediate: true,                     // run once on server startup
        jobTimeout: 4 * 60 * 1000,           // 4 minutes hard timeout per cycle
        preHooks: [
            // async () => logger.info("order_reversal", "Pre-hook: order reversal job cycle starting"),
        ],
        handlers: [
            async () => runOrderReversalJob(),
        ],
        retry: { maxAttempts: 3 },
    },

    // ── Discount Code Cleanup ────────────────────────────────────────────────
    // Processes pending DISCOUNT_DELETE jobs, enqueued when a redeemed-but-
    // unused reward is cancelled or a voucher is marked used — see
    // discountDeleteJob.js's own header comment for exact trigger points,
    // and app/controller/appSettings/discountDeleteSettings.js for the
    // per-shop on/off toggles that gate whether those enqueues happen at
    // all. Slower cadence than order_paid/order_reversal on purpose — this
    // is low-priority tidiness (an un-deleted discount code isn't broken,
    // just clutter), not something that should compete for poller
    // attention with real order processing.
    // Production timing reviewed: 30 min deliberately chosen (see prior
    // discussion) as the balance between freshness and not over-polling for
    // a non-urgent task — no change needed.
    {
        name: "discount_delete",
        cron: cron("*/30 * * * *", "*/10 * * * * *"),  // production: every 30 min | dev: every 10 sec
        lockTimeout: 5 * 60 * 1000,           // 5 minute stale-lock threshold
        immediate: false,
        jobTimeout: 4 * 60 * 1000,            // 4 minutes hard timeout per cycle
        preHooks: [],
        handlers: [
            async () => runDiscountDeleteJob(),
        ],
        retry: { maxAttempts: 3 },
    },

    // ── Bulk Customer Sync ───────────────────────────────────────────────────
    // Processes pending BULK_CUSTOMER_SYNC jobs, enqueued from the admin
    // Version Tracking page's "Sync all customers now" / "Sync only
    // unsynced customers" buttons — see
    // app/controller/jobs/bulkCustomerSync.js (enqueue + status) and
    // bulkCustomerSyncJob.js (chunked, resumable batch processing — one
    // BATCH_SIZE chunk per cycle, cursor stored in the job's own payload).
    // Same cadence as order_paid/order_reversal — this is admin-initiated,
    // deliberate, occasional work, but each cycle only touches one small
    // bounded chunk regardless of shop size, so there's no reason to run it
    // any slower; slower would just mean a 100k-customer shop takes
    // needlessly longer to finish.
    {
        name: "bulk_customer_sync",
        cron: cron("*/30 * * * * *", "*/3 * * * * *"), // production: every 30 sec | dev: every 3 sec (see batches progress quickly)
        lockTimeout: 10 * 60 * 1000,          // 10 minute stale-lock threshold — a batch of 50 sequential Shopify API calls can occasionally run long
        immediate: false,
        jobTimeout: 5 * 60 * 1000,            // 5 minutes hard timeout per cycle
        preHooks: [],
        handlers: [
            async () => runBulkCustomerSyncJob(),
        ],
        retry: { maxAttempts: 3 },
    },

    // ── Empty Customer Config ────────────────────────────────────────────────
    // Processes pending EMPTY_CUSTOMER_CONFIG jobs — the OPPOSITE of
    // bulk_customer_sync: deletes already-synced customers' real Shopify
    // metafields instead of writing to them. Enqueued from the Customer
    // Sync page's "empty already-synced customers' config" button — see
    // app/controller/appSettings/maintenanceToolFlags.js. Same cadence/
    // shape as bulk_customer_sync for the same reasons.
    {
        name: "empty_customer_config",
        cron: cron("*/30 * * * * *", "*/3 * * * * *"), // production: every 30 sec | dev: every 3 sec
        lockTimeout: 10 * 60 * 1000,
        immediate: false,
        jobTimeout: 5 * 60 * 1000,
        preHooks: [],
        handlers: [
            async () => runEmptyCustomerConfigJob(),
        ],
        retry: { maxAttempts: 3 },
    },

    // ── Job Cleanup ──────────────────────────────────────────────────────────
    // Deletes old COMPLETED jobs to keep the Job table from growing
    // unbounded. See jobCleanupJob.js for the retention-window reasoning
    // (must stay well clear of Shopify's webhook re-delivery window since
    // idempotencyKey protection depends on the row still existing).
    // Runs once a day at 03:00 — this is bulk housekeeping, not
    // time-sensitive, so a low-traffic hour keeps it off the DB during
    // peak order-processing.
    // Production timing reviewed: once-daily at a low-traffic hour is
    // appropriate for bulk housekeeping — no change needed.
    {
        name: "job_cleanup",
        cron: cron("0 3 * * *", "*/30 * * * * *"),     // production: daily at 03:00 | dev: every 30 sec
        lockTimeout: 30 * 60 * 1000,          // 30 minute stale-lock threshold
        immediate: false,
        jobTimeout: 10 * 60 * 1000,           // 10 minutes hard timeout
        preHooks: [
            // async () => logger.info("job_cleanup", "Pre-hook: job cleanup cycle starting"),
        ],
        handlers: [
            async () => runJobCleanupJob(),
        ],
        retry: { maxAttempts: 2 },
    },

    // ── Job Auto-Retry ───────────────────────────────────────────────────────
    // Revives FAILED jobs whose last error looks transient/network-related
    // (see TRANSIENT_ERROR_PATTERNS in jobAutoRetryJob.js), capped at
    // AUTO_RETRY_CAP revivals per job. Everything else stays FAILED for
    // manual review/retry in the admin Jobs UI.
    // Production timing reviewed: 15 min is appropriate — reviving a
    // transiently-failed job doesn't need to be instant, and this avoids
    // hammering the same still-failing job too often.
    {
        name: "job_auto_retry",
        cron: cron("*/15 * * * *", "*/10 * * * * *"),  // production: every 15 min | dev: every 10 sec
        lockTimeout: 15 * 60 * 1000,          // 15 minute stale-lock threshold
        immediate: false,
        jobTimeout: 5 * 60 * 1000,            // 5 minutes hard timeout
        preHooks: [
            // async () => logger.info("job_auto_retry", "Pre-hook: job auto-retry cycle starting"),
        ],
        handlers: [
            async () => runJobAutoRetryJob(),
        ],
        retry: { maxAttempts: 2 },
    },
];

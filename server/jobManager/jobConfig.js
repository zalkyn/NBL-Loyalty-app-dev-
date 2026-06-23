import { runOrderPaidJob } from "../jobs/orderPaidJob.js";
import { runCustomerSyncJob } from "../jobs/customerSyncJob.js";
import { logger } from "../../app/utils/logger.js";

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
 *   preHooks (parallel) → handlers (sequential) → postHooks (parallel)
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
    {
        name:        "customer_sync",
        cron:        "*/5 * * * *",
        lockTimeout: 35 * 60 * 1000,
        immediate:   false,
        jobTimeout:  30 * 60 * 1000,
        preHooks: [
            async () => logger.info("customer_sync", "Pre-hook: customer sync cycle starting"),
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
    {
        name: "order_paid",
        // cron: "*/2 * * * *",           // every 2 minutes
        // cron: "* * * * *",             // every 1 minute
        cron: "*/30 * * * * *",  // every 30 seconds
        lockTimeout: 5 * 60 * 1000,           // 5 minute stale-lock threshold
        immediate: true,                     // run once on server startup
        jobTimeout: 4 * 60 * 1000,           // 4 minutes hard timeout per cycle
        preHooks: [
            async () => logger.info("order_paid", "Pre-hook: order paid job cycle starting"),
        ],
        handlers: [
            async () => runOrderPaidJob(),
        ],
        retry: { maxAttempts: 3 },
    }
];

// ─────────────────────────────────────────────────────────────────────────────
// Example — copy and fill in to register a new job
// ─────────────────────────────────────────────────────────────────────────────
//
// {
//     name:        "daily_cleanup",
//     cron:        "0 2 * * *",              // every day at 02:00
//     lockTimeout: 2 * 60 * 60 * 1000,       // 2 hour stale-lock threshold
//     immediate:   false,
//     jobTimeout:  30 * 60 * 1000,           // 30 minutes
//     preHooks: [
//         async () => logger.info("daily_cleanup", "Pre-hook: cleanup starting"),
//     ],
//     handlers: [
//         async () => runCleanupJob(),
//     ],
//     postHooks: [
//         async () => logger.info("daily_cleanup", "Post-hook: cleanup finished"),
//     ],
//     retry: { maxAttempts: 3 },
// },
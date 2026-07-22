import cron from "node-cron";
import prisma from "../../app/db.server.js";
import { logger } from "../../app/utils/logger.js";
import { withRetry } from "../../app/utils/retry/withRetry.js";
import { JOB_CONFIGS, DEFAULTS } from "./jobConfig.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "jobManager";

// ─────────────────────────────────────────────────────────────────────────────
// Lock Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attempts to acquire a distributed lock for the given job.
 *
 * If the job is already running and its lock has not expired (based on
 * the configured lockTimeout), acquisition is skipped to prevent
 * concurrent execution of the same job across multiple processes.
 *
 * Atomic by construction — see the two-step claim below. The previous
 * version read the lock row (`findUnique`) and then separately wrote it
 * (`upsert`), which is a classic check-then-act race: two app instances
 * (e.g. Railway replicas in different regions, or just two processes whose
 * cron ticks land within the same DB round-trip) could both read
 * "not running" before either one's write landed, both conclude they'd
 * acquired the lock, and both run the same job concurrently — for
 * order-paid processing specifically, that means double-awarding points or
 * double-generating discount codes for the same order.
 *
 * @param {string} name - The unique job name (must exist in JOB_CONFIGS)
 * @returns {Promise<boolean>} true if the lock was acquired, false if skipped or errored
 */
async function lockJob(name) {
    const now = new Date();
    const cfg = JOB_CONFIGS.find(j => j.name === name);
    if (!cfg) throw new Error(`Job config not found: "${name}"`);

    const timeout = cfg.lockTimeout ?? DEFAULTS.lockTimeout;
    const staleBefore = new Date(now.getTime() - timeout);

    try {
        // Step 1: the common case — a lock row already exists for this job.
        // Claim it with ONE conditional UPDATE: only rows that are
        // currently free (isRunning: false) OR whose lock has gone stale
        // (updatedAt older than staleBefore) match the WHERE clause, so the
        // read-and-decide happens as part of the same atomic write instead
        // of a separate earlier query. If two instances race this at the
        // same instant, the database itself serializes the two UPDATEs —
        // only one can match a still-free row; whichever runs second sees
        // isRunning already true (the first one's write already landed) and
        // the WHERE clause simply matches zero rows for it.
        const claimed = await prisma.jobLock.updateMany({
            where: {
                jobName: name,
                OR: [
                    { isRunning: false },
                    { updatedAt: { lt: staleBefore } },
                ],
            },
            data: { isRunning: true, updatedAt: now },
        });

        if (claimed.count > 0) {
            return true;
        }

        // Step 2: updateMany matched zero rows. Two possibilities:
        //   (a) the lock row exists and is genuinely held by someone else
        //       (not stale) — correctly not our turn, fall through to false.
        //   (b) no lock row exists yet at all for this job name (its very
        //       first run) — updateMany has nothing to match either way, so
        //       we need to create it. The @unique constraint on jobName is
        //       what makes THIS step atomic in turn: if another instance's
        //       create() wins the same race, ours throws P2002 and we
        //       correctly back off instead of both proceeding.
        try {
            await prisma.jobLock.create({
                data: { jobName: name, isRunning: true, updatedAt: now },
            });
            return true;
        } catch (createErr) {
            if (createErr?.code === "P2002") {
                logger.info(MODULE, `Job "${name}" is locked — skipping this cycle`, { timeoutMs: timeout });
                return false;
            }
            throw createErr;
        }
    } catch (err) {
        logger.error(MODULE, `Failed to acquire lock for job "${name}"`, { error: err.message });
        return false;
    }
}

/**
 * Releases the distributed lock for the given job after execution completes
 * (whether successful or failed). Always called in the finally block.
 *
 * @param {string} name - The unique job name
 * @returns {Promise<void>}
 */
async function unlockJob(name) {
    try {
        await prisma.jobLock.update({
            where: { jobName: name },
            data: { isRunning: false, updatedAt: new Date() },
        });
    } catch (err) {
        logger.error(MODULE, `Failed to release lock for job "${name}"`, { error: err.message });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeout Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Races a promise against a hard timeout deadline.
 *
 * If the promise does not settle within the given milliseconds, rejects
 * with a descriptive timeout error. Used to prevent jobs from hanging
 * indefinitely and blocking the lock for other cycles.
 *
 * @param {Promise<any>} promise - The job execution promise
 * @param {number}       ms      - Timeout in milliseconds
 * @param {string}       name    - Job name (used in the timeout error message)
 * @returns {Promise<any>}
 */
function withJobTimeout(promise, ms, name) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(
                () => reject(new Error(`Job "${name}" timed out after ${ms}ms`)),
                ms
            )
        ),
    ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Job Runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes a single job configuration end-to-end:
 *   1. Acquires the distributed lock (skips if already locked)
 *   2. Runs preHooks in parallel (each individually retried)
 *   3. Runs handlers sequentially (each individually retried)
 *   4. Runs postHooks in parallel (each individually retried)
 *   5. Enforces a hard jobTimeout across the entire execution
 *   6. Always releases the lock in the finally block
 *
 * preHooks and postHooks run in parallel — use them for lightweight
 * setup/teardown (logging, metrics). Handlers run sequentially because
 * later handlers may depend on state written by earlier ones.
 *
 * @param {object}   cfg                       - Job configuration object from JOB_CONFIGS
 * @param {string}   cfg.name                  - Unique job identifier
 * @param {Function[]} [cfg.preHooks]          - Optional hooks to run before handlers
 * @param {Function[]} cfg.handlers            - Core job logic functions (run in order)
 * @param {Function[]} [cfg.postHooks]         - Optional hooks to run after handlers
 * @param {object}   [cfg.retry]               - withRetry options (maxAttempts, baseDelayMs, etc.)
 * @param {number}   [cfg.jobTimeout]          - Hard timeout in ms for the full job execution
 * @returns {Promise<void>}
 */
async function runJob(cfg) {
    const {
        name,
        preHooks = DEFAULTS.preHooks,
        handlers,
        postHooks = DEFAULTS.postHooks,
        retry = DEFAULTS.retry,
        jobTimeout = DEFAULTS.jobTimeout,
    } = cfg;

    if (!(await lockJob(name))) return;

    const start = Date.now();

    try {
        logger.info(MODULE, `Starting job: "${name.toUpperCase()}"`);

        await withJobTimeout(
            (async () => {
                // preHooks — run in parallel (setup, logging, metrics)
                if (preHooks.length) {
                    await Promise.all(preHooks.map(hook => withRetry(hook, retry)));
                }

                // handlers — run sequentially (core job logic)
                for (const handler of handlers) {
                    await withRetry(handler, retry);
                }

                // postHooks — run in parallel (teardown, notifications)
                if (postHooks.length) {
                    await Promise.all(postHooks.map(hook => withRetry(hook, retry)));
                }
            })(),
            jobTimeout,
            name
        );

        const duration = ((Date.now() - start) / 1000).toFixed(2);
        logger.success(MODULE, `Job "${name}" completed in ${duration}s`);
    } catch (err) {
        const duration = ((Date.now() - start) / 1000).toFixed(2);
        logger.error(MODULE, `Job "${name}" failed after ${duration}s`, { error: err.message });
    } finally {
        await unlockJob(name);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Guards against calling initJobs() more than once in the same process.
 * Set to true after the first successful initialization.
 *
 * @type {boolean}
 */
let initialized = false;

/**
 * Initializes all background jobs defined in JOB_CONFIGS.
 *
 * Steps:
 *   1. Guards against double initialization (safe to call on hot reload)
 *   2. Upserts a JobLock row for every configured job
 *   3. Immediately runs all jobs marked with `immediate: true`
 *   4. Schedules all jobs with a `cron` expression via node-cron
 *
 * Should be called once at server startup (e.g. in server.js after
 * Express is configured).
 *
 * @returns {Promise<void>}
 * @throws {Error} If the initial lock setup fails — surfaces the error
 *                 so the caller can decide whether to abort startup
 */
export default async function initJobs() {
    if (initialized) {
        logger.warn(MODULE, "Jobs already initialized — skipping duplicate call");
        return;
    }

    logger.info(MODULE, "Initializing all background jobs...");
    initialized = true;

    // Upsert a JobLock row for every configured job so lockJob() can always
    // find the record with findUnique — avoids a create/update race on first run
    try {
        await Promise.all(
            JOB_CONFIGS.map(cfg =>
                prisma.jobLock.upsert({
                    where: { jobName: cfg.name },
                    create: { jobName: cfg.name, isRunning: false },
                    update: {},
                })
            )
        );

        JOB_CONFIGS.forEach(cfg => {
            logger.success(MODULE, `[${cfg.name.toUpperCase()}] job lock initialized`);
        });
    } catch (err) {
        logger.error(MODULE, "Failed to initialize job locks — aborting", { error: err.message });
        throw err;
    }

    logger.success(MODULE, `All ${JOB_CONFIGS.length} job(s) initialized`);

    // Run immediate jobs on startup before handing off to cron
    const immediateJobs = JOB_CONFIGS.filter(cfg => cfg.immediate ?? DEFAULTS.immediate);
    if (immediateJobs.length) {
        logger.info(MODULE, `Running ${immediateJobs.length} immediate job(s) on startup...`);
        await Promise.all(immediateJobs.map(runJob));
    }

    // Register cron schedules for all configured jobs
    JOB_CONFIGS.forEach(cfg => {
        if (!cfg.cron) {
            logger.warn(MODULE, `Job "${cfg.name}" has no cron schedule — skipping scheduler`);
            return;
        }

        try {
            cron.schedule(cfg.cron, () => runJob(cfg));
            logger.info(MODULE, `Scheduled job "${cfg.name}" -> cron: "${cfg.cron}"`);
        } catch (err) {
            logger.error(MODULE, `Failed to schedule job "${cfg.name}"`, { error: err.message });
        }
    });
}
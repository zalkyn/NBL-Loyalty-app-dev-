#!/usr/bin/env node
/**
 * @file server/jobsRunner.js
 * @description Standalone background-job poller. Runs the cron schedule
 * and nothing else — no Express, no Vite, no HTTP listener.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 * initJobs() is called from server.js, which `shopify app dev` does not
 * run (it runs `react-router dev` instead — see shopify.web.toml). So
 * during development no background job executes at all, and any feature
 * that enqueues one appears to hang with no error: the Job row sits at
 * PENDING forever because nothing is polling.
 *
 * The obvious workarounds are both worse than they look:
 *
 *   - `npm run start` expects NODE_ENV=production and loads
 *     build/server/index.js, so it needs a fresh `npm run build` after
 *     every code change and serves stale compiled code otherwise.
 *   - `npm run watch` works, but boots a second full Express + Vite dev
 *     server on another port purely as a host for the cron scheduler.
 *
 * This file does the one thing that's actually wanted. Run it in a second
 * terminal next to `npm run dev`:
 *
 *     npm run jobs
 *
 * ── On running two pollers at once ───────────────────────────────────────
 * Safe. Locking is distributed, not in-process: lockJob() in
 * jobManager.js acquires a row in the JobLock table with a conditional
 * update, so a second poller (or a second server replica in production)
 * finds the lock held and skips that cycle. The individual jobs are
 * independently safe too — each claims its work with
 * `updateMany({ where: { status: "PENDING" } })` rather than
 * read-then-write. Accidentally leaving this running while also starting
 * `npm run start` costs nothing but a little idle polling.
 */

import "dotenv/config";
import initJobs from "./jobManager/jobManager.js";
import prisma from "../app/db.server.js";

const label = process.env.NODE_ENV === "production" ? "production" : "development";

console.log(`##### Starting background job runner (${label}) #####`);

try {
    await initJobs();
} catch (err) {
    // initJobs throws only if the JobLock table can't be reached, which
    // means the database is unavailable — there is nothing useful this
    // process can do without it, so exit loudly rather than sitting idle
    // while looking alive.
    console.error("##### Failed to initialize background jobs:", err);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
}

console.log("##### Job runner ready — press Ctrl+C to stop #####");

/**
 * node-cron holds the event loop open on its own, so no keepalive timer is
 * needed. What IS needed is releasing the database connection on exit:
 * without this, Ctrl+C leaves the Postgres connection hanging until the
 * server times it out, which is noticeable when restarting this process
 * repeatedly during development.
 *
 * A job mid-cycle when the signal arrives keeps its JobLock row until the
 * lock's own timeout expires, at which point the next poller treats it as
 * stale and re-runs it — the same recovery path a crash takes. Nothing is
 * lost either way.
 */
async function shutdown(signal) {
    console.log(`\n##### ${signal} received — shutting down job runner #####`);
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

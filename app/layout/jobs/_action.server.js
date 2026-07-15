/**
 * @file jobs/_action.server.js
 * @description Generic job-transition handlers for the Jobs admin page —
 * every status (PENDING / PROCESSING / FAILED / CANCELLED / COMPLETED) has
 * single, bulk (selected), and group-wise (all-of-type) operations built
 * from the same underlying transition() helper.
 *
 * formData contract (shared by every intent below):
 *   mode        "one" | "many" | "group"
 *   jobId       (mode=one)   — single job id
 *   jobIds      (mode=many)  — comma-separated ids
 *   type        (mode=group) — job type, combined with fromStatus
 *   fromStatus  the status these rows are expected to currently be in —
 *               always included as a safety filter so a bulk/group action
 *               can never accidentally transition a row that has since
 *               moved to a different status (e.g. finished processing
 *               between page load and form submit).
 */

import prisma from "db-server";
import { logger } from "app/utils/logger.js";
import { updateDiscountDeleteSettings } from "app/controller/appSettings/discountDeleteSettings.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "layout/jobs/_action.server.js";

// ── Shared transition helper ───────────────────────────────────────────────

/**
 * Builds the `where` clause for one/many/group modes and applies `data`
 * via updateMany (safe for all three modes, and enforces fromStatus as a
 * guard against racing with the poller).
 *
 * IMPORTANT: `shop` scopes every where clause here — without it, an admin
 * on one shop could cancel/retry/force-reset a job id belonging to a
 * completely different shop (the Job table is shared across all shops).
 *
 * @param {FormData} formData
 * @param {string}   shop - shop domain, scopes the where clause
 * @param {object}   data - Prisma update payload
 * @returns {Promise<number>} rows affected
 */
async function transition(formData, shop, data) {
    const mode = formData.get("mode");
    const fromStatus = formData.get("fromStatus");

    let where;
    if (mode === "one") {
        where = { id: Number(formData.get("jobId")), shop, status: fromStatus };
    } else if (mode === "many") {
        const ids = (formData.get("jobIds") || "").split(",").map(Number).filter(Boolean);
        where = { id: { in: ids }, shop, status: fromStatus };
    } else if (mode === "group") {
        where = { type: formData.get("type"), shop, status: fromStatus };
    } else {
        throw new Error(`Unknown mode: "${mode}"`);
    }

    const { count } = await prisma.job.updateMany({ where, data });
    return count;
}

function requeueData() {
    return {
        status: "PENDING",
        attempts: 0,
        lockedAt: null,
        failedAt: null,
        runAt: new Date(),
    };
}

function describeMode(formData, count) {
    const mode = formData.get("mode");
    if (mode === "one") return `Job #${formData.get("jobId")}`;
    if (mode === "many") return `${count} selected job(s)`;
    return `${count} "${formData.get("type")}" job(s)`;
}

// ── CANCEL — from PENDING or FAILED ────────────────────────────────────────

export async function handleCancel({ formData, session }) {
    try {
        const count = await transition(formData, session.shop, { status: "CANCELLED" });
        return { ok: true, intent: "cancel", message: `${describeMode(formData, count)} cancelled.` };
    } catch (err) {
        logger.error("Cancel job failed", { module: MODULE, shop: session.shop, error: err?.message });
        return { ok: false, intent: "cancel", message: "Failed to cancel job(s)." };
    }
}

// ── RETRY / REQUEUE — from FAILED or CANCELLED, back to PENDING ───────────

export async function handleRetry({ formData, session }) {
    try {
        const count = await transition(formData, session.shop, requeueData());
        return { ok: true, intent: "retry", message: `${describeMode(formData, count)} re-queued.` };
    } catch (err) {
        logger.error("Retry job failed", { module: MODULE, shop: session.shop, error: err?.message });
        return { ok: false, intent: "retry", message: "Failed to re-queue job(s)." };
    }
}

// ── FORCE RESET — unstick a PROCESSING job manually (normally handled by
//    the automatic stale-lock recovery in each job's requeueStaleJobs(),
//    this is for an admin who doesn't want to wait for that timeout) ───────

export async function handleForceReset({ formData, session }) {
    try {
        const count = await transition(formData, session.shop, {
            ...requeueData(),
            lastError: "Manually force-reset from PROCESSING via admin UI",
        });
        return { ok: true, intent: "forceReset", message: `${describeMode(formData, count)} reset to PENDING.` };
    } catch (err) {
        logger.error("Force-reset job failed", { module: MODULE, shop: session.shop, error: err?.message });
        return { ok: false, intent: "forceReset", message: "Failed to reset job(s)." };
    }
}

// ── DISCOUNT-DELETE SETTINGS — see appSettings/discountDeleteSettings.js.
//    Not a job transition like everything else in this file (no
//    mode/jobId(s)/fromStatus), just a plain settings save — kept here
//    rather than a separate page since it's directly about what triggers
//    DISCOUNT_DELETE jobs, right above the job list on this same page. ─────

export async function handleSaveDiscountDeleteSettings({ formData, session }) {
    try {
        const settings = await updateDiscountDeleteSettings({
            shop: session.shop,
            sessionId: session.id,
            onRewardCancel: formData.get("onRewardCancel") === "true",
            onRewardUsed: formData.get("onRewardUsed") === "true",
        });
        return { ok: true, intent: "saveDiscountDeleteSettings", message: "Discount cleanup settings saved.", discountDeleteSettings: settings };
    } catch (err) {
        logger.error("Failed to save discount-delete settings", { module: MODULE, shop: session.shop, error: err?.message });
        return { ok: false, intent: "saveDiscountDeleteSettings", message: "Failed to save settings." };
    }
}

// ── DELETE — from COMPLETED (manual purge ahead of the retention window
//    used by jobCleanupJob.js). Deliberately NOT offered for FAILED/PENDING
//    — those should be retried or explicitly cancelled first so there's a
//    clear audit trail of what happened. ────────────────────────────────────

export async function handleDelete({ formData, session }) {
    const mode = formData.get("mode");
    const fromStatus = formData.get("fromStatus");
    const shop = session.shop;

    let where;
    if (mode === "one") {
        where = { id: Number(formData.get("jobId")), shop, status: fromStatus };
    } else if (mode === "many") {
        const ids = (formData.get("jobIds") || "").split(",").map(Number).filter(Boolean);
        where = { id: { in: ids }, shop, status: fromStatus };
    } else if (mode === "group") {
        where = { type: formData.get("type"), shop, status: fromStatus };
    } else {
        return { ok: false, intent: "delete", message: "Unknown mode." };
    }

    try {
        const { count } = await prisma.job.deleteMany({ where });
        return { ok: true, intent: "delete", message: `${describeMode(formData, count)} deleted.` };
    } catch (err) {
        logger.error("Delete job failed", { module: MODULE, shop, error: err?.message });
        return { ok: false, intent: "delete", message: "Failed to delete job(s)." };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Server-only. The two small writes behind "Hide for 7 days" and "Mark as
// handled". Neither changes any points or money; they only remember what the
// merchant has seen, so an item they can't fix today stops nagging them.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "db-server";
import { logger } from "app/utils/logger.js";
import { SNOOZE_DAYS, SNOOZE_KEYS } from "./_attention.js";

const MODULE = "layout/health/_snooze.server.js";
const DAY_MS = 24 * 60 * 60 * 1000;

async function writeSnoozes(session, change) {
    const existing = await prisma.appSettings.findUnique({ where: { shop: session.shop }, select: { settings: true } });
    const healthSnooze = change({ ...(existing?.settings?.healthSnooze ?? {}) });
    // AppSettings.settings is a shared JSON blob: keep every other key as it is.
    const next = { ...(existing?.settings ?? {}), healthSnooze };
    await prisma.appSettings.upsert({
        where: { shop: session.shop },
        update: { settings: next },
        create: { shop: session.shop, sessionId: session.id, settings: next },
    });
}

/**
 * Hide a notice for a week. `count` is how big the problem is right now; if it
 * grows past that, the notice comes back even before the week is over.
 * @returns {Promise<boolean>} false when the key isn't one that can be hidden
 */
export async function snoozeItem(session, key, count) {
    if (!SNOOZE_KEYS.includes(key)) return false;
    const until = new Date(Date.now() + SNOOZE_DAYS * DAY_MS).toISOString();
    await writeSnoozes(session, (s) => ({ ...s, [key]: { until, count: Math.max(1, Math.floor(Number(count)) || 1) } }));
    logger.info(MODULE, "Health notice hidden", { shop: session.shop, key });
    return true;
}

/** Show a hidden notice again. */
export async function unsnoozeItem(session, key) {
    if (!SNOOZE_KEYS.includes(key)) return false;
    await writeSnoozes(session, (s) => {
        const { [key]: _gone, ...rest } = s; // eslint-disable-line no-unused-vars
        return rest;
    });
    return true;
}

/**
 * The merchant has dealt with an unpaid referral (added the points by hand, or
 * decided not to pay), so it leaves the list. Only touches a referral that
 * belongs to this shop and is still in the "not paid" state.
 * @returns {Promise<boolean>}
 */
export async function markReferralHandled(session, referralId) {
    const id = Number(referralId);
    if (!Number.isInteger(id) || id <= 0) return false;
    const referral = await prisma.referral.findFirst({
        where: { id, status: "ACTIVE", discountUsed: false, referrer: { sessionId: session.id } },
        select: { id: true, metadata: true },
    });
    if (!referral) return false;
    await prisma.referral.update({
        where: { id: referral.id },
        data: { metadata: { ...(referral.metadata ?? {}), healthHandled: { at: new Date().toISOString() } } },
    });
    logger.info(MODULE, "Unpaid referral marked as handled", { shop: session.shop, referralId: referral.id });
    return true;
}

/**
 * @file jobs/referralExpiryJob.js
 * @description Closes referral rewards that were waiting for the referred
 * member's first full-price payment and never got it in time.
 *
 * A reward waits (status AWAITING_FULL_PRICE) after the member's promo
 * first-month order. If they cancel, or never reach the full price, nothing
 * would ever release it — so after the shop's expiry time (Points Rules →
 * Referral, default 0 = never) it is closed with no points, and both
 * people are told. The expiry is read per shop, from the referral rule.
 */

import prisma from "../../app/db.server.js";
import { logger } from "../../app/utils/logger.js";
import { dbRetry } from "../../app/utils/retry/dbRetry.js";
import { getPointRuleByEvent } from "../../app/controller/pointsRule/getPointRuleByEvent.js";
import { notifyReferralOutcome } from "../../app/controller/referral/notifyReferralOutcome.js";
import { syncCustomerConfig } from "../../app/controller/metafieldsSync/syncCustomerConfig.js";
import { unauthenticated } from "../../app/shopify.server.js";
import { readExpiryDays, isExpired } from "../../app/utils/fullPrice.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "referralExpiryJob";

/** Most rewards looked at per cycle. */
const BATCH_SIZE = 500;

/**
 * @returns {Promise<void>}
 */
export async function runReferralExpiryJob() {
    const waiting = await dbRetry(
        () => prisma.referral.findMany({
            where: { status: "AWAITING_FULL_PRICE" },
            select: { id: true, referrerId: true, referredId: true, metadata: true, updatedAt: true, referrer: { select: { sessionId: true } } },
            orderBy: { updatedAt: "asc" },
            take: BATCH_SIZE,
        }),
        { module: MODULE }
    );
    if (!waiting.length) return;

    const bySession = new Map();
    for (const row of waiting) {
        const key = row.referrer?.sessionId;
        if (!key) continue;
        if (!bySession.has(key)) bySession.set(key, []);
        bySession.get(key).push(row);
    }

    for (const [sessionId, rows] of bySession) {
        try {
            const session = await prisma.session.findUnique({ where: { id: sessionId } });
            if (!session) continue;

            // getPointRuleByEvent only returns an ACTIVE rule. While the rule is
            // off, rewards are simply left waiting — nothing is expired by accident.
            const rule = await getPointRuleByEvent("REFERRAL", sessionId);
            if (!rule) continue;

            const days = readExpiryDays(rule.conditions?.referral);
            if (days <= 0) continue;

            let admin = null;
            for (const row of rows) {
                const since = row.metadata?.awaiting?.since ?? row.updatedAt;
                if (!isExpired(since, days)) continue;

                // Close it only if it is still waiting, so a payment arriving at the
                // same moment (which releases it) can never also be expired.
                const closed = await prisma.referral.updateMany({
                    where: { id: row.id, status: "AWAITING_FULL_PRICE" },
                    data: {
                        status: "EXPIRED",
                        metadata: { ...(row.metadata ?? {}), expired: { at: new Date().toISOString(), afterDays: days } },
                    },
                });
                if (closed.count === 0) continue;

                const orderGid = row.metadata?.awaiting?.orderId ?? "expired";
                await notifyReferralOutcome({ session, shop: session.shop, referralId: row.id, customerId: row.referrerId, notice: "REWARD_EXPIRED", orderGid });
                await notifyReferralOutcome({ session, shop: session.shop, referralId: row.id, customerId: row.referredId, notice: "REWARD_EXPIRED", orderGid });

                try {
                    admin ??= (await unauthenticated.admin(session.shop)).admin;
                    await Promise.all([
                        syncCustomerConfig(admin, row.referrerId),
                        syncCustomerConfig(admin, row.referredId),
                    ]);
                } catch (err) {
                    logger.warn(MODULE, "Customer sync after expiry failed — the expiry itself is saved", { referralId: row.id, error: err?.message });
                }

                logger.warn(MODULE, "Referral reward expired without a full-price payment", { shop: session.shop, referralId: row.id, days });
            }
        } catch (err) {
            // One shop failing must not stop the others.
            logger.error(MODULE, "Referral expiry failed for a shop", { sessionId, error: err?.message });
        }
    }
}

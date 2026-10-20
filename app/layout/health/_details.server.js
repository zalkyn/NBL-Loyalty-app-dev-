// ─────────────────────────────────────────────────────────────────────────────
// Server-only, read-only. The extra numbers only the Program Health page
// shows (the dashboard summary uses the lighter loadHealthData). Every query
// is scoped to the merchant's own session/shop and bounded to 30 days or a
// small row limit, so the page stays quick on large stores.
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "db-server";
import { logger } from "app/utils/logger.js";
import { getPointRuleByEvent } from "@controller/pointsRule/getPointRuleByEvent.js";
import { NON_ACTIONABLE_SKIP_REASONS } from "../subscription-cancellations/_data.js";

const MODULE = "layout/health/_details.server.js";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const FAILED_LIST_LIMIT = 10;

export const EMPTY_DETAILS = null;

/** What a stored error means in plain words. Anything unrecognised stays generic. */
export function explainJobError(error) {
    const e = String(error ?? "").toLowerCase();
    if (!e) return "No reason was recorded.";
    if (e.includes("appstle")) return "Subscription details from Appstle weren't available in time.";
    if (e.includes("429") || e.includes("throttle") || e.includes("rate limit")) return "Shopify was busy and asked us to slow down.";
    if (e.includes("timeout") || e.includes("econn") || e.includes("network") || e.includes("fetch failed")) return "A network problem interrupted it.";
    return "An unexpected problem stopped it.";
}

const orderNumber = (gid) => String(gid ?? "").split("/").pop() || null;

/**
 * @param {{ id: string, shop: string }} session
 */
export async function loadHealthDetails(session) {
    const since = new Date(Date.now() - THIRTY_DAYS_MS);
    const sessionScope = { sessionId: session.id };
    const ofShop = { customer: sessionScope };

    try {
        const [
            orderRule, referralRule, reviewRule, rewardRules, prizes, appSettings,
            processed30d, lastProcessed, failedRows,
            negativeBalances,
            vouchersCreated, vouchersUsed,
            prizePending, prizeNew,
            cancelGroups, cancelScheduled, cancelReset30d,
            heldReferrals,
        ] = await Promise.all([
            getPointRuleByEvent("ORDER", session.id).catch(() => null),
            getPointRuleByEvent("REFERRAL", session.id).catch(() => null),
            getPointRuleByEvent("REVIEW", session.id).catch(() => null),
            prisma.rewardRule.count({ where: { ...sessionScope, isActive: true } }),
            prisma.physicalPrize.count({ where: { ...sessionScope, isActive: true } }),
            prisma.appSettings.findUnique({ where: { shop: session.shop }, select: { looxFlowToken: true } }),

            prisma.job.count({ where: { shop: session.shop, type: "ORDER_PAID", status: "COMPLETED", completedAt: { gte: since } } }),
            prisma.job.findFirst({
                where: { shop: session.shop, type: "ORDER_PAID", status: "COMPLETED" },
                orderBy: { completedAt: "desc" }, select: { completedAt: true },
            }),
            prisma.job.findMany({
                where: { shop: session.shop, status: "FAILED", type: { in: ["ORDER_PAID", "ORDER_REVERSED"] }, updatedAt: { gte: since } },
                orderBy: { updatedAt: "desc" }, take: FAILED_LIST_LIMIT,
                select: { id: true, type: true, payload: true, lastError: true, attempts: true, updatedAt: true },
            }),

            prisma.customer.count({ where: { ...sessionScope, points: { lt: 0 } } }),

            prisma.reward.count({ where: { ...ofShop, createdAt: { gte: since } } }),
            prisma.reward.count({ where: { ...ofShop, usedAt: { gte: since } } }),

            prisma.physicalPrizeClaim.count({ where: { ...ofShop, status: "PENDING" } }),
            prisma.physicalPrizeClaim.count({ where: { ...ofShop, status: "PENDING", isSeenByAdmin: false } }),

            prisma.subscriptionCancelEvent.groupBy({
                by: ["resetApplied", "skipReason"],
                where: { shop: session.shop, sessionId: session.id },
                _count: { _all: true },
            }),
            prisma.subscriptionCancelEvent.count({ where: { shop: session.shop, sessionId: session.id, skipReason: "WAITING_PERIOD_END" } }),
            prisma.subscriptionCancelEvent.count({ where: { shop: session.shop, sessionId: session.id, resetApplied: true, cancelledAt: { gte: since } } }),

            prisma.referral.count({ where: { status: "HELD", referrer: sessionScope } }),
        ]);

        const cancelNeedsAction = cancelGroups.reduce(
            (sum, g) => (!g.resetApplied && !NON_ACTIONABLE_SKIP_REASONS.includes(g.skipReason) ? sum + g._count._all : sum),
            0
        );

        return {
            checklist: {
                orderRule: Boolean(orderRule),
                rewardRules,
                referralRule: Boolean(referralRule),
                reviewRule: Boolean(reviewRule),
                looxLink: Boolean(appSettings?.looxFlowToken),
                prizes,
            },
            orders: {
                processed30d,
                lastProcessedAt: lastProcessed?.completedAt?.toISOString() ?? null,
            },
            failed: failedRows.map((j) => ({
                id: j.id,
                kind: j.type === "ORDER_REVERSED" ? "Points taken back" : "Points for an order",
                orderNumber: orderNumber(j.payload?.orderId),
                reason: explainJobError(j.lastError),
                technical: String(j.lastError ?? "").slice(0, 160),
                attempts: j.attempts,
                at: j.updatedAt.toISOString(),
            })),
            customers: { negativeBalances },
            vouchers: { created30d: vouchersCreated, used30d: vouchersUsed },
            prizes: { pending: prizePending, unseen: prizeNew },
            subscriptions: { needsAction: cancelNeedsAction, scheduled: cancelScheduled, reset30d: cancelReset30d },
            referralsHeld: heldReferrals,
            shop: session.shop,
        };
    } catch (err) {
        logger.error(MODULE, "Failed to load health details", { sessionId: session.id, error: err?.message });
        return EMPTY_DETAILS;
    }
}

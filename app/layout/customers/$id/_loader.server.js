import prisma from "db-server";
import { customerOrderCount } from "app/graphql/query/customers";
import { logger } from "app/utils/logger.js";

export async function loadCustomerDetails(admin, sessionId, customerId) {
    const customer = await prisma.customer.findFirst({
        where: {
            sessionId,
            id: customerId ? parseInt(customerId) : undefined,
        },
        include: {
            transactions: {
                orderBy: { createdAt: "desc" },
                include: { event: true },
            },
            rewards: { orderBy: { createdAt: "desc" } },
            // Read-only history section — no actions here. Full claim
            // management (fulfill/complete/cancel) stays on the dedicated
            // Physical Prizes Claims page; this is just per-customer context.
            prizeClaims: {
                orderBy: { createdAt: "desc" },
                include: {
                    prize: { select: { title: true, imageUrl: true } },
                },
            },
            referralsSent: true,
            referralsUsed: true,
        },
    });

    if (!customer) return { customer: null };

    // Customer.orders is a cache — see schema.prisma. null means "never
    // synced", so do a one-time live Shopify fetch and persist it; every
    // later admin view of this customer reads the cached value directly,
    // no live API call. Going forward, orderPaidJob.js increments it on
    // every processed order, so this branch should only ever fire once per
    // customer (or after a DB row was recreated, e.g. self-healed).
    let orderCount = customer.orders;

    if (orderCount === null) {
        // customerOrderCount throws on failure (0 has business meaning
        // elsewhere, e.g. referral eligibility) — for this one-time
        // backfill, degrade to null ("unknown") instead of failing the
        // whole page load; it'll simply retry on the next admin view.
        orderCount = await customerOrderCount(admin, customer.shopifyId).catch((err) => {
            logger.error("Failed to backfill customer order count for dashboard", { error: err?.message, customerId: customer.id });
            return null;
        });

        if (orderCount !== null) {
            // Fire-and-forget — don't make the admin wait on this write,
            // and don't fail the page load if it errors; it'll just retry
            // the backfill on the next view.
            prisma.customer
                .update({ where: { id: customer.id }, data: { orders: orderCount } })
                .catch((err) => logger.error("Failed to cache backfilled order count", { error: err?.message, customerId: customer.id }));
        }
    }

    // ── Reward breakdown ────────────────────────────────────────────────────
    // Used = discountUsed true (applied at checkout — tracked by
    // voucherUpdateIfAvailable() in orderPaidJob.js). Active = still
    // redeemable (status ACTIVE, not yet used). Cancelled = refunded back
    // to the customer via the admin cancel action.
    const rewards = customer.rewards || [];
    const rewardStats = {
        total: rewards.length,
        used: rewards.filter((r) => r.discountUsed === true).length,
        active: rewards.filter((r) => r.status === "ACTIVE" && r.discountUsed === false).length,
        cancelled: rewards.filter((r) => r.status === "CANCELLED").length,
    };

    // ── Physical prize claim breakdown ──────────────────────────────────────
    const prizeClaims = customer.prizeClaims || [];
    const prizeClaimStats = {
        total: prizeClaims.length,
        pending: prizeClaims.filter((c) => c.status === "PENDING").length,
        fulfilled: prizeClaims.filter((c) => c.status === "FULFILLED").length,
        completed: prizeClaims.filter((c) => c.status === "COMPLETED").length,
        cancelled: prizeClaims.filter((c) => c.status === "CANCELLED").length,
    };

    return { customer: { ...customer, orderCount, rewardStats, prizeClaimStats } };
}

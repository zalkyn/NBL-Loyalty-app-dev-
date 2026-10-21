import { Prisma } from "@prisma/client";
import prisma from "db-server";
import { logger } from "app/utils/logger.js";
import { getPointRuleByEvent } from "@controller/pointsRule/getPointRuleByEvent.js";
import { awardFirstReferralReward } from "@controller/referral/awardReferralReward.js";
import { notifyReferralOutcome } from "@controller/referral/notifyReferralOutcome.js";
import { syncCustomerConfig } from "@controller/metafieldsSync/syncCustomerConfig.js";
import { TABS, DEFAULT_TAB, DEFAULT_PER_PAGE, MAX_PER_PAGE, BULK_LIMIT } from "./_data.js";

const MODULE = "layout/referral-reviews/_data.server.js";

const PERSON = { select: { id: true, shopifyId: true, name: true, firstName: true, lastName: true, email: true } };

// ─────────────────────────────────────────────────────────────────────────────
// LOAD — one tab at a time, searched and paginated in the database
// ─────────────────────────────────────────────────────────────────────────────

/** Where clause for each tab. Flagged/approved live in referral.metadata (see orderPaidJob.js). */
const tabWhere = (tab, sessionId) => {
    const scope = { referrer: { sessionId } };
    switch (tab) {
        case "flagged":
            return {
                ...scope,
                status: "USED",
                OR: [
                    { metadata: { path: ["reviewFlag"], not: Prisma.DbNull } },
                    { metadata: { path: ["approval"], not: Prisma.DbNull } },
                ],
            };
        case "rejected":
            return { ...scope, status: "REJECTED" };
        case "waiting":
        default:
            return { ...scope, status: "HELD" };
    }
};

const searchWhere = (q) => {
    if (!q) return {};
    const like = { contains: q, mode: "insensitive" };
    return {
        AND: [{
            OR: [
                { referrer: { email: like } },
                { referrer: { name: like } },
                { referred: { email: like } },
                { referred: { name: like } },
                { discountCode: like },
                { metadata: { path: ["hold", "orderLabel"], string_contains: q } },
            ],
        }],
    };
};

const int = (value, fallback, min, max) => {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/**
 * @param {{ id: string }} session
 * @param {URLSearchParams} params - tab, q, page, perPage
 */
export async function loadReviews(session, params) {
    const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : DEFAULT_TAB;
    const q = (params.get("q") ?? "").trim().slice(0, 100);
    const perPage = int(params.get("perPage"), DEFAULT_PER_PAGE, 1, MAX_PER_PAGE);

    const where = { ...tabWhere(tab, session.id), ...searchWhere(q) };

    // Tab badges are unfiltered counts, so they stay true while searching.
    const [waiting, flagged, rejected, total] = await Promise.all([
        prisma.referral.count({ where: tabWhere("waiting", session.id) }),
        prisma.referral.count({ where: tabWhere("flagged", session.id) }),
        prisma.referral.count({ where: tabWhere("rejected", session.id) }),
        prisma.referral.count({ where }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const page = int(params.get("page"), 1, 1, totalPages);

    const rows = await prisma.referral.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
        include: { referrer: PERSON, referred: PERSON },
    });

    return {
        tab, q, page, perPage, total, totalPages, rows,
        counts: { waiting, flagged, rejected },
        shop: session.shop,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// DECIDE — one referral at a time; bulk just loops over the same code
// ─────────────────────────────────────────────────────────────────────────────

async function getHeldReferral(referralId, session) {
    return prisma.referral.findFirst({
        where: { id: Number(referralId), status: "HELD", referrer: { sessionId: session.id } },
    });
}

/** @returns {Promise<{ ok: boolean, reason?: string }>} */
async function approveOne(referralId, session, admin) {
    const referral = await getHeldReferral(referralId, session);
    const hold = referral?.metadata?.hold;
    if (!referral || !hold) return { ok: false, reason: "no longer waiting" };

    // Claim it so two clicks (or two admins) can't both approve.
    const claim = await prisma.referral.updateMany({
        where: { id: referral.id, status: "HELD" },
        data: { status: "APPROVING" },
    });
    if (claim.count === 0) return { ok: false, reason: "handled by someone else" };

    try {
        const rule = await getPointRuleByEvent("REFERRAL", session.id);
        if (!rule?.event?.id) throw new Error("Referral points rule not found");

        // eslint-disable-next-line no-unused-vars
        const { hold: _hold, ...contract } = referral.metadata ?? {};

        await awardFirstReferralReward({
            session,
            shop: session.shop,
            referral,
            eventId: rule.event.id,
            orderGid: hold.orderId,
            orderLabel: hold.orderLabel,
            orderTotal: hold.orderTotal,
            referrerPoints: hold.referrerPoints,
            referredPoints: hold.referredPoints,
            subscriptionContract: Object.keys(contract).length ? contract : null,
            extraMetadata: { approval: { approvedAt: new Date().toISOString(), heldReason: hold.reason, signals: hold.signals } },
        });

        await Promise.all([
            syncCustomerConfig(admin, referral.referrerId),
            syncCustomerConfig(admin, referral.referredId),
        ]);

        logger.info(MODULE, "Held referral approved", { shop: session.shop, referralId: referral.id });
        return { ok: true };
    } catch (err) {
        // Put it back so it can be tried again; awards are idempotent per order.
        await prisma.referral.updateMany({ where: { id: referral.id, status: "APPROVING" }, data: { status: "HELD" } });
        logger.error(MODULE, "Approving held referral failed", { shop: session.shop, referralId: referral.id, error: err?.message });
        return { ok: false, reason: "points could not be recorded" };
    }
}

/** @returns {Promise<{ ok: boolean, reason?: string }>} */
async function rejectOne(referralId, session, admin) {
    const referral = await getHeldReferral(referralId, session);
    if (!referral) return { ok: false, reason: "no longer waiting" };
    const hold = referral.metadata?.hold ?? {};

    const result = await prisma.referral.updateMany({
        where: { id: referral.id, status: "HELD" },
        data: {
            status: "REJECTED",
            metadata: { ...(referral.metadata ?? {}), rejection: { rejectedAt: new Date().toISOString() } },
        },
    });
    if (result.count === 0) return { ok: false, reason: "handled by someone else" };

    // Only the referrer was waiting on points; the referred customer is told
    // only if they had a bonus coming too.
    await notifyReferralOutcome({ session, shop: session.shop, referralId: referral.id, customerId: referral.referrerId, notice: "REJECTED", orderGid: hold.orderId });
    if (hold.referredPoints > 0) {
        await notifyReferralOutcome({ session, shop: session.shop, referralId: referral.id, customerId: referral.referredId, notice: "REJECTED", orderGid: hold.orderId });
    }

    await Promise.all([
        syncCustomerConfig(admin, referral.referrerId),
        syncCustomerConfig(admin, referral.referredId),
    ]);

    logger.info(MODULE, "Held referral rejected", { shop: session.shop, referralId: referral.id });
    return { ok: true };
}

const parseIds = (formData) => [...new Set(
    String(formData.get("referralIds") ?? "").split(",").map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0)
)];

/**
 * Approve or reject one or several held referrals. One at a time, so a failure
 * on one never affects the others, and the message says exactly what happened.
 */
export async function handleDecide({ formData, session, admin }, decision) {
    const submitType = decision === "approve" ? "approveReferrals" : "rejectReferrals";
    const ids = parseIds(formData);
    if (!ids.length) return { message: "Choose at least one referral.", status: "error", submitType };
    if (ids.length > BULK_LIMIT) return { message: `Please choose ${BULK_LIMIT} or fewer at a time.`, status: "error", submitType };

    const decide = decision === "approve" ? approveOne : rejectOne;
    let done = 0;
    const failures = [];
    for (const id of ids) {
        const res = await decide(id, session, admin);
        if (res.ok) done++;
        else failures.push(res.reason);
    }

    const verb = decision === "approve" ? "approved — points awarded" : "rejected — no points awarded";
    if (done === ids.length) {
        return { message: ids.length === 1 ? `Referral ${verb}.` : `${done} referrals ${verb}.`, status: "success", submitType };
    }
    if (done === 0) {
        return {
            message: ids.length === 1
                ? `Nothing was changed (${failures[0]}). Refresh the page and try again.`
                : "Nothing was changed. Refresh the page and try again.",
            status: "error", submitType,
        };
    }
    return {
        message: `${done} of ${ids.length} referrals ${verb}. ${ids.length - done} could not be changed (${[...new Set(failures)].join(", ")}) and are still waiting.`,
        status: "error", submitType,
    };
}

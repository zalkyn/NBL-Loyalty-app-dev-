import prisma from "db-server";
import { logger } from "app/utils/logger.js";
import { getPointRuleByEvent } from "@controller/pointsRule/getPointRuleByEvent.js";
import { awardFirstReferralReward } from "@controller/referral/awardReferralReward.js";
import { syncCustomerConfig } from "@controller/metafieldsSync/syncCustomerConfig.js";

const MODULE = "layout/referral-reviews/_data.server.js";

const PERSON = { select: { id: true, shopifyId: true, name: true, firstName: true, lastName: true, email: true } };

/** Referrals held for review + recently rewarded ones that carry a flag. */
export async function loadReviews(session) {
    const [held, recent] = await Promise.all([
        prisma.referral.findMany({
            where: { status: "HELD", referrer: { sessionId: session.id } },
            orderBy: { updatedAt: "desc" },
            include: { referrer: PERSON, referred: PERSON },
        }),
        prisma.referral.findMany({
            where: { status: "USED", referrer: { sessionId: session.id } },
            orderBy: { updatedAt: "desc" },
            take: 200,
            include: { referrer: PERSON, referred: PERSON },
        }),
    ]);

    const flagged = recent.filter((r) => r.metadata?.reviewFlag || r.metadata?.approval).slice(0, 50);
    return { held, flagged };
}

async function getHeldReferral(referralId, session) {
    return prisma.referral.findFirst({
        where: { id: Number(referralId), status: "HELD", referrer: { sessionId: session.id } },
    });
}

export async function handleApprove({ formData, session, admin }) {
    const submitType = "approveReferral";
    const referralId = Number(formData.get("referralId"));
    if (!referralId) return { message: "Referral is required.", status: "error", submitType };

    const referral = await getHeldReferral(referralId, session);
    const hold = referral?.metadata?.hold;
    if (!referral || !hold) {
        return { message: "This referral is no longer waiting for review.", status: "error", submitType };
    }

    // Claim it so two clicks (or two admins) can't both approve.
    const claim = await prisma.referral.updateMany({
        where: { id: referral.id, status: "HELD" },
        data: { status: "APPROVING" },
    });
    if (claim.count === 0) {
        return { message: "This referral was just handled by someone else.", status: "error", submitType };
    }

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
        return { message: "Referral approved — points awarded.", status: "success", submitType };
    } catch (err) {
        // Put it back so it can be tried again; awards are idempotent per order.
        await prisma.referral.updateMany({ where: { id: referral.id, status: "APPROVING" }, data: { status: "HELD" } });
        logger.error(MODULE, "Approving held referral failed", { shop: session.shop, referralId: referral.id, error: err?.message });
        return { message: "Could not award the points. Nothing was changed — please try again.", status: "error", submitType };
    }
}

export async function handleReject({ formData, session, admin }) {
    const submitType = "rejectReferral";
    const referralId = Number(formData.get("referralId"));
    if (!referralId) return { message: "Referral is required.", status: "error", submitType };

    const referral = await getHeldReferral(referralId, session);
    if (!referral) return { message: "This referral is no longer waiting for review.", status: "error", submitType };

    const result = await prisma.referral.updateMany({
        where: { id: referral.id, status: "HELD" },
        data: {
            status: "REJECTED",
            metadata: { ...(referral.metadata ?? {}), rejection: { rejectedAt: new Date().toISOString() } },
        },
    });
    if (result.count === 0) return { message: "This referral was just handled by someone else.", status: "error", submitType };

    await Promise.all([
        syncCustomerConfig(admin, referral.referrerId),
        syncCustomerConfig(admin, referral.referredId),
    ]);

    logger.info(MODULE, "Held referral rejected", { shop: session.shop, referralId: referral.id });
    return { message: "Referral rejected — no points were awarded.", status: "success", submitType };
}

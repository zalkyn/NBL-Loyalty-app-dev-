import { Prisma } from "@prisma/client";
import prisma from "db-server";
import { logger } from "app/utils/logger.js";
import { getPointRuleByEvent } from "@controller/pointsRule/getPointRuleByEvent.js";
import { awardFirstReferralReward, deferFirstReferralReward } from "@controller/referral/awardReferralReward.js";
import { notifyReferralOutcome } from "@controller/referral/notifyReferralOutcome.js";
import { syncCustomerConfig } from "@controller/metafieldsSync/syncCustomerConfig.js";
import { generateReferralDiscountCode } from "@graphql/mutation/discounts/generateReferralDiscountCode.js";
import { customerOrderCount } from "@graphql/query/customers.js";
import { createCustomerReward } from "@controller/customerReward/createCustomerReward.js";
import { withRetry } from "app/utils/retry/withRetry.js";
import { CLAIM_STATUS, canApproveClaim } from "app/utils/referralApproval.js";
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
        case "claims":
            return { ...scope, status: CLAIM_STATUS.PENDING_APPROVAL };
        case "awaiting":
            return { ...scope, status: "AWAITING_FULL_PRICE" };
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
    const requestedTab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : null;
    const q = (params.get("q") ?? "").trim().slice(0, 100);
    const perPage = int(params.get("perPage"), DEFAULT_PER_PAGE, 1, MAX_PER_PAGE);

    // No tab chosen: open on New claims when any are waiting (that's the
    // urgent queue once manual approval is on), otherwise the usual default.
    // An approval that was interrupted (server restart mid-way) would leave a claim
    // stuck in ACTIVATING and invisible. Anything stuck there for 10 minutes goes
    // back to waiting so it can be decided again.
    await prisma.referral.updateMany({
        where: { status: CLAIM_STATUS.ACTIVATING, updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) }, referrer: { sessionId: session.id } },
        data: { status: CLAIM_STATUS.PENDING_APPROVAL },
    });

    let tab = requestedTab;
    if (!tab) {
        const claimsWaiting = await prisma.referral.count({ where: tabWhere("claims", session.id) });
        tab = claimsWaiting > 0 ? "claims" : DEFAULT_TAB;
    }

    const where = { ...tabWhere(tab, session.id), ...searchWhere(q) };

    // Tab badges are unfiltered counts, so they stay true while searching.
    const [claims, awaiting, waiting, flagged, rejected, total] = await Promise.all([
        prisma.referral.count({ where: tabWhere("claims", session.id) }),
        prisma.referral.count({ where: tabWhere("awaiting", session.id) }),
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
        counts: { claims, awaiting, waiting, flagged, rejected },
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

        const approval = { approvedAt: new Date().toISOString(), heldReason: hold.reason, signals: hold.signals };

        if (hold.deferred) {
            // The first order was the promo. Approving clears the suspicion;
            // the reward is still paid only on the first full-price payment.
            await deferFirstReferralReward({
                session,
                shop: session.shop,
                referral,
                orderGid: hold.orderId,
                orderLabel: hold.orderLabel,
                firstPaid: hold.firstPaid ?? 0,
                subscriptionContract: Object.keys(contract).length ? contract : null,
                extraMetadata: { approval },
            });
        } else {
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
                extraMetadata: { approval },
            });
        }

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

// ─────────────────────────────────────────────────────────────────────────────
// CLAIMS — referral claims waiting for approval (manual approval is on).
// No discount code exists yet; approving creates it.
// ─────────────────────────────────────────────────────────────────────────────

/** @returns {Promise<{ ok: boolean, reason?: string }>} */
async function approveClaimOne(referralId, session, admin) {
    const referral = await prisma.referral.findFirst({
        where: { id: Number(referralId), status: CLAIM_STATUS.PENDING_APPROVAL, referrer: { sessionId: session.id } },
        include: {
            referrer: { select: { id: true, referralCode: true } },
            referred: { select: { id: true, shopifyId: true } },
        },
    });
    if (!referral) return { ok: false, reason: "no longer waiting" };

    // Claim it so two clicks (or two admins) can't both approve — and so we
    // never create two Shopify discount codes for one customer.
    const claim = await prisma.referral.updateMany({
        where: { id: referral.id, status: CLAIM_STATUS.PENDING_APPROVAL },
        data: { status: CLAIM_STATUS.ACTIVATING },
    });
    if (claim.count === 0) return { ok: false, reason: "handled by someone else" };

    const putBack = () =>
        prisma.referral.updateMany({
            where: { id: referral.id, status: CLAIM_STATUS.ACTIVATING },
            data: { status: CLAIM_STATUS.PENDING_APPROVAL },
        });

    try {
        // The code is a "first order" discount. If they've ordered since
        // claiming it would be useless to them, so don't hand it out.
        const orders = await customerOrderCount(admin, referral.referred.shopifyId);
        const allowed = canApproveClaim(orders);
        if (!allowed.ok) {
            await putBack();
            return { ok: false, reason: allowed.reason };
        }

        const { code, discountNodeId } = await withRetry(
            () => generateReferralDiscountCode(admin, referral.referred.shopifyId, referral.referrer.referralCode, session.id),
            {
                maxAttempts: 3,
                baseDelayMs: 800,
                retryableErrors: ["fetch failed", "ECONNRESET", "ETIMEDOUT", "Something went wrong. Please try again later."],
                context: { shop: session.shop, referralId: referral.id, module: MODULE },
            }
        );
        if (!code) throw new Error("Discount code was not created");

        // Save the code on the referral straight away, before anything else can
        // fail, so a created Shopify discount is never left unknown to us.
        await prisma.referral.update({
            where: { id: referral.id },
            data: {
                status: "ACTIVE",
                discountCode: code,
                discountNodeId,
                discountInfo: "Referral discount code generated (approved by merchant)",
                metadata: { ...(referral.metadata ?? {}), approval: { kind: "claim", approvedAt: new Date().toISOString() } },
            },
        });

        // Everything below is best-effort polish: the referral is already live.
        await createCustomerReward({
            customerId: referral.referredId,
            event: "REFERRAL",
            type: "DEFAULT",
            status: "ACTIVE",
            title: "Referral discount voucher",
            description: `Use code ${code} at checkout to get your referral discount on your first order.`,
            code,
            discountNodeId,
        }).catch((err) => logger.error(MODULE, "Voucher record failed after claim approval", { referralId: referral.id, error: err?.message }));

        await notifyReferralOutcome({ session, shop: session.shop, referralId: referral.id, customerId: referral.referredId, notice: "CLAIM_APPROVED", orderGid: "claim" });
        await syncCustomerConfig(admin, referral.referredId);

        logger.info(MODULE, "Referral claim approved", { shop: session.shop, referralId: referral.id });
        return { ok: true };
    } catch (err) {
        await putBack();
        logger.error(MODULE, "Approving referral claim failed", { shop: session.shop, referralId: referral.id, error: err?.message });
        return { ok: false, reason: "the discount code could not be created" };
    }
}

/** @returns {Promise<{ ok: boolean, reason?: string }>} */
async function rejectClaimOne(referralId, session, admin) {
    const referral = await prisma.referral.findFirst({
        where: { id: Number(referralId), status: CLAIM_STATUS.PENDING_APPROVAL, referrer: { sessionId: session.id } },
    });
    if (!referral) return { ok: false, reason: "no longer waiting" };

    const result = await prisma.referral.updateMany({
        where: { id: referral.id, status: CLAIM_STATUS.PENDING_APPROVAL },
        data: {
            status: CLAIM_STATUS.REJECTED,
            metadata: { ...(referral.metadata ?? {}), rejection: { kind: "claim", rejectedAt: new Date().toISOString() } },
        },
    });
    if (result.count === 0) return { ok: false, reason: "handled by someone else" };

    // Only the claimant is told; the referrer never knew about this claim.
    await notifyReferralOutcome({ session, shop: session.shop, referralId: referral.id, customerId: referral.referredId, notice: "CLAIM_REJECTED", orderGid: "claim" });
    await syncCustomerConfig(admin, referral.referredId);

    logger.info(MODULE, "Referral claim rejected", { shop: session.shop, referralId: referral.id });
    return { ok: true };
}

/** Sends one id to the right decision: a waiting claim, or a held reward. */
async function decideOne(decision, id, session, admin) {
    const row = await prisma.referral.findFirst({
        where: { id: Number(id), referrer: { sessionId: session.id } },
        select: { status: true },
    });
    const isClaim = row?.status === CLAIM_STATUS.PENDING_APPROVAL;
    if (decision === "approve") return isClaim ? approveClaimOne(id, session, admin) : approveOne(id, session, admin);
    return isClaim ? rejectClaimOne(id, session, admin) : rejectOne(id, session, admin);
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

    let done = 0;
    const failures = [];
    for (const id of ids) {
        const res = await decideOne(decision, id, session, admin);
        if (res.ok) done++;
        else failures.push(res.reason);
    }

    const verb = decision === "approve" ? "approved" : "rejected";
    if (done === ids.length) {
        return { message: ids.length === 1 ? `Referral ${verb}.` : `${done} referrals ${verb}.`, status: "success", submitType };
    }
    if (done === 0) {
        // Refreshing only helps when someone else already decided; a failed code
        // creation needs the customer to exist in Shopify.
        const codeFailed = failures.some((f) => String(f).includes("could not be created"));
        if (codeFailed) {
            return {
                message: "Nothing was changed (the discount code could not be created in Shopify). Check that the customer exists in Shopify, then try again.",
                status: "error", submitType,
            };
        }
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

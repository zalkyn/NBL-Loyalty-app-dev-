import { logger } from "app/utils/logger.js";
import { unauthenticated } from "shopify-server";
import getCorsHeaders from "app/utils/getCorsHeaders.js";
import prisma from "db-server";
import { generateRewardVoucher } from "app/graphql/mutation/discounts/generateRewardVoucher.js";
import createTransaction from "app/controller/transaction/createTransaction";
import { createCustomerReward } from "@app/controller/customerReward/createCustomerReward.js";
import { syncCustomerConfig } from "app/controller/metafieldsSync/syncCustomerConfig.js";

const MODULE = "api.get-voucher.jsx";

export async function action({ request }) {
    const corsHeaders = getCorsHeaders(request);

    if (request.method === "OPTIONS") return corsResponse(null, 204, corsHeaders);
    if (request.method !== "POST") return corsResponse({ error: "Method not allowed" }, 405, corsHeaders);

    try {
        const body = await request.json();
        validateRequestBody(body);

        const { shop, customerId, customerIndex, rewardRuleId, title } = body;

        const [customer, { admin, session }] = await Promise.all([
            getValidCustomer(customerIndex),
            unauthenticated.admin(shop),
        ]);

        if (!session) throw new AppError("Valid shop session required", 401);
        if (!customer) throw new AppError("Customer not found", 404);

        const rewardRule = await getValidRewardRule(rewardRuleId);
        if (!rewardRule) throw new AppError("Reward rule not found", 404);
        if (!rewardRule.isActive) throw new AppError("Reward is no longer active", 422);

        // usageLimit check
        if (rewardRule.usageLimit && rewardRule.usageCount >= rewardRule.usageLimit) {
            throw new AppError("Reward usage limit reached", 422);
        }

        // per-customer usage check
        if (rewardRule.usagePerUser) {
            const usedCount = await prisma.reward.count({
                where: {
                    customerId: customer.id,
                    rewardRuleId: rewardRule.id,
                    status: { in: ["ACTIVE", "USED"] },
                },
            });
            if (usedCount >= rewardRule.usagePerUser) {
                throw new AppError("You have reached the usage limit for this reward", 422);
            }
        }

        if (rewardRule.pointsCost > customer.points) {
            throw new AppError(
                `Insufficient points. Required: ${rewardRule.pointsCost}, Available: ${customer.points}`,
                422
            );
        }

        const voucherCode = await redeemReward({
            admin,
            session,
            customer,
            rewardRule,
            title,
            customerId,
        });

        const updatedCustomer = await syncCustomerConfig(admin, customerId);

        logger.info("Reward redeemed successfully", {
            module: MODULE,
            customerId,
            customerIndex,
            rewardRuleId,
            voucherCode,
        });

        return corsResponse(
            { shop, voucherCode, title, points: updatedCustomer?.points ?? null },
            200,
            corsHeaders
        );
    } catch (err) {
        const statusCode = err instanceof AppError ? err.statusCode : 500;
        logger.error("Get voucher api error", { module: MODULE, error: err?.message, stack: err?.stack });
        return corsResponse({ error: "Get voucher api error", details: err.message }, statusCode, corsHeaders);
    }
}

export async function loader({ request }) {
    const corsHeaders = getCorsHeaders(request);
    if (request.method === "OPTIONS") return corsResponse(null, 204, corsHeaders);
    return corsResponse({ status: "ok", timestamp: new Date().toISOString() }, 200, corsHeaders);
}

// ─────────────────────────────────────────────
// Core Business Logic
// ─────────────────────────────────────────────

async function redeemReward({ admin, session, customer, rewardRule, customerId, title }) {
    const voucherCode = await generateRewardVoucher(admin, customerId, rewardRule);
    if (!voucherCode) throw new AppError("Voucher generation failed", 500);

    const pointsCost = Math.abs(Number(rewardRule.pointsCost) || 0);

    // create Reward record + increment usageCount in parallel
    const [newReward] = await Promise.all([
        createCustomerReward({
            customerId: customer.id,
            rewardRuleId: rewardRule.id,
            event: "MANUAL", // closest valid value for a manual redemption
            type: "REDEEM",
            title: title || rewardRule.title || "Points redemption",
            description: rewardRule.description || "Redeemed points for a discount voucher",
            code: voucherCode,
            pointsCost,
            status: "ACTIVE", // directly approve since voucher code is already generated and valid
        }),
        prisma.rewardRule.update({
            where: { id: rewardRule.id },
            data: { usageCount: { increment: 1 } },
        }),
    ]);

    await createTransaction(
        {
            customerId: customer.id,
            type: "REDEEM",
            reason: `${pointsCost} points redeemed for reward: ${rewardRule.title}`,
            activity: `-${pointsCost} points redeemed for reward: ${rewardRule.title}`,
            points: pointsCost,
            rewardId: newReward?.id,
            status: 'COMPLETED'
        },
        session
    );

    return voucherCode;
}

// ─────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────

function validateRequestBody({ shop, customerId, customerIndex, rewardRuleId }) {
    if (!shop) throw new AppError("Valid shop required", 400);
    if (!customerId || !customerIndex) throw new AppError("Valid customer required", 400);
    if (!rewardRuleId) throw new AppError("Valid rewardRuleId required", 400);
}

// ─────────────────────────────────────────────
// DB Helpers
// ─────────────────────────────────────────────

async function getValidRewardRule(id) {
    try {
        return await prisma.rewardRule.findFirst({
            where: { id: Number(id) },
        });
    } catch (error) {
        logger.error("Failed to fetch reward rule", { module: MODULE, rewardRuleId: id, error: error?.message });
        return null;
    }
}

async function getValidCustomer(id) {
    try {
        return await prisma.customer.findFirst({
            where: { id: Number(id) },
        });
    } catch (error) {
        logger.error("Failed to fetch customer", { module: MODULE, customerIndex: id, error: error?.message });
        return null;
    }
}

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

function corsResponse(body, status, corsHeaders) {
    return new Response(body !== null ? JSON.stringify(body) : null, {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
    });
}

class AppError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
    }
}
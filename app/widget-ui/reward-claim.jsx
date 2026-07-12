/**
 * @file widget-ui/reward-claim.jsx
 * @description App Proxy route: redeems a points-based reward rule for a
 * discount voucher.
 *
 * Registered manually in app/routes.js:
 *   route("widget-data/get-reward-voucher", "widget-ui/reward-claim.jsx")
 *
 * Storefront calls: POST /apps/widget/get-reward-voucher
 *   Body: { rewardRuleId, title? }
 *
 * Identity comes ONLY from the Shopify-signed `logged_in_customer_id` query
 * param — the customer is resolved server-side from it, never from a
 * client-supplied numeric id. (Previously this trusted a `customerIndex`
 * sent by the client; if that ever went stale — e.g. after a DB reset, or
 * pointing at a different shop's row — every redemption failed with
 * "Customer not found" even though the customer genuinely existed.)
 */

import { logger } from "app/utils/logger.js";
import { authenticate } from "shopify-server";
import prisma from "db-server";
import { normalizeCustomerGid } from "@controller/customers/normalizeCustomerGid.js";
import { generateRewardVoucher } from "app/graphql/mutation/discounts/generateRewardVoucher.js";
import createTransaction from "app/controller/transaction/createTransaction";
import { createCustomerReward } from "@app/controller/customerReward/createCustomerReward.js";
import { syncCustomerConfig } from "app/controller/metafieldsSync/syncCustomerConfig.js";
import { withRetry } from "app/utils/retry/withRetry.js";
import { dbRetry } from "app/utils/retry/dbRetry.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "widget-data.get-voucher";

// ─────────────────────────────────────────────────────────────────────────────
// Route Handlers
// ─────────────────────────────────────────────────────────────────────────────

export async function action({ request }) {
    if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // Declared here (not just inside the try) so the catch block can still
    // log them even if the failure happens before they're assigned (e.g. an
    // auth rejection before shop/shopifyId are known).
    let shop;
    let shopifyId;

    try {
        // ── Auth + identity resolution now live INSIDE the try/catch below,
        // same as every other step in this handler. Previously this ran
        // before the try block, so if authenticate.public.appProxy() ever
        // threw (a malformed/replayed proxy request, a library-level edge
        // case, etc.) it would bypass our structured logger and JSON error
        // response entirely and surface as an unhandled framework error
        // instead of a clean, logged one.
        const { admin, session } = await authenticate.public.appProxy(request);
        if (!session) throw new AppError("Valid shop session required.", 401);
        shop = session.shop;

        const url = new URL(request.url);
        const loggedInCustomerId = url.searchParams.get("logged_in_customer_id");
        if (!loggedInCustomerId) throw new AppError("You must be logged in.", 401);
        shopifyId = normalizeCustomerGid(loggedInCustomerId);

        const body = await request.json();
        validateRequestBody(body);

        const { rewardRuleId, title } = body;

        logger.info("Received get-voucher request", { module: MODULE, shop, rewardRuleId, shopifyId });

        const [customer, rewardRule] = await Promise.all([
            getValidCustomer(shopifyId, session.id),
            getValidRewardRule(rewardRuleId, session.id),
        ]);

        if (!customer) throw new AppError("Customer not found", 404);
        if (!rewardRule) throw new AppError("Reward rule not found", 404);
        if (!rewardRule.isActive) throw new AppError("Reward is no longer active", 422);

        // Guard: global usage cap
        if (rewardRule.usageLimit && rewardRule.usageCount >= rewardRule.usageLimit) {
            throw new AppError("Reward usage limit reached", 422);
        }

        // Guard: per-customer usage cap
        if (rewardRule.usagePerUser) {
            const usedCount = await dbRetry(
                () =>
                    prisma.reward.count({
                        where: {
                            customerId: customer.id,
                            rewardRuleId: rewardRule.id,
                            status: { in: ["ACTIVE", "USED"] },
                        },
                    }),
                { module: MODULE, customerId: customer.id, rewardRuleId: rewardRule.id }
            );
            if (usedCount >= rewardRule.usagePerUser) {
                throw new AppError("You have reached the usage limit for this reward", 422);
            }
        }

        // Guard: sufficient points balance
        if (rewardRule.pointsCost > customer.points) {
            throw new AppError(
                `Insufficient points. Required: ${Number(rewardRule.pointsCost).toLocaleString()}, Available: ${Number(customer.points).toLocaleString()}`,
                422
            );
        }

        const { voucherCode, pointsCost, rewardTitle, activity, createdAt } = await redeemReward({
            admin,
            session,
            customer,
            rewardRule,
            title,
            customerId: shopifyId,
        });

        // Sync updated customer config back to metafields — non-critical.
        const updatedCustomer = await syncCustomerConfig(admin, shopifyId);
        if (!updatedCustomer) {
            logger.error("Metafield sync failed after all retries — redemption is still valid", {
                module: MODULE,
                shopifyId,
            });
        }

        logger.info("Reward redeemed successfully", {
            module: MODULE,
            shopifyId,
            rewardRuleId,
            voucherCode,
        });

        return jsonResponse(
            {
                shop: session.shop,
                voucherCode,
                title: title || rewardTitle,
                points: updatedCustomer?.points ?? null,
                pointsCost: -pointsCost,
                activity,
                createdAt,
            },
            200
        );
    } catch (err) {
        const statusCode = err instanceof AppError ? err.statusCode : 500;
        logger.error("Get voucher api error", err, { module: MODULE, shop, shopifyId });
        return jsonResponse({ error: "Get voucher api error", details: err.message }, statusCode);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Business Logic (unchanged from api-routes/reward-claim.jsx)
// ─────────────────────────────────────────────────────────────────────────────

async function redeemReward({ admin, session, customer, rewardRule, customerId, title }) {
    const shop = session?.shop;
    const pointsCost = Math.abs(Number(rewardRule.pointsCost) || 0);

    // ── 1. Deduct points FIRST ──────────────────────────────────────────────
    //
    // Previously the Shopify voucher (a real, external, hard-to-revoke
    // discount code) was generated before points were deducted. If the points
    // deduction then failed, the customer was left with a genuinely usable
    // discount code they never actually paid points for — an internal
    // rollback can cancel our own Reward/usageCount records, but can't
    // "un-create" a discount code that already exists on Shopify.
    //
    // Deducting first flips the failure mode to something fully recoverable
    // within our own DB: if voucher generation then fails, we refund the
    // points we just took (see the catch block below) — no external state
    // to reconcile either way.
    const transaction = await createTransaction(
        {
            customerId: customer.id,
            type: "REDEEM",
            reason: `${pointsCost.toLocaleString()} points redeemed for reward: ${rewardRule.title}`,
            activity: `-${pointsCost.toLocaleString()} points redeemed for reward: ${rewardRule.title}`,
            points: pointsCost,
            // rewardId intentionally omitted — the Reward row doesn't exist
            // yet at this point (it needs the real voucher code, generated
            // next). The reason/activity text above already identifies which
            // reward this was for.
            status: "COMPLETED",
            notifiedAt: new Date(),
        },
        session
    );

    if (!transaction) {
        throw new AppError("Points deduction failed. Please try again.", 500);
    }

    // ── 2. Generate the Shopify voucher ──────────────────────────────────────
    let voucherCode;
    try {
        voucherCode = await withRetry(
            () => generateRewardVoucher(admin, customerId, rewardRule),
            {
                maxAttempts: 3,
                baseDelayMs: 800,
                retryableErrors: [
                    "fetch failed",
                    "ECONNRESET",
                    "ETIMEDOUT",
                    "Something went wrong. Please try again later.",
                ],
                context: { shop, module: MODULE, customerId, rewardRuleId: rewardRule.id },
            }
        );
        if (!voucherCode) throw new Error("Voucher generation returned no code");
    } catch (err) {
        logger.error("Voucher generation failed after points were deducted — refunding", {
            module: MODULE,
            customerId: customer.id,
            rewardRuleId: rewardRule.id,
            originalTransactionId: transaction.id,
            error: err?.message,
        });

        const refund = await createTransaction(
            {
                customerId: customer.id,
                type: "ADJUST",
                reason: `Refund — voucher generation failed for reward: ${rewardRule.title}`,
                activity: `+${pointsCost.toLocaleString()} points refunded (redemption failed)`,
                points: pointsCost, // positive = credit back
                status: "COMPLETED",
            },
            session
        );

        if (!refund) {
            // Both the original deduction and the refund attempt are logged
            // with enough detail (customerId, rewardRuleId, transaction id)
            // for manual reconciliation — this should be rare (createTransaction
            // already retries transient failures internally) but must never
            // be silent, since it's the one path where a customer could be
            // left short of points with nothing to show for it.
            logger.error("Refund ALSO failed — customer may be short points, needs manual reconciliation", {
                module: MODULE,
                customerId: customer.id,
                rewardRuleId: rewardRule.id,
                originalTransactionId: transaction.id,
            });
        }

        throw new AppError("Voucher generation failed. Your points were refunded — please try again.", 500);
    }

    // ── 3. Create the reward record + bump usage count ───────────────────────
    // Only reached once we have a real voucher code and the customer's points
    // are already safely deducted.
    const [newReward] = await Promise.all([
        createCustomerReward({
            customerId: customer.id,
            rewardRuleId: rewardRule.id,
            event: "MANUAL",
            type: "REDEEM",
            title: title || rewardRule.title || "Points redemption",
            description: rewardRule.description || "Redeemed points for a discount voucher",
            code: voucherCode,
            pointsCost,
            status: "ACTIVE",
        }),
        dbRetry(
            () => prisma.rewardRule.update({ where: { id: rewardRule.id }, data: { usageCount: { increment: 1 } } }),
            { module: MODULE, rewardRuleId: rewardRule.id }
        ),
    ]);

    return {
        voucherCode,
        pointsCost,
        rewardTitle: rewardRule.title,
        activity: `-${pointsCost.toLocaleString()} points redeemed for reward: ${rewardRule.title}`,
        createdAt: newReward?.createdAt ?? new Date(),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function validateRequestBody({ rewardRuleId }) {
    if (!rewardRuleId) throw new AppError("Valid rewardRuleId required", 400);
}

// ─────────────────────────────────────────────────────────────────────────────
// DB Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getValidRewardRule(id, sessionId) {
    try {
        return await dbRetry(
            () => prisma.rewardRule.findFirst({ where: { id: Number(id), sessionId } }),
            { module: MODULE, rewardRuleId: id, sessionId }
        );
    } catch (error) {
        logger.error("Failed to fetch reward rule", { module: MODULE, rewardRuleId: id, sessionId, error: error?.message });
        return null;
    }
}

// shopifyId comes from Shopify's signed `logged_in_customer_id` — not from
// the client body — so this lookup can't be pointed at another shop's
// customer or a stale/forged id the way the old customerIndex lookup could.
async function getValidCustomer(shopifyId, sessionId) {
    try {
        return await dbRetry(
            () => prisma.customer.findFirst({ where: { shopifyId, sessionId } }),
            { module: MODULE, shopifyId, sessionId }
        );
    } catch (error) {
        logger.error("Failed to fetch customer", { module: MODULE, shopifyId, sessionId, error: error?.message });
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

class AppError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
    }
}
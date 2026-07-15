/**
 * @file widget-ui/prize-claim.jsx
 * @description App Proxy route: claims a physical prize with points.
 *
 * Registered manually in app/routes.js:
 *   route("widget-data/claim-prize", "widget-ui/prize-claim.jsx")
 *
 * Storefront calls: POST /apps/widget/claim-prize
 *   Body: { prizeId }
 *
 * Identity comes ONLY from the Shopify-signed `logged_in_customer_id` query
 * param — same fix as widget-ui/reward-claim.jsx (see that file's header
 * comment for why trusting a client-supplied customerIndex was fragile).
 */

import { logger } from "app/utils/logger.js";
import { authenticate } from "shopify-server";
import prisma from "db-server";
import { normalizeCustomerGid } from "@controller/customers/normalizeCustomerGid.js";
import createTransaction from "app/controller/transaction/createTransaction";
import { syncCustomerConfig } from "app/controller/metafieldsSync/syncCustomerConfig.js";
import checkUpdateRequired from "@controller/customers/checkUpdateRequired.js";
import { dbRetry } from "app/utils/retry/dbRetry.js";

const MODULE = "widget-data.claim-prize";

// ─────────────────────────────────────────────────────────────────────────────
// Route Handlers
// ─────────────────────────────────────────────────────────────────────────────

export async function action({ request }) {
    if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // Declared here (not just inside the try) so the catch block can still
    // log them even if the failure happens before they're assigned (e.g. an
    // auth rejection before shopifyId is known).
    let shopifyId;

    try {
        // ── Auth + identity resolution now live INSIDE the try/catch below —
        // see reward-claim.jsx's header comment for why running this before
        // the try block was a reliability gap (an unexpected throw from
        // authenticate.public.appProxy() would bypass our structured logger
        // and JSON error response entirely).
        const { admin, session } = await authenticate.public.appProxy(request);
        if (!session) throw new AppError("Valid shop session required.", 401);

        const url = new URL(request.url);
        const loggedInCustomerId = url.searchParams.get("logged_in_customer_id");
        if (!loggedInCustomerId) throw new AppError("You must be logged in.", 401);
        shopifyId = normalizeCustomerGid(loggedInCustomerId);

        const body = await request.json();
        validateRequestBody(body);

        const { prizeId } = body;

        const [customer, prize] = await Promise.all([
            getValidCustomer(shopifyId, session.id),
            getValidPrize(prizeId, session.id),
        ]);

        if (!customer) throw new AppError("Customer not found", 404);
        if (!prize) throw new AppError("Prize not found", 404);
        if (!prize.isActive) throw new AppError("This prize is no longer available", 422);

        // Guard: pending update — see checkUpdateRequired.js / reward-claim.jsx's
        // matching guard for the full rationale.
        const updateCheck = await checkUpdateRequired({ shop: session.shop, customerDbId: customer.id });
        if (updateCheck.blocked) throw new AppError(updateCheck.message, 409, "UPDATE_REQUIRED");

        if (prize.pointsCost > customer.points) {
            throw new AppError(
                `Insufficient points. Required: ${Number(prize.pointsCost).toLocaleString()}, Available: ${Number(customer.points).toLocaleString()}`,
                422
            );
        }

        const { claim, pointsCost, balanceAfter } = await claimPrize({ session, customer, prize });

        // Sync metafields — non-critical, deliberately not awaited. See
        // reward-claim.jsx for the full rationale: this is a second,
        // separate Shopify Admin API call whose only purpose is refreshing
        // the customer's metafield cache for their next full page load —
        // the response below already has everything needed without it.
        syncCustomerConfig(admin, shopifyId, { scope: ["core", "transactions", "prizeClaims"] }).then((updatedCustomer) => {
            if (!updatedCustomer) {
                logger.error("Metafield sync failed after all retries — claim is still valid", {
                    module: MODULE,
                    claimId: claim.id,
                });
            }
        });

        logger.info("Prize claimed successfully", {
            module: MODULE,
            shopifyId,
            prizeId,
            claimId: claim.id,
        });

        return jsonResponse(
            {
                shop: session.shop,
                claimId: claim.id,
                prizeId: prize.id,
                status: claim.status,
                title: prize.title,
                points: balanceAfter,
                pointsCost: -pointsCost,
                createdAt: claim.createdAt,
            },
            200
        );
    } catch (err) {
        const statusCode = err instanceof AppError ? err.statusCode : 500;
        logger.error("Claim prize api error", err, { module: MODULE, shopifyId });
        return jsonResponse({ error: "Claim prize api error", details: err.message, code: err.code || undefined }, statusCode);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Business Logic (unchanged from api-routes/physical-prize-claim.jsx)
// ─────────────────────────────────────────────────────────────────────────────

async function claimPrize({ session, customer, prize }) {
    const pointsCost = Math.abs(Number(prize.pointsCost) || 0);

    const claim = await dbRetry(
        () =>
            prisma.physicalPrizeClaim.create({
                data: {
                    status: "PENDING",
                    pointsCost,
                    customer: { connect: { id: customer.id } },
                    prize: { connect: { id: prize.id } },
                },
            }),
        { module: MODULE, customerId: customer.id, prizeId: prize.id }
    );

    const transaction = await createTransaction(
        {
            customerId: customer.id,
            type: "REDEEM",
            reason: `${pointsCost.toLocaleString()} points redeemed for prize: ${prize.title}`,
            activity: `-${pointsCost.toLocaleString()} points redeemed for prize: ${prize.title}`,
            points: pointsCost,
            status: "COMPLETED",
            notifiedAt: new Date(),
        },
        session
    );

    if (!transaction) {
        logger.error("Transaction failed — cancelling prize claim", {
            module: MODULE,
            claimId: claim.id,
            customerId: customer.id,
            prizeId: prize.id,
        });

        await dbRetry(
            () => prisma.physicalPrizeClaim.update({ where: { id: claim.id }, data: { status: "CANCELLED" } }),
            { module: MODULE, claimId: claim.id }
        );

        throw new AppError("Points deduction failed. Please try again.", 500);
    }

    await dbRetry(
        () => prisma.physicalPrizeClaim.update({ where: { id: claim.id }, data: { transactionId: transaction.id } }),
        { module: MODULE, claimId: claim.id, transactionId: transaction.id }
    );

    return { claim, pointsCost, balanceAfter: transaction.balanceAfter };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function validateRequestBody({ prizeId }) {
    if (!prizeId) throw new AppError("Valid prizeId required", 400);
}

// ─────────────────────────────────────────────────────────────────────────────
// DB Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getValidPrize(id, sessionId) {
    try {
        return await dbRetry(
            () => prisma.physicalPrize.findFirst({ where: { id: Number(id), sessionId } }),
            { module: MODULE, prizeId: id, sessionId }
        );
    } catch (error) {
        logger.error("Failed to fetch prize", { module: MODULE, prizeId: id, sessionId, error: error?.message });
        return null;
    }
}

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
    constructor(message, statusCode = 500, code = null) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
        // See reward-claim.jsx's matching AppError for the full rationale.
        this.code = code;
    }
}

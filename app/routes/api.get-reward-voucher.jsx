import { logger } from "app/utils/logger";
import { unauthenticated } from "shopify-server";
import getCorsHeaders from "app/utils/getCorsHeaders";
import prisma from "db-server";
import { generateRewardVoucher } from "app/graphql/mutation/discounts/generateRewardVoucher";
import createPointsTransaction from "app/controller/pointsTransaction/createPointTransaction";
import { createCustomerReward } from "app/controller/customerReward/createCustomerReward";
import { syncCustomerConfig } from "app/controller/metafieldsSync/syncCustomerConfig";

const MODULE = "api.get-voucher.jsx";

/**
 * POST /api/get-voucher
 * Redeems a reward for a customer and returns a discount voucher.
 *
 * Body: { shop, customerId, customerIndex, rewardId }
 *   - customerId    → Shopify GID (used for Shopify Admin API calls)
 *   - customerIndex → Internal DB customer ID (used for Prisma lookups)
 */

export async function action({ request }) {
    const corsHeaders = getCorsHeaders(request);

    if (request.method === "OPTIONS") {
        return corsResponse(null, 204, corsHeaders);
    }

    if (request.method !== "POST") {
        return corsResponse({ error: "Method not allowed" }, 405, corsHeaders);
    }

    try {
        const body = await request.json();

        validateRequestBody(body);

        const { shop, customerId, customerIndex, rewardId, title } = body;

        // Fetch customer (DB) and Shopify admin session in parallel
        const [customer, { admin, session }] = await Promise.all([
            getValidCustomer(customerIndex),
            unauthenticated.admin(shop),
        ]);

        if (!session) throw new AppError("Valid shop session required", 401);
        if (!customer) throw new AppError("Customer not found", 404);

        const reward = await getValidReward(rewardId);

        if (!reward) throw new AppError("Reward not found", 404);

        if (reward.pointsCost > customer.points) {
            throw new AppError(
                `Insufficient points. Required: ${reward.pointsCost}, Available: ${customer.points}`,
                422
            );
        }

        const rewardVoucher = await redeemReward({
            admin,
            session,
            customer,
            reward,
            title,
            customerId, // Shopify GID
        });

        const updatedCustomer = await syncCustomerConfig(admin, customerId);

        logger.info("Reward redeemed successfully", {
            module: MODULE,
            customerId,
            customerIndex,
            rewardId,
            voucherCode: rewardVoucher,
        });

        return corsResponse(
            {
                shop,
                rewardVoucher,
                title,
                points: updatedCustomer?.points ?? null,
            },
            200,
            corsHeaders
        );

    } catch (err) {
        const statusCode = err instanceof AppError ? err.statusCode : 500;

        logger.error("Get voucher api error", {
            module: MODULE,
            error: err?.message,
            stack: err?.stack,
        });

        return corsResponse(
            {
                error: "Get voucher api error",
                details: err.message,
            },
            statusCode,
            corsHeaders
        );
    }
}

/**
 * GET /api/get-voucher
 * Health check endpoint.
 */
export async function loader({ request }) {
    const corsHeaders = getCorsHeaders(request);

    if (request.method === "OPTIONS") {
        return corsResponse(null, 204, corsHeaders);
    }

    return corsResponse({ status: "ok", timestamp: new Date().toISOString() }, 200, corsHeaders);
}

// ─────────────────────────────────────────────
// Core Business Logic
// ─────────────────────────────────────────────

/**
 * Generates a voucher and records the redemption transaction + reward entry.
 * Transaction and reward creation run in parallel for performance.
 *
 * @param {object} params
 * @param {object} params.admin      - Shopify Admin API client
 * @param {object} params.session    - Shopify session
 * @param {object} params.customer   - DB customer record
 * @param {object} params.reward     - DB reward record
 * @param {string} params.customerId - Shopify GID
 * @returns {Promise<string>} - The generated voucher code
 */
async function redeemReward({ admin, session, customer, reward, customerId, title }) {
    const rewardVoucher = await generateRewardVoucher(admin, customerId, reward);

    if (!rewardVoucher) {
        throw new AppError("Voucher generation failed", 500);
    }

    const pointsCost = Math.abs(Number(reward?.pointsCost) || 0);

    // create customer reward
    const newReward = await createCustomerReward({
        customerId: customer.id,
        event: "REDEEM",
        type: reward.discountType,
        title: title || "Redeem points",
        description: "Redeem points",
        code: rewardVoucher,
        pointsCost: reward?.pointsCost
    });

    // create transaction
    await createPointsTransaction(
        {
            customerId: customer.id,
            type: "REDEEM",
            reason: title || reward.description || "Reward redemption",
            points: pointsCost,
            rewardId: newReward?.id
        },
        session
    );

    return rewardVoucher;
}

// ─────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────

/**
 * Validates the required fields in the request body.
 * Throws AppError early if anything is missing.
 *
 * @param {object} body - Parsed request JSON body
 */
function validateRequestBody({ shop, customerId, customerIndex, rewardId }) {
    if (!shop) throw new AppError("Valid shop required", 400);
    if (!customerId || !customerIndex) throw new AppError("Valid customer required", 400);
    if (!rewardId) throw new AppError("Valid rewardId required", 400);
}

// ─────────────────────────────────────────────
// DB Helpers
// ─────────────────────────────────────────────

/**
 * Fetches a reward by its internal DB ID.
 *
 * @param {string|number} id - Reward DB ID
 * @returns {Promise<object|null>}
 */
async function getValidReward(id) {
    try {
        return await prisma.reward.findFirst({
            where: { id: Number(id) },
        });
    } catch (error) {
        logger.error("Failed to fetch reward", { module: MODULE, rewardId: id, error: error?.message });
        return null;
    }
}

/**
 * Fetches a customer by their internal DB ID (customerIndex).
 *
 * @param {string|number} id - Customer DB ID (customerIndex from request)
 * @returns {Promise<object|null>}
 */
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

/**
 * Builds a JSON Response with CORS headers.
 *
 * @param {object|null} body        - Response payload (null for 204)
 * @param {number}      status      - HTTP status code
 * @param {object}      corsHeaders - CORS headers object
 * @returns {Response}
 */
function corsResponse(body, status, corsHeaders) {
    return new Response(
        body !== null ? JSON.stringify(body) : null,
        {
            status,
            headers: { "Content-Type": "application/json", ...corsHeaders },
        }
    );
}

/**
 * Custom error class that carries an HTTP status code.
 * Allows the catch block to return the right HTTP status per error type.
 */
class AppError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
    }
}
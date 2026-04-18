import { logger } from "app/utils/logger";
import { unauthenticated } from "shopify-server";
import getCorsHeaders from "app/utils/getCorsHeaders";
import { syncCustomerConfig } from "@controller/metafieldsSync/syncCustomerConfig";
import { generateReferralDiscountCode } from "@graphql/mutation/discounts/generateReferralDiscountCode";
import prisma from "db-server";
import { normalizeCustomerGid } from "../controller/customers/normalizeCustomerGid";
import { customerOrderCount } from "@graphql/query/customers";

// ------------------ CONSTANTS ------------------

const REFERRAL_STATUS = {
    PENDING: "PENDING",
};

const ERROR_CODES = {
    INVALID_INPUT: "INVALID_INPUT",
    INVALID_REFERRAL_CODE: "INVALID_REFERRAL_CODE",
    CUSTOMER_NOT_FOUND: "CUSTOMER_NOT_FOUND",
    SELF_REFERRAL: "SELF_REFERRAL",
    DISCOUNT_ALREADY_USED: "DISCOUNT_ALREADY_USED",
    DISCOUNT_ALREADY_EXISTS: "DISCOUNT_ALREADY_EXISTS",
    REFERRAL_ALREADY_LOCKED: "REFERRAL_ALREADY_LOCKED",
    INELIGIBLE_CUSTOMER_ORDERS: "INELIGIBLE_CUSTOMER_ORDERS",
    INTERNAL_ERROR: "INTERNAL_ERROR"
};

// ------------------ MAIN ACTION ------------------

export async function action({ request }) {
    const corsHeaders = getCorsHeaders(request);

    // ---------- CORS ----------
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
        return jsonResponse({
            success: false,
            message: "Method not allowed",
            code: ERROR_CODES.INVALID_INPUT
        }, 405, corsHeaders);
    }

    try {
        const { shop, customerId, referralCode } = await request.json();

        // ---------- Validate Input ----------
        validateInput({ shop, customerId, referralCode });

        // ---------- Shopify Admin ----------
        const { admin, session } = await unauthenticated.admin(shop);
        if (!session) {
            throw createError("Valid shop session required.", ERROR_CODES.INVALID_INPUT);
        }

        // ---------- Order count check -----------
        const referredOrdersCount = await customerOrderCount(admin, customerId);
        if (referredOrdersCount > 0) {
            throw createError(
                "Sorry! You are not eligible for referral rewards because you already placed an order.",
                ERROR_CODES.INELIGIBLE_CUSTOMER_ORDERS
            );
        }

        // ---------- Fetch Customers ----------
        const [referrer, referred] = await Promise.all([
            getReferrer(referralCode),
            getReferred(customerId)
        ]);

        logger.info("referrer", referrer)
        logger.info("referred", referred)

        validateCustomers(referrer, referred);

        // ---------- Prevent Self Referral ----------
        if (referrer.id === referred.id) {
            throw createError("You cannot refer yourself.", ERROR_CODES.SELF_REFERRAL);
        }

        // ---------- Check Existing Referral ----------
        const existingReferral = await findExistingReferral(referred.id);

        logger.info("existingReferral====", existingReferral)

        if (existingReferral) {
            return handleExistingReferral(
                existingReferral,
                referrer.id,
                referralCode,
                corsHeaders
            );
        }

        // ---------- Generate Discount ----------
        const discountCode = await generateReferralDiscountCode(
            admin,
            customerId,
            referralCode
        );

        if (!discountCode) {
            throw createError("Failed to generate discount code.", ERROR_CODES.INTERNAL_ERROR);
        }

        // ---------- Save Referral ----------
        await createReferral(referrer.id, referred.id, discountCode);

        // ---------- Sync customer config ----------
        await syncCustomerConfig(admin, customerId);

        // ---------- Success ----------
        return jsonResponse({
            success: true,
            referralCode,
            referralDiscountCode: discountCode,
            message: "Your referral discount code is ready to use.",
            code: "SUCCESS"
        }, 200, corsHeaders);

    } catch (err) {
        logger.error("Referral API error", {
            message: err?.message,
            code: err?.code,
            module: "api.referral"
        });

        return jsonResponse({
            success: false,
            message: err.message || "Something went wrong",
            code: err.code || ERROR_CODES.INTERNAL_ERROR
        }, 500, corsHeaders);
    }
}

// ------------------ HELPERS ------------------

// ---------- Standard JSON Response ----------
function jsonResponse(data, status, headers) {
    return new Response(JSON.stringify(data), { status, headers });
}

// ---------- Custom Error Creator ----------
function createError(message, code) {
    const err = new Error(message);
    err.code = code;
    return err;
}

// ---------- Input Validation ----------
function validateInput({ shop, customerId, referralCode }) {
    if (!shop) {
        throw createError("Shop is required.", ERROR_CODES.INVALID_INPUT);
    }

    if (!customerId) {
        throw createError("Customer ID is required.", ERROR_CODES.INVALID_INPUT);
    }

    if (!referralCode) {
        throw createError("Referral code is required.", ERROR_CODES.INVALID_INPUT);
    }
}

// ---------- DB Queries ----------

// Get referrer by referralCode
async function getReferrer(referralCode) {
    return prisma.customer.findFirst({
        where: { referralCode },
        select: { id: true, referralCode: true }
    });
}

// Get referred customer
async function getReferred(customerId) {
    return prisma.customer.findFirst({
        where: { shopifyId: normalizeCustomerGid(customerId) },
        select: { id: true }
    });
}

// Validate fetched customers
function validateCustomers(referrer, referred) {
    if (!referrer) {
        throw createError(
            "Invalid referral code. Please check and try again.",
            ERROR_CODES.INVALID_REFERRAL_CODE
        );
    }

    if (!referred) {
        throw createError(
            "Customer not found. Please login and try again.",
            ERROR_CODES.CUSTOMER_NOT_FOUND
        );
    }
}

// ---------- Referral Logic ----------

// Find existing referral (1 per referred user)
async function findExistingReferral(referredId) {
    return prisma.referral.findUnique({
        where: { referredId },
        select: {
            referrerId: true,
            discountCode: true,
            discountUsed: true
        }
    });
}

// Handle all existing referral scenarios
function handleExistingReferral(referral, currentReferrerId, referralCode, headers) {

    // Already used
    if (referral.discountUsed) {
        return jsonResponse({
            success: false,
            referralCode,
            referralDiscountCode: referral.discountCode,
            message: "You have already used your referral discount.",
            code: ERROR_CODES.DISCOUNT_ALREADY_USED
        }, 200, headers);
    }

    // Different referrer checking → block
    if (referral.referrerId !== currentReferrerId) {
        return jsonResponse({
            success: false,
            referralCode,
            referralDiscountCode: referral.discountCode,
            message: "You already have a referral discount from another user. You cannot change the referral code.",
            code: ERROR_CODES.REFERRAL_ALREADY_LOCKED
        }, 200, headers);
    }

    // Same referrer → return existing code
    return jsonResponse({
        success: true,
        referralCode,
        referralDiscountCode: referral.discountCode,
        message: "Your referral discount code is still valid.",
        code: ERROR_CODES.DISCOUNT_ALREADY_EXISTS
    }, 200, headers);
}

// ---------- Create Referral (Race Condition Safe) ----------
async function createReferral(referrerId, referredId, discountCode) {
    try {
        return await prisma.referral.create({
            data: {
                status: REFERRAL_STATUS.PENDING,
                discountCode,
                discountInfo: "Referral Discount",
                referrerId,
                referredId
            }
        });
    } catch (err) {
        // Unique constraint hit
        if (err.code === "P2002") {
            throw createError(
                "Referral already exists. Discount already generated.",
                ERROR_CODES.DISCOUNT_ALREADY_EXISTS
            );
        }
        throw err;
    }
}

// ------------------ HEALTH CHECK ------------------

export async function loader({ request }) {
    const corsHeaders = getCorsHeaders(request);

    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    return jsonResponse(
        {
            status: "ok",
            timestamp: new Date().toISOString()
        },
        200,
        corsHeaders
    );
}




/**
 * @file widget-ui/referral-claim.jsx
 * @description App Proxy route: validates a referral code and generates a
 * one-time discount code for the referred customer.
 *
 * Registered manually in app/routes.js:
 *   route("widget-data/get-referral-discount", "widget-ui/referral-claim.jsx")
 *
 * Storefront calls: POST /apps/widget/get-referral-discount
 *   Body: { referralCode }
 *
 * The referred customer's identity comes ONLY from the Shopify-signed
 * `logged_in_customer_id` query param — same fix as the other migrated
 * routes in this directory. referralCode is still an ordinary body param:
 * it identifies the *referrer*, not the requester, and is validated against
 * the DB (including the same-shop check below) regardless of who sends it.
 *
 * Success response (200):
 *   { success: true, referralCode, referralDiscountCode, message }
 *
 * Error responses (400 / 404 / 409 / 422 / 500):
 *   { success: false, code, message }
 */

import { logger } from "app/utils/logger";
import { authenticate } from "shopify-server";
import { syncCustomerConfig } from "@controller/metafieldsSync/syncCustomerConfig";
import { generateReferralDiscountCode } from "@graphql/mutation/discounts/generateReferralDiscountCode";
import prisma from "db-server";
import { normalizeCustomerGid } from "@controller/customers/normalizeCustomerGid.js";
import checkUpdateRequired from "@controller/customers/checkUpdateRequired.js";
import { customerOrderCount } from "@graphql/query/customers";
import createTransaction from "@controller/transaction/createTransaction.js";
import { createCustomerReward } from "@controller/customerReward/createCustomerReward.js";
import { withRetry } from "app/utils/retry/withRetry.js";
import { dbRetry } from "app/utils/retry/dbRetry.js";
import { getReferralByReferredId } from "@controller/referral/getReferral.js";
import { createReferral as createReferralRecord } from "@controller/referral/createReferral.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "widget-data.get-referral-discount";

// =====================================================
// CONSTANTS
// =====================================================

const REFERRAL_STATUS = {
    PENDING: "PENDING",
    ACTIVE: "ACTIVE",
    REDEEMED: "REDEEMED",
    EXPIRED: "EXPIRED",
    CANCELLED: "CANCELLED",
};

const ERROR_CODES = {
    // 400
    INVALID_INPUT: { code: "INVALID_INPUT", status: 400 },
    UNAUTHORIZED: { code: "UNAUTHORIZED", status: 401 },
    // 404
    INVALID_REFERRAL_CODE: { code: "INVALID_REFERRAL_CODE", status: 404 },
    CUSTOMER_NOT_FOUND: { code: "CUSTOMER_NOT_FOUND", status: 404 },
    // 409
    DISCOUNT_ALREADY_USED: { code: "DISCOUNT_ALREADY_USED", status: 409 },
    DISCOUNT_ALREADY_EXISTS: { code: "DISCOUNT_ALREADY_EXISTS", status: 409 },
    REFERRAL_ALREADY_LOCKED: { code: "REFERRAL_ALREADY_LOCKED", status: 409 },
    // Pending update — see checkUpdateRequired.js / reward-claim.jsx's
    // matching guard for the full rationale. 409 for the same
    // stale-client-conflict reasoning as the other 409s above.
    UPDATE_REQUIRED: { code: "UPDATE_REQUIRED", status: 409 },
    // 422
    SELF_REFERRAL: { code: "SELF_REFERRAL", status: 422 },
    INELIGIBLE_CUSTOMER_ORDERS: { code: "INELIGIBLE_CUSTOMER_ORDERS", status: 422 },
    // 500
    INTERNAL_ERROR: { code: "INTERNAL_ERROR", status: 500 },
};

// =====================================================
// MAIN ACTION
// =====================================================

export async function action({ request }) {
    if (request.method !== "POST") {
        return jsonResponse(
            { success: false, message: "Method not allowed.", code: ERROR_CODES.INVALID_INPUT.code },
            405
        );
    }

    // Declared here (not just inside the try) so the catch block can still
    // log them even if the failure happens before they're assigned (e.g. an
    // auth rejection before shop/shopifyId are known).
    let shop;
    let shopifyId;
    let referralCode;

    try {
        // ── Auth + identity resolution now live INSIDE this try/catch, same
        // as every other step below — see reward-claim.jsx's header comment
        // for why running this before the try block was a reliability gap
        // (an unexpected throw from authenticate.public.appProxy() would
        // bypass our structured logger and JSON error response entirely).
        const { admin, session } = await authenticate.public.appProxy(request);
        if (!session) {
            throw createError("Valid shop session required.", ERROR_CODES.UNAUTHORIZED);
        }
        shop = session.shop;

        const url = new URL(request.url);
        const loggedInCustomerId = url.searchParams.get("logged_in_customer_id");
        if (!loggedInCustomerId) {
            throw createError("You must be logged in.", ERROR_CODES.UNAUTHORIZED);
        }
        shopifyId = normalizeCustomerGid(loggedInCustomerId);

        let body;
        try {
            body = await request.json();
        } catch {
            throw createError("Invalid request body.", ERROR_CODES.INVALID_INPUT);
        }
        referralCode = body.referralCode;

        // ── 1. Validate input ─────────────────────────────────────────────────
        if (!referralCode) throw createError("Referral code is required.", ERROR_CODES.INVALID_INPUT);

        // ── 2. Fetch referrer and referred customer in parallel ───────────────
        //
        // referralCode is globally unique (checked at generation time across
        // the whole DB), so getReferrer intentionally does NOT filter by
        // session — that's fine for finding the row. getReferred IS scoped
        // to session.id since shopifyId lookups should only ever resolve
        // within the currently authenticated shop.
        const [referrer, referred] = await Promise.all([
            getReferrer(referralCode),
            getReferred(shopifyId, session.id),
        ]);

        validateCustomers(referrer, referred);

        // ── 2.0 Guard: pending update ───────────────────────────────────────────
        // Only the REFERRED customer (the one actually making this request
        // and about to get a new discount/points) needs to be in sync — the
        // referrer isn't performing an action here. See checkUpdateRequired.js
        // / reward-claim.jsx's matching guard for the full rationale.
        const updateCheck = await checkUpdateRequired({ shop, customerDbId: referred.id });
        if (updateCheck.blocked) {
            throw createError(updateCheck.message, ERROR_CODES.UPDATE_REQUIRED);
        }

        // ── 2.1 Enforce same-shop referral ─────────────────────────────────────
        if (referrer.sessionId !== session.id) {
            throw createError(
                "Invalid referral code. Please check the code and try again.",
                ERROR_CODES.INVALID_REFERRAL_CODE
            );
        }

        // ── 3. Prevent self-referral ──────────────────────────────────────────
        if (referrer.id === referred.id) {
            throw createError(
                "You cannot use your own referral code.",
                ERROR_CODES.SELF_REFERRAL
            );
        }

        // ── 4. Check for existing referral ────────────────────────────────────
        //
        // Deliberately BEFORE the order-count eligibility check below. Once a
        // referred customer completes their first order (the referred order
        // itself!), their order count is permanently > 0 — so if eligibility
        // ran first, every re-check after that (the widget's revalidateClaim
        // background reconciliation, or simply reopening the modal) would
        // hit "you've already placed an order" (422 INELIGIBLE_CUSTOMER_ORDERS)
        // and never reach the "already used" / "still valid" report below.
        // The customer would see a stale "your code is ready" success state
        // forever, since the frontend doesn't treat that 422 as a locked
        // state either. Checking for an existing referral first means a
        // customer who already has one — used or not — always gets an
        // accurate status, regardless of their current order count.
        const existingReferral = await findExistingReferral(referred.id);

        if (existingReferral) {
            return handleExistingReferral({
                existingReferral,
                currentReferrerId: referrer.id,
                referralCode,
            });
        }

        // ── 5. Eligibility: referred customer must have 0 prior orders ────────
        // Only reached for a genuinely first-time claim attempt (no existing
        // referral row yet) — this is what actually prevents an existing
        // customer from grabbing a "new customer" referral discount.
        const referredOrderCount = await customerOrderCount(admin, shopifyId);

        logger.info("Checking referral eligibility", {
            shop,
            shopifyId,
            referralCode,
            referredOrderCount,
        });

        if (referredOrderCount > 0) {
            throw createError(
                "You are not eligible for the referral reward because you have already placed an order.",
                ERROR_CODES.INELIGIBLE_CUSTOMER_ORDERS
            );
        }

        // ── 6. Generate Shopify discount code ─────────────────────────────────
        const { code: discountCode, discountNodeId } = await withRetry(
            () => generateReferralDiscountCode(admin, shopifyId, referralCode, session.id),
            {
                maxAttempts: 3,
                baseDelayMs: 800,
                retryableErrors: [
                    "fetch failed",
                    "ECONNRESET",
                    "ETIMEDOUT",
                    "Something went wrong. Please try again later.",
                ],
                context: { shop, customerId: shopifyId, referralCode, module: MODULE },
            }
        );

        if (!discountCode) {
            throw createError(
                "Failed to generate your discount code. Please try again.",
                ERROR_CODES.INTERNAL_ERROR
            );
        }

        // ── 7. Save referral record ───────────────────────────────────────────
        const newReferral = await createReferral(referrer.id, referred.id, discountCode, discountNodeId);

        // ── 8. Transaction — audit trail only, no points movement yet ─────────
        await createTransaction(
            {
                customerId: referred.id,
                type: "EARN",
                points: 0,
                referralId: newReferral.id,
                status: "PENDING",
                reason: `Referral code ${referralCode} applied — waiting for your first order to confirm the reward`,
                activity: `Referral discount is ready — use it at checkout on your first order`,
                metadata: {
                    referralCode,
                    discountCode,
                    referrerId: referrer.id,
                },
                notifiedAt: new Date(),
            },
            session
        );

        // ── 8.1 Reward record for referred customer ───────────────────────────
        await createCustomerReward({
            customerId: referred.id,
            event: "REFERRAL",
            type: "DEFAULT",
            status: "ACTIVE",
            title: "Referral discount voucher",
            description: `Use code ${discountCode} at checkout to get your referral discount on your first order.`,
            code: discountCode,
            discountNodeId,
            // referralId: newReferral.id, // TODO: uncomment after Reward.referralId added to schema
        });

        // ── 9. Sync customer metafields ──────────────────────────────────────
        // Non-critical, deliberately not awaited — see reward-claim.jsx for
        // the full rationale. The response below doesn't use anything from
        // this call's result, so there's no reason to make the customer
        // wait for a second, separate Shopify Admin API round-trip on top
        // of the discount-code-generation call above.
        syncCustomerConfig(admin, shopifyId).then((synced) => {
            if (!synced) {
                logger.error("Metafield sync failed after all retries — referral is still valid", {
                    module: MODULE,
                    shopifyId,
                });
            }
        });

        logger.success("Referral discount generated", {
            referrerId: referrer.id,
            referredId: referred.id,
            discountCode,
        });

        // ── 10. Return success ────────────────────────────────────────────────
        return jsonResponse(
            {
                success: true,
                referralCode,
                referralDiscountCode: discountCode,
                message: "Your referral discount code is ready! Use it at checkout.",
            },
            200
        );

    } catch (err) {
        const errorDef = err?.errorDef || ERROR_CODES.INTERNAL_ERROR;
        const isClientError = errorDef.status < 500;

        if (isClientError) {
            logger.warn("Referral request rejected", {
                error: err?.message,
                code: errorDef.code,
                shop,
                shopifyId,
                referralCode,
                module: MODULE,
            });
        } else {
            logger.error("Referral API error", {
                error: err?.message,
                code: errorDef.code,
                shop,
                shopifyId,
                referralCode,
                module: MODULE,
            });
        }

        return jsonResponse(
            {
                success: false,
                message: err.message || "Something went wrong. Please try again.",
                code: errorDef.code,
            },
            errorDef.status
        );
    }
}

// =====================================================
// RESPONSE HELPER
// =====================================================

function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

// =====================================================
// ERROR FACTORY
// =====================================================

function createError(message, errorDef) {
    const err = new Error(message);
    err.errorDef = errorDef;
    return err;
}

// =====================================================
// DB QUERIES (unchanged from api-routes/referral-claim.jsx)
// =====================================================

function getReferrer(referralCode) {
    return dbRetry(
        () => prisma.customer.findFirst({ where: { referralCode }, select: { id: true, referralCode: true, sessionId: true } }),
        { module: MODULE, referralCode }
    );
}

function getReferred(shopifyId, sessionId) {
    return dbRetry(
        () => prisma.customer.findFirst({ where: { shopifyId, sessionId }, select: { id: true } }),
        { module: MODULE, shopifyId, sessionId }
    );
}

function validateCustomers(referrer, referred) {
    if (!referrer) {
        throw createError(
            "Invalid referral code. Please check the code and try again.",
            ERROR_CODES.INVALID_REFERRAL_CODE
        );
    }

    if (!referred) {
        throw createError(
            "Customer account not found. Please log in and try again.",
            ERROR_CODES.CUSTOMER_NOT_FOUND
        );
    }
}

function findExistingReferral(referredId) {
    // Shared with app/controller/referral/getReferral.js — same dbRetry-wrapped
    // findUnique-by-referredId query used elsewhere in the app (customer detail
    // page, referral listing). Keeping this as one implementation means retry
    // behavior and logging stay consistent everywhere a referral is looked up
    // by the referred customer.
    return getReferralByReferredId(referredId, {
        id: true,
        referrerId: true,
        discountCode: true,
        discountUsed: true,
    });
}

// =====================================================
// REFERRAL LOGIC
// =====================================================

function handleExistingReferral({ existingReferral, currentReferrerId, referralCode }) {

    if (existingReferral.discountUsed) {
        return jsonResponse(
            {
                success: false,
                code: ERROR_CODES.DISCOUNT_ALREADY_USED.code,
                message: "You have already used your referral discount. It can only be used once.",
            },
            ERROR_CODES.DISCOUNT_ALREADY_USED.status
        );
    }

    if (existingReferral.referrerId !== currentReferrerId) {
        return jsonResponse(
            {
                success: false,
                code: ERROR_CODES.REFERRAL_ALREADY_LOCKED.code,
                message: "You already have a referral discount from another person. You cannot switch referral codes.",
            },
            ERROR_CODES.REFERRAL_ALREADY_LOCKED.status
        );
    }

    return jsonResponse(
        {
            success: true,
            referralCode,
            referralDiscountCode: existingReferral.discountCode,
            message: "Your referral discount code is still valid. Use it at checkout!",
        },
        200
    );
}

async function createReferral(referrerId, referredId, discountCode, discountNodeId) {
    // Shared with app/controller/referral/createReferral.js — same
    // dbRetry-wrapped create, same P2002 (unique referredId) handling.
    // The controller swallows P2002 and returns null instead of throwing,
    // so we translate that back into this route's error-code convention.
    const referral = await createReferralRecord(
        {
            referrerId,
            referredId,
            status: REFERRAL_STATUS.ACTIVE,
            discountCode,
            discountNodeId,
            discountInfo: "Referral discount code generated",
        },
        { id: true }
    );

    if (!referral) {
        throw createError(
            "A referral discount has already been generated for your account.",
            ERROR_CODES.DISCOUNT_ALREADY_EXISTS
        );
    }

    return referral;
}

import { logger } from "app/utils/logger";
import { unauthenticated } from "shopify-server";
import getCorsHeaders from "app/utils/getCorsHeaders";
import prisma from "db-server";
import createTransaction from "app/controller/transaction/createTransaction";
import { createCustomerReward } from "app/controller/customerReward/createCustomerReward";
import { syncCustomerConfig } from "app/controller/metafieldsSync/syncCustomerConfig";
import { getPointRuleByEvent } from "app/controller/pointsRule/getPointRuleByEvent";
import { isDuplicateEvent } from "app/controller/webhook/handleDuplicateWebhook";
import { dbRetry } from "app/utils/retry/dbRetry.js";

const MODULE = "api.loox-new-review-trigger";

/**
 * Resolves which shop a request belongs to from the `:token` URL segment
 * (see app/routes.js: "api/loox-new-review-trigger/:token").
 *
 * This endpoint is called by a Shopify Flow workflow ("Loox new review
 * trigger"), not directly by Loox — Flow's HTTP request action has no
 * built-in request signing, and the review payload itself carries no shop
 * identifier. Each shop gets its own unique, unguessable token (generated
 * and shown on app/loox-setup — see ensureLooxFlowToken.js), baked directly
 * into the URL the merchant pastes into their Flow workflow. This one
 * lookup both authenticates the call AND tells us which shop it's for —
 * a wrong/missing/revoked token resolves to null and the request is
 * rejected before the body is even parsed.
 *
 * @param {string|undefined} token
 * @returns {Promise<{ sessionId: string, shop: string }|null>}
 */
const resolveShopFromToken = async (token) => {
    if (!token) return null;

    return dbRetry(
        () =>
            prisma.appSettings.findUnique({
                where: { looxFlowToken: token },
                select: { sessionId: true, shop: true },
            }),
        { module: MODULE, token }
    );
};

// ============================================================
// CONSTANTS
// ============================================================

/** Review type identifiers derived from Loox photo_url detection */
const REVIEW_TYPE = {
    TEXT: "TEXT",
    PHOTO: "PHOTO",
    VIDEO: "VIDEO",
};

/**
 * Controls how many times a customer can earn review points
 * for the same product. Set via conditions.review.rewardMode.
 *
 * "once"      - reward on the very first review, regardless of type.
 * "per_type"  - each type (TEXT, PHOTO, VIDEO) rewardable once per product. (default)
 * "unlimited" - every submission earns points, no cap.
 */
const REWARD_MODE = {
    ONCE: "once",
    PER_TYPE: "per_type",
    UNLIMITED: "unlimited",
};

// ============================================================
// FEATURE METHODS
// ============================================================

/**
 * Validates required Loox webhook fields.
 *
 * @param {string} email
 * @param {string} productId
 * @returns {boolean}
 */
const validateReview = (email, productId) => {
    if (!email || !productId) {
        logger.warn(MODULE, "Missing required fields, skipping", { email, productId });
        return false;
    }
    return true;
};

/**
 * Detects the type of a Loox review from its photo_url.
 *
 * Loox sends a .jpg thumbnail even for video reviews, so extension-based
 * detection is attempted first. Falls back to a HEAD request Content-Type
 * check when no recognisable extension is present.
 *
 * Detection order:
 *   1. No URL       -> TEXT
 *   2. .mp4 / .mov  -> VIDEO  (fast, no network)
 *   3. image ext    -> PHOTO  (fast, no network)
 *   4. HEAD request -> VIDEO | PHOTO by Content-Type
 *   5. Unknown      -> PHOTO  (safe fallback)
 *
 * @param {string|null} photoUrl
 * @returns {Promise<"TEXT"|"PHOTO"|"VIDEO">}
 */
const detectReviewType = async (photoUrl) => {
    if (!photoUrl) return REVIEW_TYPE.TEXT;

    if (/\.(mp4|mov)$/i.test(photoUrl)) return REVIEW_TYPE.VIDEO;
    if (/\.(jpg|jpeg|png|webp|gif)$/i.test(photoUrl)) return REVIEW_TYPE.PHOTO;

    try {
        const res = await fetch(photoUrl, { method: "HEAD" });
        const contentType = res.headers.get("content-type") || "";
        if (contentType.startsWith("video/")) return REVIEW_TYPE.VIDEO;
        if (contentType.startsWith("image/")) return REVIEW_TYPE.PHOTO;
    } catch {
        // Network error or CORS -- fall through to safe default
    }

    return REVIEW_TYPE.PHOTO;
};

/**
 * Loads the customer record for a given email, scoped to the shop resolved
 * from the request's token — so a duplicate email across two different
 * shops can never match the wrong one.
 *
 * @param {string} email
 * @param {string} sessionId
 * @returns {Promise<Object|null>} Customer with `id`, `shopifyId`, or null
 */
const loadCustomer = (email, sessionId) =>
    dbRetry(
        () => prisma.customer.findFirst({ where: { email, sessionId }, select: { id: true, shopifyId: true } }),
        { module: MODULE, email, sessionId }
    );

/**
 * Resolves reward config for a given review type from rule conditions.
 *
 * Conditions shape (conditions.review):
 *   {
 *     text:  { points: 10, isActive: true },
 *     image: { points: 20, isActive: true },   // Loox uses "image" key for photo
 *     video: { points: 30, isActive: false },
 *     rewardMode: "per_type"
 *   }
 *
 * Returns null when the review type is disabled (isActive === false).
 *
 * @param {Object} conditions - PointsRule.conditions JSON
 * @param {"TEXT"|"PHOTO"|"VIDEO"} reviewType
 * @returns {{ points: number, rewardMode: string, typeConfig: Object } | null}
 */
const resolveRewardConfig = (conditions, reviewType) => {
    const review = conditions?.review ?? {};

    // Loox uses "image" as the key for photo reviews
    const typeKeyMap = {
        [REVIEW_TYPE.VIDEO]: review.video,
        [REVIEW_TYPE.PHOTO]: review.image,
        [REVIEW_TYPE.TEXT]: review.text,
    };

    const typeConfig = typeKeyMap[reviewType] ?? {};

    // If this review type is disabled, skip — no points awarded
    if (typeConfig.isActive === false) return null;

    const points = Number(typeConfig.points) || 0;
    const rewardMode = review.rewardMode ?? REWARD_MODE.PER_TYPE;

    return { points, rewardMode, typeConfig };
};

/**
 * Builds and checks the idempotency event key based on reward mode.
 *
 * Key patterns:
 *   "once"      -> LOOX_REVIEW:email:productId
 *   "per_type"  -> LOOX_REVIEW:email:productId:reviewType
 *   "unlimited" -> LOOX_REVIEW:email:productId:reviewType:timestamp (always unique)
 *
 * @param {Object} params
 * @param {string} params.email
 * @param {string} params.productId
 * @param {string} params.reviewType
 * @param {string} params.rewardMode
 * @param {string} params.shop
 * @returns {Promise<{ isDuplicate: boolean, eventKey: string }>}
 */
const checkIdempotency = async ({ email, productId, reviewType, rewardMode, shop }) => {
    let eventKey;

    switch (rewardMode) {
        case REWARD_MODE.ONCE:
            eventKey = `LOOX_REVIEW:${email}:${productId}`;
            break;
        case REWARD_MODE.UNLIMITED:
            // Always unique -- isDuplicateEvent will never match
            eventKey = `LOOX_REVIEW:${email}:${productId}:${reviewType}:${Date.now()}`;
            break;
        case REWARD_MODE.PER_TYPE:
        default:
            eventKey = `LOOX_REVIEW:${email}:${productId}:${reviewType}`;
    }

    const isDuplicate = await isDuplicateEvent({ shop, eventKey });
    return { isDuplicate, eventKey };
};

/**
 * Builds a unique rewardKey for the reward record.
 *
 * rewardKey must be unique per reward. Since review rewards have no orderId
 * or referralId, createCustomerReward's auto-generated key would be identical
 * across multiple submissions of the same type -- causing false P2002 duplicates.
 *
 * Key strategy per rewardMode:
 *   "unlimited" -> includes timestamp -- always unique, every submission rewarded
 *   "per_type"  -> no timestamp -- same type on same product = same key (intentional cap)
 *   "once"      -> no type or timestamp -- any review on same product = same key (intentional cap)
 *
 * @param {number} customerId
 * @param {string} productId
 * @param {string} reviewType
 * @param {string} rewardMode
 * @returns {string}
 */
const buildRewardKey = (customerId, productId, reviewType, rewardMode) => {
    switch (rewardMode) {
        case REWARD_MODE.ONCE:
            return `REVIEW:DEFAULT:${customerId}:${productId}`;
        case REWARD_MODE.UNLIMITED:
            return `REVIEW:DEFAULT:${customerId}:${productId}:${reviewType}:${Date.now()}`;
        case REWARD_MODE.PER_TYPE:
        default:
            return `REVIEW:DEFAULT:${customerId}:${productId}:${reviewType}`;
    }
};

/**
 * Creates the points transaction and reward record in parallel.
 *
 * Supplies an explicit rewardKey to createCustomerReward so that the
 * P2002 duplicate behaviour aligns with the configured rewardMode rather
 * than the default auto-generated key (which would collide when no
 * orderId/referralId is present).
 *
 * @param {Object} params
 * @param {number} params.customerId
 * @param {string} params.sessionId
 * @param {number} params.eventId
 * @param {string} params.reviewType
 * @param {string} params.rewardMode
 * @param {number} params.points
 * @param {string} params.productId
 * @param {string} params.productTitle
 * @param {string} params.rating
 * @param {string} params.author
 * @param {string|null} params.orderId
 * @returns {Promise<void>}
 */
const issueReward = async ({
    customerId,
    sessionId,
    eventId,
    reviewType,
    rewardMode,
    points,
    productId,
    productTitle,
    rating,
    author,
    orderId,
}) => {
    const label = reviewType.charAt(0) + reviewType.slice(1).toLowerCase();
    const reason = `${label} review submitted for "${productTitle}"`;
    const activity = points > 0
        ? `+${Number(points).toLocaleString()} points for ${label.toLowerCase()} review on "${productTitle}"`
        : `${label} review submitted for "${productTitle}" -- no points for this review type`;

    const sharedMetadata = {
        reviewType,
        rewardMode,
        productId,
        productTitle,
        rating,
        orderId,
    };

    const rewardKey = buildRewardKey(customerId, productId, reviewType, rewardMode);

    await Promise.all([
        createTransaction(
            {
                customerId,
                type: "EARN",
                eventId,
                points,
                status: "COMPLETED",
                reason,
                activity,
                metadata: sharedMetadata,
            },
            { id: sessionId }
        ),
        createCustomerReward({
            customerId,
            event: "REVIEW",
            type: "DEFAULT",
            status: "COMPLETED",
            title: `${label} review reward`,
            description: points > 0
                ? `You earned ${Number(points).toLocaleString()} points for submitting a ${label.toLowerCase()} review on "${productTitle}".`
                : `Thank you for your ${label.toLowerCase()} review on "${productTitle}".`,
            rewardKey,
            metadata: { ...sharedMetadata, author },
        }),
    ]);
};

// ============================================================
// RESPONSE HELPER
// ============================================================

const jsonResponse = (data, status, headers) =>
    new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
    });

// ============================================================
// ACTION -- POST
// ============================================================

/**
 * POST /api/loox-new-review-trigger/:token
 *
 * Called by the "Loox new review trigger" Shopify Flow workflow (its "New
 * review" trigger + "Send HTTP request" action) — not directly by Loox.
 * `:token` is the per-shop secret from app/loox-setup (see
 * resolveShopFromToken above); an unresolvable token is rejected with 401
 * before the body is even parsed.
 *
 * Once authenticated, always returns 200 for a well-formed request so Flow
 * sees a clean success — all review processing runs in the background
 * after the response is sent.
 *
 * Flow request body shape (see the workflow's "Send HTTP request" body):
 * {
 *   author, email, rating, review_body, review_date,
 *   product_title, product_id, product_url, photo_url, order_id
 * }
 */
export const action = async ({ request, params }) => {
    const corsHeaders = getCorsHeaders(request);

    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
    }

    // Reject before touching the body — an unauthenticated caller should
    // never reach JSON parsing or the review-processing pipeline. Unlike
    // the "always 200" policy below (which exists to stop a real webhook
    // provider from retry-storming us), this is a 401: the caller here is
    // our own Shopify Flow workflow, and a real auth failure should show
    // up as a failed step in Flow's run history, not look like success.
    const shopContext = await resolveShopFromToken(params.token);
    if (!shopContext) {
        logger.warn(MODULE, "Rejected request with missing/invalid Flow token", { token: params.token });
        return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
    }

    let data;
    try {
        data = await request.json();
    } catch (error) {
        logger.error(MODULE, "Failed to parse request body", { error: error?.message, shop: shopContext.shop });
        return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // Fire and forget -- Flow requires a fast response
    handleLooxReview(data, shopContext).catch((err) =>
        logger.error(MODULE, "Background review handler failed", {
            shop: shopContext.shop,
            error: err?.message,
            stack: err?.stack,
        })
    );

    return new Response("OK", { status: 200, headers: corsHeaders });
};

// ============================================================
// LOADER -- GET (Health Check)
// ============================================================

export const loader = async ({ request }) => {
    const corsHeaders = getCorsHeaders(request);

    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    return jsonResponse(
        { status: "ok", timestamp: new Date().toISOString() },
        200,
        corsHeaders
    );
};

// ============================================================
// ORCHESTRATOR
// ============================================================

/**
 * Orchestrates the full review reward flow for a single Loox submission.
 *
 * Each step is delegated to a dedicated feature method.
 * The orchestrator only handles control flow and logging.
 *
 * Steps:
 *   1. validateReview        -- required fields
 *   2. detectReviewType      -- TEXT / PHOTO / VIDEO from photo_url
 *   3. loadCustomer          -- resolve customer, scoped to shopContext.sessionId
 *   4. getPointRuleByEvent   -- REVIEW rule, scoped to shopContext.sessionId
 *   5. resolveRewardConfig   -- points + rewardMode from rule conditions
 *   6. checkIdempotency      -- build key + duplicate check
 *   7. issueReward           -- transaction + reward record in parallel
 *   8. syncCustomerConfig    -- push updated balance to Shopify metafields
 *
 * @param {Object} reviewData            - Raw Flow request body
 * @param {Object} shopContext           - Resolved from the request's token
 * @param {string} shopContext.sessionId
 * @param {string} shopContext.shop
 */
const handleLooxReview = async (reviewData, shopContext) => {
    const { email, author, rating, product_title, product_id, photo_url, order_id } = reviewData;
    const { sessionId, shop } = shopContext;

    // 1. Validate
    if (!validateReview(email, product_id)) return;

    // 2. Detect review type
    const reviewType = await detectReviewType(photo_url);

    // 3. Load customer + REVIEW rule in parallel, both scoped to the shop
    // resolved from the request's token.
    const [customer, rule] = await Promise.all([
        loadCustomer(email, sessionId),
        getPointRuleByEvent("REVIEW", sessionId),
    ]);

    if (!customer) {
        logger.warn(MODULE, "Customer not found, skipping", { shop, email });
        return;
    }
    if (!rule) {
        logger.warn(MODULE, "REVIEW rule not found, skipping", { shop, customerId: customer.id });
        return;
    }
    if (!rule.isActive) {
        logger.warn(MODULE, "REVIEW rule is inactive, skipping", { shop, customerId: customer.id });
        return;
    }

    // 4. Resolve reward config — returns null if review type is disabled
    const rewardConfig = resolveRewardConfig(rule.conditions, reviewType);

    if (!rewardConfig) {
        logger.info(MODULE, `${reviewType} review type is disabled, skipping`, { shop, email });
        return;
    }

    const { points, rewardMode, typeConfig } = rewardConfig;

    logger.info(MODULE, "Review resolved", { shop, reviewType, rewardMode, points, email, product_title });

    // 5. Idempotency check
    const { isDuplicate, eventKey } = await checkIdempotency({
        email,
        productId: product_id,
        reviewType,
        rewardMode,
        shop,
    });

    if (isDuplicate) {
        logger.warn(MODULE, "Duplicate review event skipped", { shop, eventKey, rewardMode });
        return;
    }

    // 6. Issue reward
    const { admin } = await unauthenticated.admin(shop);

    await issueReward({
        customerId: customer.id,
        sessionId,
        eventId: rule.event.id,
        reviewType,
        rewardMode,
        points,
        productId: product_id,
        productTitle: product_title,
        rating,
        author,
        orderId: order_id || null,
    });

    // 7. Sync metafields
    await syncCustomerConfig(admin, customer.shopifyId);

    logger.success(MODULE, "Loox review handled", {
        shop,
        email,
        customerId: customer.id,
        reviewType,
        rewardMode,
        points,
        product_title,
    });
};
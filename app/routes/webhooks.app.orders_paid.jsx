import prisma from "app/db.server";
import { authenticate } from "../shopify.server";
import { logger } from "app/utils/logger.js";
import { getPointRuleByEvent } from "app/controller/pointsRule/getPointRuleByEvent";
import createTransaction from "app/controller/transaction/createTransaction";
import { getAppstleMetafield } from "app/graphql/mutation/order/getAppstleMetafield";
import { isDuplicateEvent } from "app/controller/webhook/handleDuplicateWebhook";
import { createCustomerReward } from "app/controller/customerReward/createCustomerReward";
import { syncCustomerConfig } from "app/controller/metafieldsSync/syncCustomerConfig";
import { getCustomerRewardByCode } from "app/controller/customerReward/getCustomerReward";
import { updateCustomerReward } from "app/controller/customerReward/updateCustomerReward";

const ENABLE_IDEMPOTENCY = true;

/**
 * Delay before processing the order in the background.
 * Gives Shopify time to fully commit the order before we query it.
 *
 * NOTE: setTimeout is not reliable in serverless environments (Vercel, Cloudflare Workers).
 * For production, replace with a proper job queue (e.g. BullMQ, Inngest, Trigger.dev)
 * or a WebhookJob DB table polled by a cron.
 */
const BACKGROUND_PROCESS_DELAY_MS = 20 * 1000;

// ============================================================
// HELPERS
// ============================================================

/**
 * Returns a short human-readable order label e.g. "#1234".
 * Falls back gracefully if order_number or name is unavailable.
 *
 * @param {Object} order - Shopify order payload
 * @returns {string}
 */
const getOrderLabel = (order) => {
    if (order?.name) return order.name;
    if (order?.order_number) return `#${order.order_number}`;
    const gid = order?.admin_graphql_api_id || "";
    return gid ? `#${gid.split("/").pop()}` : "your order";
};

/**
 * Calculates the eligible order total based on points rule conditions.
 * Handles three modes:
 *   - allProducts:      full total minus excluded products (respects quantity)
 *   - specificProducts: sum of only matched products (respects quantity)
 *   - default:          full order total as-is
 *
 * @param {Object} order      - Shopify order payload
 * @param {Object} conditions - PointsRule conditions object
 * @returns {number} Eligible order total in store currency
 */
const getEligibleOrderTotal = (order, conditions) => {
    const items = order?.line_items || [];
    const appliesToType = conditions?.appliesTo?.type;

    if (appliesToType === "allProducts") {
        const excluded = new Set(conditions?.excludedProducts?.products || []);
        return items.reduce((total, item) => {
            return excluded.has(item.product_id?.toString())
                ? total - Number(item.price) * (item.quantity || 1)
                : total;
        }, Number(order?.total_price) || 0);
    }

    if (appliesToType === "specificProducts") {
        const specific = new Set(conditions?.appliesTo?.products || []);
        return items.reduce((sum, item) => {
            return specific.has(item.product_id?.toString())
                ? sum + Number(item.price) * (item.quantity || 1)
                : sum;
        }, 0);
    }

    return Number(order?.total_price) || 0;
};

/**
 * Calculates points to award based on earning type.
 *   - incremental: floor(total / rate.amount) * rate.points
 *   - fixed:       flat points regardless of order value
 *
 * @param {number} orderTotal - Eligible order total
 * @param {Object} conditions - PointsRule conditions object
 * @returns {number} Points to award (may be 0)
 */
const calculatePoints = (orderTotal, conditions) => {
    if (conditions?.earning?.type === "incremental") {
        const rate = conditions?.earning?.rate;
        if (rate?.amount > 0) {
            return Math.floor(orderTotal / rate.amount) * rate.points;
        }
        return 0;
    }
    return Number(conditions?.earning?.fixedPoints) || 0;
};

// ============================================================
// WEBHOOK ENTRY
// ============================================================

/**
 * Shopify orders/paid webhook handler.
 *
 * Returns 200 immediately to prevent Shopify retries,
 * then processes the order in the background via setTimeout.
 *
 * Idempotency is enforced via X-Shopify-Webhook-Id header
 * to safely handle Shopify's at-least-once delivery guarantee.
 */
export const action = async ({ request }) => {
    try {
        const { payload, session, topic, shop, admin } = await authenticate.webhook(request);
        const order = payload;

        // Prefer Shopify's webhook ID for idempotency; fall back to topic + order GID
        // topic prefix avoids GID collision across different webhook topics
        const webhookId = request.headers.get("X-Shopify-Webhook-Id");
        const eventKey = webhookId
            ? `SHOPIFY:${webhookId}`
            : `${topic}:${order.admin_graphql_api_id}`;

        if (ENABLE_IDEMPOTENCY) {
            const isDuplicate = await isDuplicateEvent({ shop, eventKey });
            if (isDuplicate) {
                logger.warn(shop, "Duplicate webhook skipped", { eventKey });
                return new Response("OK", { status: 200 });
            }
        }

        logger.info(shop, "Webhook received", { topic, orderId: order?.admin_graphql_api_id });

        setTimeout(() => {
            mainHandler({ admin, session, order, shop }).catch((err) => {
                logger.error(shop, "Background handler failed", err);
            });
        }, BACKGROUND_PROCESS_DELAY_MS);

        return new Response("OK", { status: 200 });
    } catch (error) {
        logger.error("Webhook entry error", error);
        return new Response("OK", { status: 200 });
    }
};

// ============================================================
// MAIN HANDLER
// ============================================================

/**
 * Orchestrates order processing after the background delay.
 * Determines whether the order is a referral order or a normal order
 * and delegates to the appropriate handler.
 *
 * @param {Object} params
 * @param {Object} params.admin   - Shopify Admin GraphQL client
 * @param {Object} params.session - Shopify session
 * @param {Object} params.order   - Shopify order payload
 * @param {string} params.shop    - Shop domain
 */
const mainHandler = async ({ admin, session, order, shop }) => {
    try {
        const customerGid = order?.customer?.admin_graphql_api_id;
        if (!customerGid) {
            logger.warn(shop, "No customer GID in order payload, skipping");
            return;
        }

        // Fetch customer + Appstle metafield in parallel — independent reads
        const [customer, appstle] = await Promise.all([
            prisma.customer.findFirst({
                where: { shopifyId: customerGid },
                include: { referralsUsed: true },
            }),
            getAppstleMetafield(admin, order.admin_graphql_api_id),
        ]);

        if (!customer) {
            logger.warn(shop, "Customer not found in DB, skipping", { customerGid });
            return;
        }

        const contract = appstle?.subscriptionContract || null;
        const referralContext = detectReferralOrder({ order, customer, contract });
        logger.info(shop, "Referral context", { ...referralContext });

        if (!referralContext.isReferralOrder) {
            await handleNormalOrder({ admin, order, customer, session, shop });
        } else {
            await handleReferral({ admin, referralContext, order, contract, session, shop });
        }

        // Always run — referral orders may also have separate reward vouchers applied
        await voucherUpdateIfAvailable({ admin, order, customer, shop, session });
    } catch (error) {
        logger.error(shop, "Main handler error", error);
    }
};

// ============================================================
// REFERRAL DETECTION
// ============================================================

/**
 * Determines whether an order qualifies as a referral order.
 *
 * Two referral types are detected:
 *   - FIRST:     Order contains the referral discount code (first purchase)
 *   - RECURRING: Order is tied to a subscription contract previously linked to a referral
 *
 * @param {Object} params
 * @param {Object} params.order    - Shopify order payload
 * @param {Object} params.customer - DB customer record (with referralsUsed)
 * @param {Object|null} params.contract - Appstle subscription contract (if any)
 * @returns {{ isReferralOrder: boolean, type?: "FIRST"|"RECURRING", referral?: Object }}
 */
const detectReferralOrder = ({ order, customer, contract }) => {
    const referral = customer?.referralsUsed;
    if (!referral) return { isReferralOrder: false };

    const discountMatch = order?.discount_codes?.find(
        (d) => d.code === referral.discountCode
    );
    if (discountMatch) return { isReferralOrder: true, type: "FIRST", referral };

    if (
        contract?.id &&
        referral.subscriptionContractId === contract.id?.toString() &&
        contract.currentCycle > 1
    ) {
        return { isReferralOrder: true, type: "RECURRING", referral };
    }

    return { isReferralOrder: false };
};

// ============================================================
// REFERRAL HANDLER
// ============================================================

/**
 * Handles points and reward creation for referral orders.
 * Supports two referral types: FIRST and RECURRING.
 *
 * FIRST:     Referrer + referred earn points. Reward voucher marked as USED.
 * RECURRING: Referrer and/or referred earn points based on rule conditions.
 *            Duplicate guard prevents double-awarding on webhook retry.
 *
 * @param {Object} params
 * @param {Object} params.admin           - Shopify Admin GraphQL client
 * @param {Object} params.referralContext - Output of detectReferralOrder()
 * @param {Object} params.order           - Shopify order payload
 * @param {Object|null} params.contract   - Appstle subscription contract
 * @param {Object} params.session         - Shopify session
 * @param {string} params.shop            - Shop domain
 */
const handleReferral = async ({ admin, referralContext, order, contract, session, shop }) => {
    const rule = await getPointRuleByEvent("REFERRAL");
    if (!rule?.isActive) {
        logger.warn(shop, "REFERRAL rule inactive, skipping");
        return;
    }

    const conditions = rule.conditions?.referral;
    const { type, referral } = referralContext;
    const orderLabel = getOrderLabel(order);

    // ── FIRST referral order ──────────────────────────────────────────────────
    if (type === "FIRST") {
        if (referral.discountUsed) {
            logger.warn(shop, "Referral discount already used, skipping", { referralId: referral.id });
            return;
        }

        const referrerPoints = conditions?.referrer?.firstOrderPoints || 0;
        const referredPoints = conditions?.referred?.firstOrderPoints || 0;

        // Mark referral + create both transactions in parallel — independent writes
        await Promise.all([
            prisma.referral.update({
                where: { id: referral.id },
                data: {
                    status: "USED",
                    discountUsed: true,
                    orderId: order.admin_graphql_api_id,
                    subscriptionContractId: contract?.id?.toString() ?? null,
                    metadata: contract ?? {},
                },
            }),
            // Referrer — earns points for a successful referral
            createTransaction(
                {
                    customerId: referral.referrerId,
                    type: "EARN",
                    eventId: rule.event.id,
                    referralId: referral.id,
                    reason: `Referral reward — your friend placed their first order (${orderLabel})`,
                    activity: `+${referrerPoints} points for successful referral`,
                    points: referrerPoints,
                    status: "COMPLETED",
                },
                session
            ),
            // Referred — records discount usage; earns points if rule awards any
            createTransaction(
                {
                    customerId: referral.referredId,
                    type: "EARN",
                    eventId: rule.event.id,
                    referralId: referral.id,
                    reason: `Referral discount used on order ${orderLabel}`,
                    activity: referredPoints > 0
                        ? `+${referredPoints} points — referral discount applied on order ${orderLabel}`
                        : `Referral discount code applied on order ${orderLabel}`,
                    points: referredPoints,
                    status: "COMPLETED",
                },
                session
            ),
        ]);

        // Mark referred customer's reward voucher as used
        const existingReward = await getCustomerRewardByCode(
            referral.discountCode,
            { id: true, status: true }
        );
        if (existingReward) {
            await updateCustomerReward(existingReward.id, {
                status: "USED",
                discountUsed: true,
                usedAt: new Date(),
                orderId: order.admin_graphql_api_id,
            });
        }

        // Sync both customers in parallel
        await Promise.all([
            syncCustomerConfig(admin, referral.referrerId),
            syncCustomerConfig(admin, referral.referredId),
        ]);

        logger.success(shop, "Referral FIRST order handled", {
            referralId: referral.id,
            referrerPoints,
            referredPoints,
            orderLabel,
        });
    }

    // ── RECURRING referral (subscription renewal) ─────────────────────────────
    if (type === "RECURRING") {
        // Duplicate guard — Shopify at-least-once delivery can fire this twice,
        // causing both referrer and referred to receive double points
        const alreadyRewarded = await prisma.reward.findFirst({
            where: {
                referralId: referral.id,
                orderId: order.admin_graphql_api_id,
                type: "RECURRING",
            },
            select: { id: true },
        });

        if (alreadyRewarded) {
            logger.warn(shop, "RECURRING reward already issued for this order, skipping", {
                referralId: referral.id,
                orderId: order.admin_graphql_api_id,
            });
            return;
        }

        // Build reward tasks based on rule conditions — only enabled parties included
        const rewardTasks = [];

        if (conditions?.referrer?.allowRenewalReward) {
            const renewalPoints = conditions?.referrer?.renewalPoints || 0;
            rewardTasks.push(
                createTransaction(
                    {
                        customerId: referral.referrerId,
                        type: "EARN",
                        eventId: rule.event.id,
                        referralId: referral.id,
                        reason: `Subscription renewal reward — referred customer renewed their subscription (${orderLabel})`,
                        activity: `+${renewalPoints} points for referral renewal`,
                        points: renewalPoints,
                        status: "COMPLETED",
                    },
                    session
                ),
                createCustomerReward({
                    customerId: referral.referrerId,
                    event: "REFERRAL",
                    type: "RECURRING",
                    title: "Referral renewal reward",
                    description: `Your referred customer renewed their subscription. You earned ${renewalPoints} points.`,
                    orderId: order.admin_graphql_api_id,
                    referralId: referral.id,
                    status: "COMPLETED",
                })
            );
        }

        if (conditions?.referred?.allowRenewalReward) {
            const referredRenewalPoints = conditions?.referred?.renewalPoints || 0;
            rewardTasks.push(
                createTransaction(
                    {
                        customerId: referral.referredId,
                        type: "EARN",
                        eventId: rule.event.id,
                        referralId: referral.id,
                        reason: `Subscription renewal reward — earned for renewing your subscription (${orderLabel})`,
                        activity: `+${referredRenewalPoints} points for subscription renewal`,
                        points: referredRenewalPoints,
                        status: "COMPLETED",
                    },
                    session
                ),
                createCustomerReward({
                    customerId: referral.referredId,
                    event: "REFERRAL",
                    type: "RECURRING",
                    title: "Subscription renewal reward",
                    description: `You earned ${referredRenewalPoints} points for renewing your subscription.`,
                    orderId: order.admin_graphql_api_id,
                    referralId: referral.id,
                    status: "COMPLETED",
                })
            );
        }

        // All reward tasks + referral metadata update in parallel
        await Promise.all([
            ...rewardTasks,
            prisma.referral.update({
                where: { id: referral.id },
                data: { metadata: contract ?? {} },
            }),
        ]);

        // Sync both customers in parallel
        await Promise.all([
            syncCustomerConfig(admin, referral.referrerId),
            syncCustomerConfig(admin, referral.referredId),
        ]);

        logger.success(shop, "Referral RECURRING order handled", {
            referralId: referral.id,
            orderLabel,
        });
    }
};

// ============================================================
// NORMAL ORDER HANDLER
// ============================================================

/**
 * Handles points earning for standard (non-referral) orders.
 *
 * Supports two earning modes:
 *   - incremental: points per currency unit spent (e.g. 1pt per $1)
 *   - fixed:       flat points per order
 *
 * Product filtering (allProducts / specificProducts) is applied
 * before points calculation via getEligibleOrderTotal().
 *
 * @param {Object} params
 * @param {Object} params.admin    - Shopify Admin GraphQL client
 * @param {Object} params.order    - Shopify order payload
 * @param {Object} params.customer - DB customer record
 * @param {Object} params.session  - Shopify session
 * @param {string} params.shop     - Shop domain
 */
const handleNormalOrder = async ({ admin, order, customer, session, shop }) => {
    const rule = await getPointRuleByEvent("CREATE ORDER");
    if (!rule?.isActive) {
        logger.warn(shop, "CREATE ORDER rule inactive, skipping");
        return;
    }

    const conditions = rule.conditions;
    const orderLabel = getOrderLabel(order);
    const orderTotal = getEligibleOrderTotal(order, conditions);
    const points = calculatePoints(orderTotal, conditions);

    logger.info(shop, "Order points calculated", { points, orderTotal, orderLabel });

    await createTransaction(
        {
            customerId: customer.id,
            type: "EARN",
            eventId: rule.event.id,
            pointsRuleId: rule.id,
            reason: `Points earned for order ${orderLabel}`,
            activity: `+${points} points for order ${orderLabel}`,
            points,
            status: "COMPLETED",
        },
        session
    );

    await syncCustomerConfig(admin, customer.shopifyId);

    logger.success(shop, "Normal order handled", {
        points,
        orderLabel,
        customerId: customer.id,
    });
};

// ============================================================
// VOUCHER UPDATE
// ============================================================

/**
 * Marks any reward vouchers as USED if their discount code
 * was applied on the current order.
 *
 * Runs after both normal and referral order handling.
 * Each matched reward is updated via updateCustomerReward() for consistency.
 * A REDEEM transaction with points: 0 is created per voucher so the customer
 * can see the voucher use in their activity history.
 *
 * Note: points: 0 because points were spent at reward creation time,
 * not at redemption — this entry is for the activity log only.
 *
 * @param {Object} params
 * @param {Object} params.admin    - Shopify Admin GraphQL client
 * @param {Object} params.order    - Shopify order payload
 * @param {Object} params.customer - DB customer record
 * @param {string} params.shop     - Shop domain
 * @param {Object} params.session  - Shopify session
 */
const voucherUpdateIfAvailable = async ({ admin, order, customer, shop, session }) => {
    try {
        if (!order || !customer?.id) return;

        const orderDiscountCodes = order?.discount_codes || [];
        if (!orderDiscountCodes.length) return;

        const discountCodeSet = new Set(
            orderDiscountCodes.map((d) => d?.code).filter(Boolean)
        );
        if (!discountCodeSet.size) return;

        // Pre-filter matched rewards in DB — avoids JS-side filtering on large reward sets
        const rewards = await prisma.reward.findMany({
            where: {
                customerId: customer.id,
                code: { in: [...discountCodeSet] },
                status: { notIn: ["USED", "EXPIRED", "CANCELLED", "REDEEMED"] },
            },
            select: { id: true, code: true, title: true },
        });

        if (!rewards.length) return;

        const orderLabel = getOrderLabel(order);

        // Per-voucher: update + activity transaction in parallel — independent writes
        await Promise.all(
            rewards.map((reward) =>
                Promise.all([
                    updateCustomerReward(reward.id, {
                        status: "USED",
                        discountUsed: true,
                        usedAt: new Date(),
                        orderId: order.admin_graphql_api_id,
                    }),
                    createTransaction(
                        {
                            customerId: customer.id,
                            type: "REDEEM",
                            points: 0,
                            rewardId: reward.id,
                            status: "COMPLETED",
                            reason: `Reward voucher used on order ${orderLabel}`,
                            activity: `Reward "${reward.title || reward.code}" applied on order ${orderLabel}`,
                        },
                        session
                    ),
                ])
            )
        );

        await syncCustomerConfig(admin, customer.shopifyId);

        logger.success(shop, "Voucher rewards marked as used", {
            customerId: customer.id,
            matchedRewardIds: rewards.map((r) => r.id),
            matchedCount: rewards.length,
        });
    } catch (error) {
        logger.error(shop, "Voucher update error", error, { customerId: customer?.id });
    }
};
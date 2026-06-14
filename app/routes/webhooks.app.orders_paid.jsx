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
 * Fetches customer + Appstle metafield (with resolved interval) in parallel,
 * then delegates to referral or normal order handler.
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

        // Fetch customer + Appstle metafield (interval included) in parallel
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

        // Destructure resolved appstle shape
        // { subscriptionContract, subscriptionInterval, isSubscription }
        const { subscriptionContract, subscriptionInterval, isSubscription } = appstle;

        const referralContext = detectReferralOrder({ order, customer, contract: subscriptionContract });
        logger.info(shop, "Referral context", { ...referralContext, subscriptionInterval, isSubscription });

        if (!referralContext.isReferralOrder) {
            await handleNormalOrder({ admin, order, customer, session, shop, subscriptionInterval, isSubscription });
        } else {
            await handleReferral({ admin, referralContext, order, subscriptionContract, subscriptionInterval, isSubscription, session, shop });
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
 * Two referral types:
 *   FIRST:     Order contains the referral discount code (first purchase)
 *   RECURRING: Order is tied to a subscription contract previously linked to a referral
 *
 * @param {Object} params
 * @param {Object} params.order    - Shopify order payload
 * @param {Object} params.customer - DB customer record (with referralsUsed)
 * @param {Object|null} params.contract - Appstle subscription contract
 * @returns {{ isReferralOrder: boolean, type?: "FIRST"|"RECURRING", referral?: Object }}
 */
const detectReferralOrder = ({ order, customer, contract }) => {
    const referral = customer?.referralsUsed;
    if (!referral) return { isReferralOrder: false };

    const discountMatch = order?.discount_codes?.find((d) => d.code === referral.discountCode);
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
// ORDER POINTS RESOLVER
// ============================================================

/**
 * Resolves points for a single line item based on the P1→P4 priority chain.
 *
 * Priority:
 *   P4 (highest) — product is in a group AND interval matches
 *   P3           — product is in a group, no interval match
 *   P2           — product not in any group, interval matches
 *   P1 (lowest)  — global fallback
 *
 * @param {Object} item               - Shopify line_item
 * @param {Object} ord                - conditions.order object
 * @param {string|null} interval      - Resolved subscription interval e.g. "monthly"
 * @returns {number} Points for this line item
 */
const resolveLineItemPoints = (item, ord, interval) => {
    // line_item.product_id is always a numeric Shopify product ID
    // We normalize it to GID format to match conditions.order.groups[].products[].id
    if (!item?.product_id) return 0;
    const productGid = `gid://shopify/Product/${item.product_id}`;
    const itemTotal = Number(item.price) * (item.quantity || 1);

    // Excluded products — never earn points regardless of any rule
    const isExcluded = (ord.excludedProducts ?? []).some((p) => p.id === productGid);
    if (isExcluded) return 0;

    // Find which group this product belongs to (if any)
    const group = (ord.groups ?? []).find((g) =>
        g.products.some((p) => p.id === productGid)
    );

    if (group) {
        // P4 — group + interval match
        if (interval) {
            const iv = (group.intervals ?? []).find((i) => i.interval === interval);
            if (iv) return calcPoints(ord.type, iv, itemTotal);
        }
        // P3 — group only
        return calcPoints(ord.type, group, itemTotal);
    }

    // P2 — global interval match (no group)
    if (interval) {
        const iv = (ord.intervals ?? []).find((i) => i.interval === interval);
        if (iv) return calcPoints(ord.type, iv, itemTotal);
    }

    // P1 — global fallback
    return calcPoints(ord.type, ord, itemTotal);
};

/**
 * Calculates points from a rule object based on earning type.
 *
 * @param {"fixed"|"incremental"} type
 * @param {Object} rule       - Object with fixedPoints or rate.{amount, points}
 * @param {number} itemTotal  - Line item total (price × quantity)
 * @returns {number}
 */
const calcPoints = (type, rule, itemTotal) => {
    if (type === "incremental") {
        const { amount, points } = rule.rate ?? {};
        if (amount > 0) return Math.floor(itemTotal / amount) * points;
        return 0;
    }
    return Number(rule.fixedPoints) || 0;
};

/**
 * Resolves total points for an order by summing per-line-item points.
 * Respects trigger (oneTime / subscription / both) before calculating.
 *
 * @param {Object} order          - Shopify order payload
 * @param {Object} conditions     - Full pointsRule conditions object
 * @param {string|null} interval  - Resolved subscription interval
 * @param {boolean} isSubscription
 * @returns {number} Total points to award
 */
const resolveOrderPoints = (order, conditions, interval, isSubscription) => {
    const ord = conditions?.order;
    if (!ord) {
        logger.warn("resolveOrderPoints: conditions.order is missing");
        return 0;
    }

    // Trigger check
    if (ord.trigger === "oneTime" && isSubscription) return 0;
    if (ord.trigger === "subscription" && !isSubscription) return 0;

    const items = order?.line_items ?? [];
    if (!items.length) return 0;

    return items.reduce((total, item) => total + resolveLineItemPoints(item, ord, interval), 0);
};

// ============================================================
// REFERRAL POINTS RESOLVER
// ============================================================

/**
 * Resolves referrer + referred points based on the P1→P4 priority chain.
 * Uses the first matched product from the order line items for group lookup.
 *
 * For RECURRING (renewal):
 *   - Uses renewalPoints instead of points
 *   - Respects allowRenewalReward at group or global level
 *
 * @param {Object} conditions     - Full pointsRule conditions object
 * @param {Array}  lineItems      - Shopify order line_items
 * @param {string|null} interval  - Resolved subscription interval
 * @param {boolean} isRenewal     - true for RECURRING, false for FIRST
 * @returns {{ referrerPoints: number, referredPoints: number }}
 */
const resolveReferralPoints = (conditions, lineItems, interval, isRenewal) => {
    const ref = conditions?.referral;
    if (!ref) {
        logger.warn("resolveReferralPoints: conditions.referral is missing");
        return { referrerPoints: 0, referredPoints: 0 };
    }

    // Find the first line item that matches a group
    let resolved = null;

    for (const item of lineItems ?? []) {
        const productGid = `gid://shopify/Product/${item.product_id}`;
        const group = (ref.groups ?? []).find((g) =>
            g.products.some((p) => p.id === productGid)
        );

        if (group) {
            // P4 — group + interval match
            if (interval) {
                const iv = (group.intervals ?? []).find((i) => i.interval === interval);
                if (iv) {
                    resolved = {
                        referrerPoints: isRenewal ? iv.referrer.renewalPoints : iv.referrer.points,
                        referredPoints: isRenewal ? iv.referred.renewalPoints : iv.referred.points,
                        referrerAllowRenewal: group.referrer.allowRenewalReward,
                        referredAllowRenewal: group.referred.allowRenewalReward,
                    };
                    break;
                }
            }
            // P3 — group only
            resolved = {
                referrerPoints: isRenewal ? group.referrer.renewalPoints : group.referrer.points,
                referredPoints: isRenewal ? group.referred.renewalPoints : group.referred.points,
                referrerAllowRenewal: group.referrer.allowRenewalReward,
                referredAllowRenewal: group.referred.allowRenewalReward,
            };
            break;
        }
    }

    if (!resolved) {
        // P2 — global interval match (no group matched)
        if (interval) {
            const iv = (ref.intervals ?? []).find((i) => i.interval === interval);
            if (iv) {
                resolved = {
                    referrerPoints: isRenewal ? iv.referrer.renewalPoints : iv.referrer.points,
                    referredPoints: isRenewal ? iv.referred.renewalPoints : iv.referred.points,
                    referrerAllowRenewal: ref.referrer.allowRenewalReward,
                    referredAllowRenewal: ref.referred.allowRenewalReward,
                };
            }
        }
    }

    if (!resolved) {
        // P1 — global fallback
        resolved = {
            referrerPoints: isRenewal ? ref.referrer.renewalPoints : ref.referrer.points,
            referredPoints: isRenewal ? ref.referred.renewalPoints : ref.referred.points,
            referrerAllowRenewal: ref.referrer.allowRenewalReward,
            referredAllowRenewal: ref.referred.allowRenewalReward,
        };
    }

    // For renewal — gate points behind allowRenewalReward
    if (isRenewal) {
        return {
            referrerPoints: resolved.referrerAllowRenewal ? (resolved.referrerPoints ?? 0) : 0,
            referredPoints: resolved.referredAllowRenewal ? (resolved.referredPoints ?? 0) : 0,
        };
    }

    return {
        referrerPoints: resolved.referrerPoints ?? 0,
        referredPoints: resolved.referredPoints ?? 0,
    };
};

// ============================================================
// NORMAL ORDER HANDLER
// ============================================================

/**
 * Handles points earning for standard (non-referral) orders.
 * Uses per-product P1→P4 priority resolution.
 *
 * @param {Object} params
 * @param {Object} params.admin          - Shopify Admin GraphQL client
 * @param {Object} params.order          - Shopify order payload
 * @param {Object} params.customer       - DB customer record
 * @param {Object} params.session        - Shopify session
 * @param {string} params.shop           - Shop domain
 * @param {string|null} params.subscriptionInterval
 * @param {boolean} params.isSubscription
 */
const handleNormalOrder = async ({ admin, order, customer, session, shop, subscriptionInterval, isSubscription }) => {
    const rule = await getPointRuleByEvent("ORDER");
    if (!rule?.isActive) {
        logger.warn(shop, "ORDER rule inactive, skipping");
        return;
    }

    const orderLabel = getOrderLabel(order);
    const points = resolveOrderPoints(order, rule.conditions, subscriptionInterval, isSubscription);

    if (points <= 0) {
        logger.info(shop, "Order earned 0 points (trigger mismatch or all excluded), skipping transaction", {
            orderLabel,
            subscriptionInterval,
            isSubscription,
        });
        return;
    }

    logger.info(shop, "Order points resolved", { points, orderLabel, subscriptionInterval });

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

    logger.success(shop, "Normal order handled", { points, orderLabel, customerId: customer.id });
};

// ============================================================
// REFERRAL HANDLER
// ============================================================

/**
 * Handles points and reward creation for referral orders.
 * Supports FIRST and RECURRING types with full P1→P4 priority resolution.
 *
 * @param {Object} params
 * @param {Object} params.admin                - Shopify Admin GraphQL client
 * @param {Object} params.referralContext      - Output of detectReferralOrder()
 * @param {Object} params.order                - Shopify order payload
 * @param {Object|null} params.subscriptionContract
 * @param {string|null} params.subscriptionInterval
 * @param {boolean} params.isSubscription
 * @param {Object} params.session              - Shopify session
 * @param {string} params.shop                 - Shop domain
 */
const handleReferral = async ({
    admin,
    referralContext,
    order,
    subscriptionContract,
    subscriptionInterval,
    isSubscription,
    session,
    shop,
}) => {
    const rule = await getPointRuleByEvent("REFERRAL");
    if (!rule?.isActive) {
        logger.warn(shop, "REFERRAL rule inactive, skipping");
        return;
    }

    const conditions = rule.conditions;
    const refConditions = conditions.referral;
    const { type, referral } = referralContext;
    const orderLabel = getOrderLabel(order);
    const lineItems = order?.line_items ?? [];

    // ── Trigger check ─────────────────────────────────────────────────────────
    const trigger = refConditions.trigger;
    if (trigger === "oneTime" && isSubscription) {
        logger.info(shop, "REFERRAL trigger=oneTime but order is subscription, skipping", { type });
        return;
    }
    if (trigger === "subscription" && !isSubscription) {
        logger.info(shop, "REFERRAL trigger=subscription but order is one-time, skipping", { type });
        return;
    }

    // ── FIRST referral order ──────────────────────────────────────────────────
    if (type === "FIRST") {
        if (referral.discountUsed) {
            logger.warn(shop, "Referral discount already used, skipping", { referralId: referral.id });
            return;
        }

        const { referrerPoints, referredPoints } = resolveReferralPoints(
            conditions, lineItems, subscriptionInterval, false
        );

        // Mark referral + create both transactions in parallel
        await Promise.all([
            prisma.referral.update({
                where: { id: referral.id },
                data: {
                    status: "USED",
                    discountUsed: true,
                    orderId: order.admin_graphql_api_id,
                    subscriptionContractId: subscriptionContract?.id?.toString() ?? null,
                    metadata: subscriptionContract ?? {},
                },
            }),
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
        return;
    }

    // ── RECURRING referral (subscription renewal) ─────────────────────────────
    if (type === "RECURRING") {
        // Duplicate guard — Shopify at-least-once delivery can fire this twice
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

        const { referrerPoints, referredPoints } = resolveReferralPoints(
            conditions, lineItems, subscriptionInterval, true
        );

        const rewardTasks = [];

        if (referrerPoints > 0) {
            rewardTasks.push(
                createTransaction(
                    {
                        customerId: referral.referrerId,
                        type: "EARN",
                        eventId: rule.event.id,
                        referralId: referral.id,
                        reason: `Subscription renewal reward — referred customer renewed their subscription (${orderLabel})`,
                        activity: `+${referrerPoints} points for referral renewal`,
                        points: referrerPoints,
                        status: "COMPLETED",
                    },
                    session
                ),
                createCustomerReward({
                    customerId: referral.referrerId,
                    event: "REFERRAL",
                    type: "RECURRING",
                    title: "Referral renewal reward",
                    description: `Your referred customer renewed their subscription. You earned ${referrerPoints} points.`,
                    orderId: order.admin_graphql_api_id,
                    referralId: referral.id,
                    status: "COMPLETED",
                })
            );
        }

        if (referredPoints > 0) {
            rewardTasks.push(
                createTransaction(
                    {
                        customerId: referral.referredId,
                        type: "EARN",
                        eventId: rule.event.id,
                        referralId: referral.id,
                        reason: `Subscription renewal reward — earned for renewing your subscription (${orderLabel})`,
                        activity: `+${referredPoints} points for subscription renewal`,
                        points: referredPoints,
                        status: "COMPLETED",
                    },
                    session
                ),
                createCustomerReward({
                    customerId: referral.referredId,
                    event: "REFERRAL",
                    type: "RECURRING",
                    title: "Subscription renewal reward",
                    description: `You earned ${referredPoints} points for renewing your subscription.`,
                    orderId: order.admin_graphql_api_id,
                    referralId: referral.id,
                    status: "COMPLETED",
                })
            );
        }

        await Promise.all([
            ...rewardTasks,
            prisma.referral.update({
                where: { id: referral.id },
                data: { metadata: subscriptionContract ?? {} },
            }),
        ]);

        await Promise.all([
            syncCustomerConfig(admin, referral.referrerId),
            syncCustomerConfig(admin, referral.referredId),
        ]);

        logger.success(shop, "Referral RECURRING order handled", {
            referralId: referral.id,
            referrerPoints,
            referredPoints,
            orderLabel,
        });
    }
};

// ============================================================
// VOUCHER UPDATE
// ============================================================

/**
 * Marks any reward vouchers as USED if their discount code
 * was applied on the current order.
 *
 * Runs after both normal and referral order handling.
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

        const orderDiscountCodes = order?.discount_codes ?? [];
        if (!orderDiscountCodes.length) return;

        const discountCodeSet = new Set(
            orderDiscountCodes.map((d) => d?.code).filter(Boolean)
        );
        if (!discountCodeSet.size) return;

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

// ============================================================
// HELPERS
// ============================================================

/**
 * Returns a short human-readable order label e.g. "#1234".
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
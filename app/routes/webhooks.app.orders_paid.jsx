import prisma from "db-server";
import { authenticate } from "../shopify.server";
import { logger } from "app/utils/logger";
import { getPointRuleByEvent } from "app/controller/pointsRule/getPointRuleByEvent";
import createPointsTransaction from "app/controller/pointsTransaction/createPointTransaction";
import { getAppstleMetafield } from "app/graphql/mutation/order/getAppstleMetafield"
import { isDuplicateEvent } from "app/controller/webhook/handleDuplicateWebhook";
import { createCustomerReward } from "app/controller/customerReward/createCustomerReward"
import { syncCustomerConfig } from "app/controller/metafieldsSync/syncCustomerConfig";


/**
 * Global Configuration for Webhook Reliability
 */
const ENABLE_IDEMPOTENCY = true;
const BACKGROUND_PROCESS_DELAY_MS = 20 * 1000; // 20 seconds



/**
 * ============================================================
 * 🚀 WEBHOOK ENTRY
 * ============================================================
 */
export const action = async ({ request }) => {
    try {
        const { payload, session, topic, shop, admin } = await authenticate.webhook(request);
        const order = payload;

        /**
        * ========================================================
        *  IDEMPOTENCY CHECK (WEBHOOK EVENT TABLE)
        * ========================================================
        */

        const webhookId = request.headers.get("X-Shopify-Webhook-Id");

        // Fallback ensures safety even if header is missing
        const eventKey = webhookId
            ? `SHOPIFY:${webhookId}`
            : `ORDER_CREATE:${order.admin_graphql_api_id}`;

        if (ENABLE_IDEMPOTENCY) {
            const isDuplicate = await isDuplicateEvent({ shop, eventKey });
            if (isDuplicate) {
                logger.warn("Duplicate webhook skipped", { eventKey });
                return new Response("OK", { status: 200 });
            }
        }

        logger.info("Webhook received", {
            topic,
            shop,
            orderId: order?.admin_graphql_api_id
        });

        setTimeout(() => {
            mainHandler({ admin, session, order, shop })
                .catch(err => {
                    logger.error("Handler failed", {
                        message: err.message,
                        stack: err.stack
                    });
                });
        }, BACKGROUND_PROCESS_DELAY_MS);

        return new Response("OK", { status: 200 });

    } catch (error) {
        logger.error("Webhook error", { message: error.message });
        return new Response("OK", { status: 200 });
    }
};

/**
 * ============================================================
 * MAIN HANDLER
 * ============================================================
 */
const mainHandler = async ({ admin, session, order, shop }) => {
    try {
        /**
         * ========================================================
         * CUSTOMER FETCH
         * ========================================================
         */
        const customerGid = order?.customer?.admin_graphql_api_id;
        if (!customerGid) return;

        const customer = await prisma.customer.findFirst({
            where: { shopifyId: customerGid },
            include: { referralsUsed: true }
        });

        if (!customer) return;

        /**
         * ========================================================
         * SUBSCRIPTION DATA
         * ========================================================
         */
        const appstle = await getAppstleMetafield(admin, order.admin_graphql_api_id);
        const contract = appstle?.subscriptionContract || null;

        /**
         * ========================================================
         * REFERRAL DETECTION
         * ========================================================
         */
        const referralContext = detectReferralOrder({ order, customer, contract });

        logger.info("Referral context", {
            ...referralContext
        })

        if (!referralContext.isReferralOrder) {
            // discount voucher update
            await voucherUpdateIfAvailable(admin, order, customer);

            return handleNormalOrder({ order, customer, session });
        }

        /**
         * ========================================================
         * REFERRAL FLOW
         * ========================================================
         */
        return handleReferral({ referralContext, order, contract, session });

    } catch (error) {
        logger.error("Main handler error", {
            message: error.message,
            stack: error.stack
        });
    }
};

/**
 * ============================================================
 * REFERRAL DETECTION
 * ============================================================
 */
const detectReferralOrder = ({ order, customer, contract }) => {
    const referral = customer?.referralsUsed;
    if (!referral) return { isReferralOrder: false };

    // FIRST ORDER (discount match)
    const discountMatch = order?.discount_codes?.find(
        d => d.code === referral.discountCode
    );

    if (discountMatch) {
        return { isReferralOrder: true, type: "FIRST", referral };
    }

    // RECURRING ORDER (subscription match)
    if (
        contract?.id &&
        referral.subscriptionContractId === contract.id?.toString() &&
        contract.currentCycle > 1
    ) {
        return { isReferralOrder: true, type: "RECURRING", referral };
    }

    return { isReferralOrder: false };
};

/**
 * ============================================================
 * REFERRAL HANDLER
 * ============================================================
 */
const handleReferral = async ({ referralContext, order, contract, session }) => {
    // validation 
    const rule = await getPointRuleByEvent("REFERRAL");
    if (!rule?.isActive) return;

    const conditions = rule.conditions?.referral;
    const { type, referral } = referralContext;

    // ------------------------------
    // FIRST ORDER
    // ------------------------------
    if (type === "FIRST") {
        if (referral.discountUsed) return;

        // update referral
        await prisma.referral.update({
            where: { id: referral.id },
            data: {
                status: "COMPLETED",
                discountUsed: true,
                orderId: order.admin_graphql_api_id,
                subscriptionContractId: contract?.id?.toString(),
                metadata: contract
            }
        });

        // create point transaction
        await createPointsTransaction({
            customerId: referral.referrerId,
            type: "EARN",
            eventId: rule.event.id,
            reason: rule.event.name,
            points: conditions?.referrer?.firstOrderPoints || 0
        }, session);

        // create referred customer reward
        await createCustomerReward({
            customerId: referral?.referredId,
            event: 'REFERRAL',
            type: type,
            title: "Referral discount",
            description: "Referred Customer got discount",
            code: referral?.discountCode,
            orderId: order.admin_graphql_api_id,
            referralId: referral?.id,
            status: "COMPLETED"
        })
    }

    // ------------------------------
    // RECURRING ORDER
    // ------------------------------
    if (type === "RECURRING") {

        if (conditions?.referrer?.allowRenewalReward) {
            await createPointsTransaction({
                customerId: referral.referrerId,
                type: "EARN",
                eventId: rule.event.id,
                reason: rule.event.name,
                points: conditions?.referrer?.renewalPoints || 0
            }, session);
        }

        if (conditions?.referred?.allowRenewalReward) {
            await createPointsTransaction({
                customerId: referral.referredId,
                type: "EARN",
                eventId: rule.event.id,
                reason: rule.event.name,
                points: conditions?.referred?.renewalPoints || 0
            }, session);
        }

        await prisma.referral.update({
            where: { id: referral.id },
            data: { metadata: contract }
        });
    }
};

/**
 * ============================================================
 * NORMAL ORDER HANDLER
 * ============================================================
 */
const handleNormalOrder = async ({ order, customer, session }) => {

    // validation 
    const rule = await getPointRuleByEvent("CREATE ORDER");
    if (!rule?.isActive) return;

    const conditions = rule.conditions;
    let orderTotal = Number(order?.total_price) || 0;
    const items = order?.line_items || [];

    if (conditions?.appliesTo?.type === "allProducts") {
        const excluded = conditions?.excludedProducts?.products || [];
        items.forEach(item => {
            if (excluded.includes(item.product_id?.toString())) {
                orderTotal -= Number(item.price);
            }
        });
    }

    if (conditions?.appliesTo?.type === "specificProducts") {
        const specific = conditions?.appliesTo?.products || [];
        orderTotal = items.reduce((sum, item) => {
            if (specific.includes(item.product_id?.toString())) {
                return sum + Number(item.price);
            }
            return sum;
        }, 0);
    }

    let points = 0;

    if (conditions?.earning?.type === "incremental") {
        const rate = conditions?.earning?.rate;
        if (rate?.amount > 0) {
            points = Math.floor(orderTotal / rate.amount) * rate.points;
        }
    } else {
        points = Number(conditions?.earning?.fixedPoints) || 0;
    }

    await createPointsTransaction({
        customerId: customer.id,
        type: "EARN",
        eventId: rule.event.id,
        reason: rule.event.name,
        points
    }, session);
};

/**
 * =========================================================
 * Voucher Update If Available
 * ---------------------------------------------------------
 */

const voucherUpdateIfAvailable = async (admin, order, customer) => {
    try {
        // VALIDATION
        if (!order || !customer?.id) return;

        const orderDiscountCodes = order?.discount_codes || [];
        if (!orderDiscountCodes.length) return;

        // PREPARE DISCOUNT SET (O(1) lookup)
        const discountCodeSet = new Set(
            orderDiscountCodes
                .map(d => d?.code)
                .filter(Boolean) // remove null/undefined
        );

        if (!discountCodeSet.size) return;

        // FETCH REWARDS (only pending)
        const rewards = await prisma.customerReward.findMany({
            where: {
                customerId: customer.id,
                status: {
                    not: "COMPLETED" // skip already completed
                }
            },
            select: {
                id: true,
                code: true
            }
        });

        if (!rewards.length) return;

        // MATCH (EXACT MATCH)
        const matchedRewardIds = rewards
            .filter(reward => discountCodeSet.has(reward.code))
            .map(reward => reward.id);

        if (!matchedRewardIds.length) return;

        // UPDATE MATCHED REWARDS
        await prisma.customerReward.updateMany({
            where: {
                id: { in: matchedRewardIds }
            },
            data: {
                status: "COMPLETED",
            }
        });

        // update customer config : metafield
        await syncCustomerConfig(admin, customer.shopifyId)

        // LOG SUCCESS
        logger.info("Voucher rewards updated", {
            customerId: customer.id,
            matchedRewardCount: matchedRewardIds.length
        });

    } catch (error) {
        // ERROR LOGGING
        logger.error("Voucher update error", {
            error: error?.message,
            customerId: customer?.id
        });
    }
};

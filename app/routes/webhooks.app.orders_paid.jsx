import prisma from "db-server";
import { authenticate } from "../shopify.server";
import { logger } from "app/utils/logger";
import { getPointRuleByEvent } from "app/controller/pointsRule/getPointRuleByEvent";
import createPointsTransaction from "app/controller/pointsTransaction/createPointTransaction";

export const action = async ({ request }) => {
    try {
        const { payload, session, topic, shop } = await authenticate.webhook(request);

        const order = payload;
        logger.info("Webhook received", { topic, shop });

        const customerGid = order?.customer?.admin_graphql_api_id ?? null;

        if (!customerGid) {
            return new Response("No customer", { status: 200 });
        }

        const customer = await prisma.customer.findFirst({
            where: { shopifyId: customerGid },
            include: { referralsUsed: true }
        });

        if (!customer || !customer.referralsUsed) {
            return new Response("No referral", { status: 200 });
        }

        const referral = customer.referralsUsed;

        const isReferredDiscount = order?.discount_codes?.find(
            d => d.code === referral.discountCode
        );

        if (!isReferredDiscount) {
            return new Response("No matching discount", { status: 200 });
        }

        // 🔒 Prevent duplicate processing
        if (referral.status === "COMPLETED" || referral?.discountUsed) {
            logger.warn("Referral already processed", { referralId: referral.id });
            return new Response("Already processed", { status: 200 });
        }

        // ✅ Update referral
        await prisma.referral.update({
            where: { id: referral.id },
            data: {
                status: "COMPLETED",
                discountUsed: true,
                orderId: order.admin_graphql_api_id
            }
        });

        // ✅ Give points
        const referralPointRule = await getPointRuleByEvent("Referral");

        if (referralPointRule) {
            await createPointsTransaction({
                customerId: referral.referrerId,
                type: "EARN",
                eventId: referralPointRule.event.id,
                reason: referralPointRule.event.name || referralPointRule.event.type,
                points: referralPointRule.conditions.referrerPoints || 0
            }, session);
        }

        return new Response("Success", { status: 200 });

    } catch (error) {
        logger.error("Webhook Error", {
            message: error.message,
            stack: error.stack
        });

        // ❗ Still return 200 to prevent retries unless it's auth issue
        return new Response("Error handled", { status: 200 });
    }
};
import prisma from "db-server";
import { customerOrderCount } from "app/graphql/query/customers";
import { logger } from "app/utils/logger.js";

export async function loadCustomerDetails(admin, sessionId, customerId) {
    const customer = await prisma.customer.findFirst({
        where: {
            sessionId,
            id: customerId ? parseInt(customerId) : undefined,
        },
        include: {
            transactions: {
                orderBy: { createdAt: "desc" },
                include: { event: true },
            },
            rewards:       { orderBy: { createdAt: "desc" } },
            referralsSent: true,
            referralsUsed: true,
        },
    });

    if (!customer) return { customer: null };

    // customerOrderCount throws on failure (0 has business meaning elsewhere,
    // e.g. referral eligibility) — for this dashboard display, degrade to
    // null ("unknown") instead of failing the whole page load.
    const orderCount = await customerOrderCount(admin, customer.shopifyId).catch((err) => {
        logger.error("Failed to fetch customer order count for dashboard", { error: err?.message, customerId: customer.id });
        return null;
    });

    return { customer: { ...customer, orderCount } };
}

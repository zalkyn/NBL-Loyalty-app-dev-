import { logger } from "../../utils/logger";
import prisma from "../../db.server";

export const getPointRuleByEvent = async (event = null) => {
    try {
        const rules = await prisma.pointsRule.findMany({ include: { event: true } });
        const rule = rules?.find(r => r.event.type?.toLowerCase() === event?.toLowerCase())
        return rule ?? null;

    } catch (error) {
        logger.error("Get referral point rule error", {
            message: error?.message
        });
        return null;
    }
}
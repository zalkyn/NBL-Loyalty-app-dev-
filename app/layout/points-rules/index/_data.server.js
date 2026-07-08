import prisma from "db-server";
import syncAppConfig from "@controller/metafieldsSync/syncAppConfig";
import { logger } from "app/utils/logger.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "layout/points-rules/index/_data.server.js";

export async function handleDeleteRule({ formData, session, admin }) {
    const submitType = "deleteRule";
    const ruleId = parseInt(formData.get("ruleId"));
    if (!ruleId)
        return { message: "Rule ID is required.", status: "error", submitType };

    try {
        const rule = await prisma.pointsRule.findUnique({ where: { id: ruleId } });
        if (!rule || rule.sessionId !== session.id)
            return { message: "Rule not found or access denied.", status: "error", submitType };

        await prisma.pointsRule.delete({ where: { id: ruleId } });

        // sync app config after delete
        await syncAppConfig(admin, session);

        return { message: "Points rule deleted successfully.", status: "success", submitType };
    } catch (err) {
        logger.error("Delete points rule failed", { module: MODULE, error: err?.message, shop: session.shop, ruleId });
        return { message: err.message || "Failed to delete rule.", status: "error", submitType };
    }
}

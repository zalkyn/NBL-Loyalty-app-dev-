import prisma from "db-server";
import syncAppConfig from "@controller/metafieldsSync/syncAppConfig";
import { logger } from "app/utils/logger.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "layout/rewards-rules/_data.server.js";

// ─────────────────────────────────────────────────────────────────────────────
// TITLE PLACEHOLDER
//
// Stored AS ENTERED — including the raw "{{currency_value}}" placeholder,
// if present — never resolved at write-time. Resolving and freezing it
// here used to mean editing a rule's discount value later silently left
// the title stale: "Voucher $15" saved, then the admin bumps the discount
// to $20, and the title still reads "$15" forever (it no longer contains
// the placeholder pattern, so nothing would ever re-resolve it). That's
// also why the Edit Rule form used to show the resolved value instead of
// the template, unlike the Create form's default.
//
// Actual resolution now happens where the title is actually consumed:
// widget-ui/reward-claim.jsx resolves it fresh at claim time (via this
// same previewTitle() — see _data.js) using the rule's CURRENT
// discountType/rewardValue, and freezes the RESULT onto that customer's
// own CustomerReward.title — which is correct to freeze, since a reward
// a customer already claimed shouldn't retroactively change if the rule
// is edited afterward.
// ─────────────────────────────────────────────────────────────────────────────

// ── CREATE ───────────────────────────────────────────────────────────────────

export async function handleAddRule({ formData, session, admin }) {
    const submitType = "addRule";

    let newRule;
    try {
        newRule = JSON.parse(formData.get("rule") || "{}");
    } catch {
        return { message: "Invalid reward rule data.", status: "error", submitType };
    }

    if (!newRule.rewardType)
        return { message: "Please select a reward type.", status: "error", submitType };
    if (!newRule.title?.trim())
        return { message: "Display title is required.", status: "error", submitType };
    if (!newRule.pointsCost || Number(newRule.pointsCost) <= 0)
        return { message: "Points cost must be greater than 0.", status: "error", submitType };

    try {
        const created = await prisma.rewardRule.create({
            data: {
                title: newRule.title,
                description: newRule.description || null,
                discountType: newRule.discountType,
                rewardValue: Number(newRule.rewardValue) || 0,
                rewardType: newRule.rewardType,
                pointsCost: Number(newRule.pointsCost),
                isActive: newRule.isActive ?? true,
                startDate: newRule.startDate ? new Date(newRule.startDate) : null,
                endDate: newRule.endDate ? new Date(newRule.endDate) : null,
                session: { connect: { id: session.id } },
            },
        });

        await syncAppConfig(admin, session);
        return { message: "Reward rule created successfully.", rule: created, status: "success", submitType };
    } catch (err) {
        logger.error("Create reward rule failed", { module: MODULE, error: err?.message, shop: session.shop });
        return { message: "Failed to create reward rule. Please try again.", status: "error", submitType };
    }
}

// ── UPDATE ───────────────────────────────────────────────────────────────────

export async function handleUpdateRule({ formData, session, admin }) {
    const submitType = "updateRule";

    let updatedRule;
    try {
        updatedRule = JSON.parse(formData.get("rule") || "{}");
    } catch {
        return { message: "Invalid reward rule data.", status: "error", submitType };
    }

    if (!updatedRule.id)
        return { message: "Rule ID is required.", status: "error", submitType };
    if (!updatedRule.rewardType)
        return { message: "Please select a reward type.", status: "error", submitType };
    if (!updatedRule.title?.trim())
        return { message: "Display title is required.", status: "error", submitType };
    if (!updatedRule.pointsCost || Number(updatedRule.pointsCost) <= 0)
        return { message: "Points cost must be greater than 0.", status: "error", submitType };

    try {
        const existing = await prisma.rewardRule.findUnique({ where: { id: parseInt(updatedRule.id) } });
        if (!existing || existing.sessionId !== session.id)
            return { message: "Rule not found or access denied.", status: "error", submitType };

        const rule = await prisma.rewardRule.update({
            where: { id: parseInt(updatedRule.id) },
            data: {
                title: updatedRule.title,
                description: updatedRule.description || null,
                discountType: updatedRule.discountType,
                rewardValue: Number(updatedRule.rewardValue) || 0,
                rewardType: updatedRule.rewardType,
                pointsCost: Number(updatedRule.pointsCost),
                isActive: updatedRule.isActive ?? true,
                startDate: updatedRule.startDate ? new Date(updatedRule.startDate) : null,
                endDate: updatedRule.endDate ? new Date(updatedRule.endDate) : null,
            },
        });

        await syncAppConfig(admin, session);
        return { message: "Reward rule updated successfully.", rule, status: "success", submitType };
    } catch (err) {
        logger.error("Update reward rule failed", { module: MODULE, error: err?.message, shop: session.shop, ruleId: updatedRule.id });
        return { message: "Failed to update reward rule. Please try again.", status: "error", submitType };
    }
}

// ── DELETE ───────────────────────────────────────────────────────────────────

export async function handleDeleteRule({ formData, session, admin }) {
    const submitType = "deleteRule";
    const ruleId = parseInt(formData.get("ruleId"));
    if (!ruleId)
        return { message: "Rule ID is required.", status: "error", submitType };

    try {
        const rule = await prisma.rewardRule.findUnique({ where: { id: ruleId } });
        if (!rule || rule.sessionId !== session.id)
            return { message: "Rule not found or access denied.", status: "error", submitType };

        await prisma.rewardRule.delete({ where: { id: ruleId } });
        await syncAppConfig(admin, session);
        return { message: "Reward rule deleted successfully.", status: "success", submitType };
    } catch (err) {
        logger.error("Delete reward rule failed", { module: MODULE, error: err?.message, shop: session.shop, ruleId });
        return { message: err.message || "Failed to delete rule. Please try again.", status: "error", submitType };
    }
}
import { useAppBridge } from "@shopify/app-bridge-react";
import { useEffect } from "react";
import { useActionData, useLoaderData, useSubmit } from "react-router";
import { authenticate } from "shopify-server"
import prisma from "db-server"

import { useAtom } from "jotai";
import { loaderDataAtom, actionDataAtom, toggleAtom } from "@atoms/pointsRule";


import CreatePointsRule from "@components/pointsRule/create";
import ShowPointsRule from "@components/pointsRule/show";
import DeletePointsRule from "@components/pointsRule/delete";
import EditPointsRule from "@components/pointsRule/edit";

// ====================== LOADER ======================
export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);

    const [rules, events] = await Promise.all([
        prisma.pointsRule.findMany({
            where: { sessionId: session.id },
            include: { event: true },
            orderBy: [
                { priority: "asc" },
                { createdAt: "desc" }
            ],
        }),
        prisma.event.findMany({
            where: { sessionId: session.id, isActive: true },
            orderBy: { name: "asc" },
        }),
    ]);

    const existingRuleEventIds = rules.map(r => r.eventId);

    return { rules, events, existingRuleEventIds };
};

// ====================== ACTION ======================
export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const submitType = formData.get("submitType");

    // ---------- CREATE ----------
    if (submitType === "addRule") {
        const newRule = JSON.parse(formData.get("rule")) || {};

        if (!newRule.eventId) return { message: "Please select a Points event.", status: "error", submitType };

        try {
            const existingRule = await prisma.pointsRule.findFirst({
                where: { eventId: parseInt(newRule.eventId), sessionId: session.id },
            });
            if (existingRule) return { message: "A rule for this event already exists.", status: "error", submitType };

            const createdRule = await prisma.pointsRule.create({
                data: {
                    name: newRule.name || null,
                    description: newRule.description || null,
                    points: newRule.points ? parseInt(newRule.points) : null,
                    multiplier: newRule.multiplier ? parseFloat(newRule.multiplier) : null,
                    minAmount: newRule.minAmount ? parseFloat(newRule.minAmount) : null,
                    priority: newRule.priority ? parseInt(newRule.priority) : 0,
                    startDate: newRule.startDate ? new Date(newRule.startDate) : null,
                    endDate: newRule.endDate ? new Date(newRule.endDate) : null,
                    conditions: newRule.conditions ? JSON.parse(newRule.conditions) : null,
                    metadata: newRule.metadata ? JSON.parse(newRule.metadata) : null,
                    isActive: newRule.isActive ?? true,
                    session: { connect: { id: session.id } },
                    event: { connect: { id: parseInt(newRule.eventId) } },
                },
            });

            return { message: "Points rule created successfully.", rule: createdRule, status: "success", submitType };
        } catch (error) {
            console.error("Create PointsRule Error:", error);
            return { message: "Failed to create rule.", status: "error", submitType };
        }
    }

    // ---------- UPDATE ----------
    else if (submitType === "updateRule") {
        const updatedRule = JSON.parse(formData.get("rule")) || {};
        if (!updatedRule.id || !updatedRule.eventId) return { message: "Rule ID and Points event are required.", status: "error", submitType };

        try {
            const existingRule = await prisma.pointsRule.findUnique({ where: { id: parseInt(updatedRule.id) } });
            if (!existingRule || existingRule.sessionId !== session.id) return { message: "Rule not found.", status: "error", submitType };

            const duplicateCheck = await prisma.pointsRule.findFirst({
                where: { eventId: parseInt(updatedRule.eventId), sessionId: session.id, NOT: { id: parseInt(updatedRule.id) } }
            });
            if (duplicateCheck) return { message: "Another rule for this event already exists.", status: "error", submitType };

            const rule = await prisma.pointsRule.update({
                where: { id: parseInt(updatedRule.id) },
                data: {
                    name: updatedRule.name || null,
                    description: updatedRule.description || null,
                    points: updatedRule.points ? parseInt(updatedRule.points) : null,
                    multiplier: updatedRule.multiplier ? parseFloat(updatedRule.multiplier) : null,
                    minAmount: updatedRule.minAmount ? parseFloat(updatedRule.minAmount) : null,
                    priority: updatedRule.priority ? parseInt(updatedRule.priority) : 0,
                    startDate: updatedRule.startDate ? new Date(updatedRule.startDate) : null,
                    endDate: updatedRule.endDate ? new Date(updatedRule.endDate) : null,
                    conditions: updatedRule.conditions ? JSON.parse(updatedRule.conditions) : null,
                    metadata: updatedRule.metadata ? JSON.parse(updatedRule.metadata) : null,
                    isActive: updatedRule.isActive ?? true,
                    event: { connect: { id: parseInt(updatedRule.eventId) } },
                    session: { connect: { id: session.id } },
                },
            });

            return { message: "Points rule updated successfully.", rule, status: "success", submitType };
        } catch (error) {
            console.error("Update Rule Error:", error);
            return { message: "Failed to update rule.", status: "error", submitType };
        }
    }

    // ---------- DELETE ----------
    else if (submitType === "deleteRule") {
        const ruleId = parseInt(formData.get("ruleId"));
        if (!ruleId) return { message: "Rule ID is required.", status: "error", submitType };

        try {
            const rule = await prisma.pointsRule.findUnique({ where: { id: ruleId } });
            if (!rule || rule.sessionId !== session.id) throw new Error("Rule not found");

            await prisma.pointsRule.delete({ where: { id: ruleId } });
            return { message: "Points rule deleted successfully.", status: "success", submitType };
        } catch (error) {
            console.error("Delete Rule Error:", error);
            return { message: error.message || "Failed to delete rule.", status: "error", submitType };
        }
    }

    return { message: "Invalid action.", status: "error", submitType };
};

export default function PointsRule() {
    const submit = useSubmit();
    const shopify = useAppBridge();


    const __actionData = useActionData();
    const __loaderData = useLoaderData();

    const [loaderData, setLoaderData] = useAtom(loaderDataAtom);
    const [actionData, setActionData] = useAtom(actionDataAtom);
    const [toggle, setToggle] = useAtom(toggleAtom);

    useEffect(() => {
        setLoaderData(__loaderData)
    }, [__loaderData]);

    useEffect(() => {
        setActionData(__actionData);
    }, [__actionData]);

    const handleToggleAddRule = () => {
        setToggle(prev => {
            return {
                ...prev, addRule: !prev.addRule
            }
        })
    };


    return (
        <s-page inlineSize="base">
            {/* HEADER */}
            <s-section>
                <s-grid gridTemplateColumns="1fr auto" gap="large" alignItems="center">
                    <h2 style={{ marginBlock: "0" }}>Points Rules Management</h2>
                    <s-button
                        onClick={handleToggleAddRule}
                        icon={toggle.addRule ? "minus" : "plus"}
                        variant={toggle.addRule ? "auto" : "primary"}
                    >
                        {toggle.addRule ? "Cancel" : "Add New Rule"}
                    </s-button>
                </s-grid>
            </s-section>

            {/* ADD FORM */}
            <CreatePointsRule />


            {/* TABLE */}
            <ShowPointsRule />

            {/* DELETE MODAL */}
            <DeletePointsRule />


            {/* EDIT MODAL */}
            <EditPointsRule />
        </s-page>
    );
}
import { useEffect } from "react";
import { useActionData, useLoaderData, useSubmit } from "react-router";
import { authenticate } from "shopify-server"
import prisma from "db-server"

import { useAtom } from "jotai";
import {
    loaderDataAtom,
    actionDataAtom,
    toggleAtom,
    actionTypeAtom,
    conditionsAtom,
    newRuleAtom,
    emptyNewRule,
    emptyConditions,
    loadingButtonAtom
} from "@atoms/pointsRule";


import RulesForm from "@components/pointsRule/rulesForm";
import ShowPointsRule from "@components/pointsRule/show";
import DeletePointsRule from "@components/pointsRule/deleteModal";

import syncAppConfig from "@controller/metafieldsSync/syncAppConfig"

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
    const { session, admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const submitType = formData.get("submitType");

    // ---------- CREATE ----------
    if (submitType === "addRule") {
        const newRule = JSON.parse(formData.get("rule")) || {};
        const conditions = JSON.parse(formData.get("conditions") || {});

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
                    priority: newRule.priority ? parseInt(newRule.priority) : 0,
                    startDate: newRule.startDate ? new Date(newRule.startDate) : null,
                    endDate: newRule.endDate ? new Date(newRule.endDate) : null,
                    metadata: newRule.metadata ? JSON.parse(newRule.metadata) : null,
                    isActive: newRule.isActive ?? true,
                    session: { connect: { id: session.id } },
                    event: { connect: { id: parseInt(newRule.eventId) } },
                    conditions: conditions
                },
            });

            await syncAppConfig(admin);

            return { message: "Points rule created successfully.", rule: createdRule, status: "success", submitType };
        } catch (error) {
            console.error("Create PointsRule Error:", error);
            return { message: "Failed to create rule.", status: "error", submitType };
        }
    }

    // ---------- UPDATE ----------
    else if (submitType === "updateRule") {
        const updatedRule = JSON.parse(formData.get("rule")) || {};
        const conditions = JSON.parse(formData.get("conditions") || {});
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
                    priority: updatedRule.priority ? parseInt(updatedRule.priority) : 0,
                    startDate: updatedRule.startDate ? new Date(updatedRule.startDate) : null,
                    endDate: updatedRule.endDate ? new Date(updatedRule.endDate) : null,
                    conditions: conditions || null,
                    metadata: updatedRule.metadata ? JSON.parse(updatedRule.metadata) : null,
                    isActive: updatedRule.isActive ?? true,
                    event: { connect: { id: parseInt(updatedRule.eventId) } },
                    session: { connect: { id: session.id } },
                },
            });

            await syncAppConfig(admin);

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

            await syncAppConfig(admin);

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

    const __actionData = useActionData();
    const __loaderData = useLoaderData();

    const [loaderData, setLoaderData] = useAtom(loaderDataAtom);
    const [, setActionData] = useAtom(actionDataAtom);
    const [toggle, setToggle] = useAtom(toggleAtom);
    const [actionType, setActionType] = useAtom(actionTypeAtom);
    const [conditions, setConditions] = useAtom(conditionsAtom);
    const [newRule, setNewRule] = useAtom(newRuleAtom);
    const [loadingButton, setLoadingButton] = useAtom(loadingButtonAtom);

    useEffect(() => {
        setLoaderData(__loaderData)
    }, [__loaderData]);

    useEffect(() => {
        setActionData(__actionData);
    }, [__actionData]);

    const handleToggleAddRule = () => {
        setActionType('create')
        setNewRule(emptyNewRule)
        setConditions(emptyConditions)
        setToggle(prev => {
            return {
                ...prev, addRule: !prev.addRule
            }
        })
    };

    const getEvent = (eventId) => {
        const event = loaderData?.events?.find(s => s.id === parseInt(eventId));
        return event
    };


    const pageHeading = () => {
        if (actionType === 'create') {
            return 'Create New Rule'
        } else if (actionType === 'edit') {
            return 'Rules > ' + getEvent(newRule?.eventId)?.type
        } else {
            return 'Manage event rules'
        }
    }

    const handleValidation = (rule) => {
        if (!rule?.eventId) { shopify.toast.show("Please select a Points event."); return false; }
        if (rule.points && parseInt(rule.points) < 0) { shopify.toast.show("Points cannot be negative."); return false; }
        if (rule.multiplier && parseFloat(rule.multiplier) <= 0) { shopify.toast.show("Multiplier must be > 0."); return false; }
        return true;
    };

    const handleSaveRule = () => {
        if (!handleValidation(newRule)) return;
        setLoadingButton(prev => ({ ...prev, addRule: true }));
        const _conditions = conditions || null;

        submit({
            submitType: "addRule",
            rule: JSON.stringify(newRule),
            conditions: JSON.stringify(_conditions)
        }, { method: "post" });
    };

    const handleUpdateRule = () => {
        if (!handleValidation(newRule)) return;
        setLoadingButton(prev => ({ ...prev, updateRule: true }));
        const _conditions = conditions || null;
        submit({
            submitType: "updateRule",
            rule: JSON.stringify(newRule),
            conditions: JSON.stringify(_conditions)
        }, { method: "post" });
    };



    return (
        <s-page inlineSize="base">
            {/* HEADER */}
            <s-section>
                {/* <pre>{JSON.stringify(conditions, null, 2)}</pre> */}
                <s-grid gridTemplateColumns="1fr auto" gap="large" alignItems="center">
                    <h2 style={{ marginBlock: "0" }}>
                        {pageHeading()}
                    </h2>
                    <s-stack direction="inline" gap="base" alignItems="center">
                        <s-button
                            onClick={handleToggleAddRule}
                        >
                            {toggle.addRule ? "Cancel" : "Add New Rule"}
                        </s-button>
                        {toggle?.addRule && <s-box>
                            {actionType === 'create' ?
                                <s-button
                                    variant="primary"
                                    onClick={() => handleSaveRule()}
                                    disabled={loadingButton.addRule || !newRule.eventId}
                                    loading={loadingButton.addRule}
                                >
                                    Save Rule
                                </s-button> :
                                <s-button
                                    variant="primary"
                                    onClick={() => handleUpdateRule()}
                                    disabled={!newRule.eventId}
                                    loading={loadingButton.addRule || loadingButton?.editRule}
                                >
                                    Update Rule
                                </s-button>
                            }
                        </s-box>}
                    </s-stack>
                </s-grid>
            </s-section>

            {/* Rule Form */}
            <RulesForm />


            {/* View TABLE */}
            <ShowPointsRule />

            {/* DELETE MODAL */}
            <DeletePointsRule />
        </s-page>
    );
}

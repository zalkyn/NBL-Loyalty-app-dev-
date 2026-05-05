import {
    loaderDataAtom,
    actionDataAtom,
    actionTypeAtom,
    toggleAtom,
    loadingButtonAtom,
    emptyConditions,
    emptyNewRule,
    conditionsAtom,
    newRuleAtom,
} from "@atoms/redeemRule";
import { useAtom } from "jotai";
import { useEffect } from "react";
import { useActionData, useLoaderData, useSubmit } from "react-router";
import { authenticate } from "shopify-server";
import prisma from "db-server";
import syncAppConfig from "@controller/metafieldsSync/syncAppConfig";

import ShowRules from "../components/redeemRule/showRules";
import RuleInputForm from "@components/redeemRule/ruleInputForm";
import DeleteRewardRule from "@components/redeemRule/deleteModal";

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const rewards = await prisma.reward.findMany();
    return { session, rewards };
};

// ─── Action ──────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const submitType = formData.get("submitType");

    // CREATE
    if (submitType === "addRule") {
        const newRule = JSON.parse(formData.get("rule"));

        const createdRule = await prisma.reward.create({
            data: {
                title: newRule.title,
                description: newRule.description,
                discountType: newRule.discountType,
                rewardValue: newRule.rewardValue,
                rewardType: newRule.rewardType,
                pointsCost: Number(newRule.pointsCost),
                startDate: newRule.startDate ? new Date(newRule.startDate) : null,
                session: { connect: { id: session.id } },
            },
        });

        await syncAppConfig(admin);
        return { message: "Reward rule successfully created.", rule: createdRule, status: "success", submitType };
    }

    // UPDATE
    if (submitType === "updateRule") {
        const updatedRule = JSON.parse(formData.get("rule"));
        if (!updatedRule.id) return { message: "Rule ID is required.", status: "error", submitType };

        const updatedRuleResponse = await prisma.reward.update({
            where: { id: parseInt(updatedRule.id) },
            data: {
                title: updatedRule.title,
                description: updatedRule.description,
                discountType: updatedRule.discountType,
                rewardValue: updatedRule.rewardValue,
                rewardType: updatedRule.rewardType,
                pointsCost: Number(updatedRule.pointsCost),
                isActive: updatedRule.isActive,
            },
        });

        await syncAppConfig(admin);
        return { message: "Reward rule successfully updated.", rule: updatedRuleResponse, status: "success", submitType };
    }

    // DELETE
    if (submitType === "deleteRule") {
        const ruleId = parseInt(formData.get("ruleId"));
        if (!ruleId) return { message: "Rule ID is required.", status: "error", submitType };

        const rule = await prisma.reward.findUnique({ where: { id: ruleId } });
        if (!rule || rule.sessionId !== session.id) throw new Error("Rule not found");

        await prisma.reward.delete({ where: { id: ruleId } });

        await syncAppConfig(admin);
        return { message: "Reward rule successfully deleted.", status: "success", submitType };
    }

    return { session };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const validateRule = (rule) => {
    if (!rule?.rewardType) { shopify.toast.show("Please select a reward type."); return false; }
    if (rule.rewardValue && parseInt(rule.rewardValue) <= 0) { shopify.toast.show("Value must be greater than 0."); return false; }
    if (rule.pointsCost && parseInt(rule.pointsCost) <= 0) { shopify.toast.show("Points cost must be greater than 0."); return false; }
    if (!rule.title) { shopify.toast.show("Please enter a display title."); return false; }
    return true;
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function RedeemRule() {
    const submit = useSubmit();

    const __actionData = useActionData();
    const __loaderData = useLoaderData();

    const [, setLoaderData] = useAtom(loaderDataAtom);
    const [, setActionData] = useAtom(actionDataAtom);
    const [toggle, setToggle] = useAtom(toggleAtom);
    const [actionType, setActionType] = useAtom(actionTypeAtom);
    const [conditions, setConditions] = useAtom(conditionsAtom);
    const [newRule, setNewRule] = useAtom(newRuleAtom);
    const [loadingButton, setLoadingButton] = useAtom(loadingButtonAtom);

    useEffect(() => { setLoaderData(__loaderData); }, [__loaderData]);
    useEffect(() => { setActionData(__actionData); setLoadingButton({}); }, [__actionData]);

    // ── Handlers ──

    const handleToggleInputSection = () => {
        setActionType("create");
        setNewRule(emptyNewRule);
        setConditions(emptyConditions);
        setToggle((prev) => ({ ...prev, inputSection: !prev.inputSection }));
    };

    const handleSubmit = (submitType) => {
        if (!validateRule(newRule)) return;
        setLoadingButton((prev) => ({ ...prev, [submitType]: true }));
        submit(
            { submitType, rule: JSON.stringify(newRule), conditions: JSON.stringify(conditions ?? null) },
            { method: "post" }
        );
    };

    // ── Derived ──

    const isEditing = actionType === "edit";
    const showInputForm = toggle?.inputSection;

    // ── Render ──

    return (
        <s-page>
            <s-section>
                <s-stack direction="inline" alignItems="center" justifyContent="space-between">

                    {/* Title breadcrumb */}
                    <s-stack direction="inline" gap="small" alignItems="center" justifyContent="start">
                        <s-heading>Reward Rules</s-heading>
                        {showInputForm && (
                            <>
                                <s-heading>{">"}</s-heading>
                                <s-heading>{isEditing ? "Edit Rule" : "Create New Rule"}</s-heading>
                            </>
                        )}
                    </s-stack>

                    {/* Action buttons */}
                    <s-stack>
                        {showInputForm ? (
                            <s-stack direction="inline" gap="base" alignContent="center">
                                <s-button icon="minus-circle" onClick={handleToggleInputSection}>
                                    Cancel
                                </s-button>
                                <s-button
                                    variant="primary"
                                    icon={isEditing ? "adjust" : "plus-circle"}
                                    loading={loadingButton?.[isEditing ? "updateRule" : "addRule"]}
                                    onClick={() => handleSubmit(isEditing ? "updateRule" : "addRule")}
                                >
                                    {isEditing ? "Update Rule" : "Save New Rule"}
                                </s-button>
                            </s-stack>
                        ) : (
                            <s-button variant="primary" onClick={handleToggleInputSection}>
                                Create New Rule
                            </s-button>
                        )}
                    </s-stack>

                </s-stack>
            </s-section>

            {showInputForm && <RuleInputForm />}
            {!showInputForm && <ShowRules />}
            <DeleteRewardRule />
        </s-page>
    );
}
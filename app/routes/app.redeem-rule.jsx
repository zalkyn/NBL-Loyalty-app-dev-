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
    savedRuleAtom,
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


// ─── Helpers ─────────────────────────────────────────────────────────────────

const resolveRuleTitle = (title, discountType, rewardValue) => {
    if (!title) return title;
    const formatted = discountType === "percentage" ? `${rewardValue}% off` : `$${rewardValue}`;
    return title.replace(/\{\{currency_value\}\}/gi, formatted);
};

const validateRule = (rule) => {
    if (!rule?.rewardType) { shopify.toast.show("Please select a reward type.", { isError: true }); return false; }
    if (rule.rewardValue && parseInt(rule.rewardValue) <= 0) { shopify.toast.show("Value must be greater than 0.", { isError: true }); return false; }
    if (rule.pointsCost && parseInt(rule.pointsCost) <= 0) { shopify.toast.show("Points cost must be greater than 0.", { isError: true }); return false; }
    if (!rule.title) { shopify.toast.show("Please enter a display title.", { isError: true }); return false; }
    return true;
};


// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const rewardRules = await prisma.rewardRule.findMany();
    return { session, rewards: rewardRules, rewardRules };
};


// ─── Action ──────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const submitType = formData.get("submitType");

    if (submitType === "addRule") {
        const newRule = JSON.parse(formData.get("rule"));
        const resolvedTitle = resolveRuleTitle(newRule.title, newRule.discountType, newRule.rewardValue);

        const createdRule = await prisma.rewardRule.create({
            data: {
                title: resolvedTitle,
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

    if (submitType === "updateRule") {
        const updatedRule = JSON.parse(formData.get("rule"));
        if (!updatedRule.id) return { message: "Rule ID is required.", status: "error", submitType };

        const resolvedTitle = resolveRuleTitle(updatedRule.title, updatedRule.discountType, updatedRule.rewardValue);

        const updatedRuleResponse = await prisma.rewardRule.update({
            where: { id: parseInt(updatedRule.id) },
            data: {
                title: resolvedTitle,
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

    if (submitType === "deleteRule") {
        const ruleId = parseInt(formData.get("ruleId"));
        if (!ruleId) return { message: "Rule ID is required.", status: "error", submitType };

        const rule = await prisma.rewardRule.findUnique({ where: { id: ruleId } });
        if (!rule || rule.sessionId !== session.id) throw new Error("Rule not found");

        await prisma.rewardRule.delete({ where: { id: ruleId } });
        await syncAppConfig(admin);
        return { message: "Reward rule successfully deleted.", status: "success", submitType };
    }

    return { session };
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
    const [savedRule] = useAtom(savedRuleAtom);

    // ── Derived ───────────────────────────────────────────────────────────────

    const isEditing = actionType === "edit";
    const showInputForm = toggle?.inputSection;

    // Update button is disabled until something actually changes from the snapshot.
    const hasChanges = isEditing
        ? JSON.stringify(newRule) !== JSON.stringify(savedRule)
        : true; // create mode — always allow save

    // ── Effects ───────────────────────────────────────────────────────────────

    useEffect(() => { setLoaderData(__loaderData); }, [__loaderData]);

    useEffect(() => {
        if (!__actionData) return;

        setActionData(__actionData);
        setLoadingButton({});

        if (__actionData.status === "success") {
            shopify.toast.show(__actionData.message);

            // Close form on successful create/update.
            if (__actionData.submitType === "addRule" || __actionData.submitType === "updateRule") {
                setToggle((prev) => ({ ...prev, inputSection: false }));
                setNewRule(emptyNewRule);
                setConditions(emptyConditions);
            }
        } else if (__actionData.status === "error") {
            shopify.toast.show(__actionData.message, { isError: true });
        }
    }, [__actionData]);

    // ── Handlers ──────────────────────────────────────────────────────────────

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

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <s-page>
            <s-section>
                <s-stack direction="inline" alignItems="center" justifyContent="space-between">

                    {/* Breadcrumb title */}
                    <s-stack direction="inline" gap="small" alignItems="center">
                        <s-heading>Reward Rules</s-heading>
                        {showInputForm && (
                            <>
                                <s-heading>{">"}</s-heading>
                                <s-heading>{isEditing ? "Edit Rule" : "Create New Rule"}</s-heading>
                            </>
                        )}
                    </s-stack>

                    {/* Action buttons */}
                    <s-stack direction="inline" gap="base" alignItems="center">
                        {showInputForm ? (
                            <>
                                <s-button
                                    icon="minus-circle"
                                    onClick={handleToggleInputSection}
                                    disabled={!!loadingButton?.[isEditing ? "updateRule" : "addRule"]}
                                >
                                    Cancel
                                </s-button>
                                <s-button
                                    variant="primary"
                                    icon={isEditing ? "adjust" : "plus-circle"}
                                    loading={loadingButton?.[isEditing ? "updateRule" : "addRule"]}
                                    disabled={!hasChanges || !!loadingButton?.[isEditing ? "updateRule" : "addRule"]}
                                    onClick={() => handleSubmit(isEditing ? "updateRule" : "addRule")}
                                >
                                    {isEditing ? "Update Rule" : "Save New Rule"}
                                </s-button>
                            </>
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
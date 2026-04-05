

import { useAtom } from "jotai";
import { loaderDataAtom, actionDataAtom, emptyRuleAtom, toggleAtom, loadingButtonAtom } from "@atoms/pointsRule";
import { useEffect } from "react";
import { useSubmit } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

export default function CreatePointsRule() {
    const submit = useSubmit();
    const [toggle, setToggle] = useAtom(toggleAtom);
    const [emptyRule] = useAtom(emptyRuleAtom);
    const [newRule, setNewRule] = useAtom(emptyRuleAtom);
    const [loaderData] = useAtom(loaderDataAtom);
    const [actionData] = useAtom(actionDataAtom);
    const shopify = useAppBridge();
    const existingRuleEventIds = loaderData?.rules?.map(rule => rule.eventId) || [];
    const [loadingButton, setLoadingButton] = useAtom(loadingButtonAtom);


    useEffect(() => {
        if (actionData?.submitType === 'addRule') {
            shopify.toast.show(actionData?.message);
            setNewRule(emptyRule);
            setToggle(prev => ({ ...prev, addRule: false }));
            setLoadingButton(prev => ({ ...prev, addRule: false }));
        }
    }, [actionData]);


    const isOrderRelated = (eventId) => {
        const event = loaderData?.events?.find(s => s.id === parseInt(eventId));
        return event?.type?.toUpperCase() === "ORDER";
    };

    const handleToggleAddRule = () => {
        setNewRule(emptyRule);
        setToggle(prev => ({ ...prev, addRule: !prev.addRule }));
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

        submit({ submitType: "addRule", rule: JSON.stringify(newRule) }, { method: "post" });
    };
    return (toggle.addRule && (
        <s-section>
            <h3>Add New Points Rule</h3>
            <s-box paddingBlock="base"><s-divider /></s-box>

            <s-select
                label="Points event *"
                value={newRule.eventId}
                onChange={e => setNewRule(prev => ({ ...prev, eventId: e.target.value ? parseInt(e.target.value) : null }))}
            >
                <s-option value="">Select a Points event</s-option>
                {loaderData?.events.map(event => {
                    const isAdded = existingRuleEventIds.includes(event.id);
                    return (
                        <s-option key={event.id} value={event.id} disabled={isAdded}>
                            {event.name} ({event.type}) {isAdded ? "- Already Added" : ""}
                        </s-option>
                    )
                })}
            </s-select>

            <s-grid gridTemplateColumns="1fr 1fr" gap="base" paddingBlockStart="base">
                <s-text-field
                    label="Rule Name"
                    value={newRule.name}
                    onInput={e => setNewRule(prev => ({ ...prev, name: e.target.value }))}
                />
                <s-text-field
                    label="Priority"
                    type="number"
                    value={newRule.priority}
                    onInput={e => setNewRule(prev => ({ ...prev, priority: e.target.value }))}
                />
            </s-grid>

            <s-box paddingBlockEnd="large" />
            <s-text-area
                label="Description"
                value={newRule.description}
                onInput={e => setNewRule(prev => ({ ...prev, description: e.target.value }))}
            />

            <s-grid gridTemplateColumns="1fr 1fr" gap="base" paddingBlockStart="base">
                <s-text-field
                    label="Fixed Points"
                    type="number"
                    value={newRule.points}
                    onInput={e => setNewRule(prev => ({ ...prev, points: e.target.value }))}
                />
                <s-text-field
                    label="Multiplier"
                    type="number"
                    step="0.1"
                    value={newRule.multiplier}
                    onInput={e => setNewRule(prev => ({ ...prev, multiplier: e.target.value }))}
                />
            </s-grid>

            {isOrderRelated(newRule.eventId) && (
                <s-text-field
                    label="Minimum Order Amount"
                    type="number"
                    value={newRule.minAmount}
                    onInput={e => setNewRule(prev => ({ ...prev, minAmount: e.target.value }))}
                    placeholder="e.g. 50 (only for Order)"
                />
            )}

            <s-box paddingBlockEnd="large" />
            <s-switch
                label="Is Active"
                checked={newRule.isActive}
                onChange={e => setNewRule(prev => ({ ...prev, isActive: e.target.checked }))}
            />

            <s-stack direction="inline" gap="base" justifyContent="end" paddingBlockStart="base">
                <s-button onClick={handleToggleAddRule}>Cancel</s-button>
                <s-button
                    variant="primary"
                    onClick={() => handleSaveRule()}
                    disabled={loadingButton.addRule || !newRule.eventId || (newRule.points < 0) || (newRule.multiplier <= 0) || (newRule.priority < 0) || newRule.name.trim() === ""}
                    loading={loadingButton.addRule}
                >
                    Save Rule
                </s-button>
            </s-stack>
        </s-section>
    ))
}
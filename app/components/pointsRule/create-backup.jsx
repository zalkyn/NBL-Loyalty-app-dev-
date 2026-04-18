
import { useAtom } from "jotai";
import {
    loaderDataAtom,
    actionDataAtom,
    emptyNewRule,
    conditionsAtom,
    toggleAtom,
    loadingButtonAtom,
    newRuleAtom,
} from "@atoms/pointsRule";
import { useEffect, useMemo } from "react";
import { useSubmit } from "react-router";
import OrderConditionCreateForm from "./order/create";
import FixedPoints from "@components/pointsRule/fixedPoints"
import EventType from "./eventType"

export default function CreatePointsRule() {
    const submit = useSubmit();
    const [toggle, setToggle] = useAtom(toggleAtom);

    const [loaderData] = useAtom(loaderDataAtom);
    const [actionData] = useAtom(actionDataAtom);
    const [loadingButton, setLoadingButton] = useAtom(loadingButtonAtom);

    const [newRule, setNewRule] = useAtom(newRuleAtom);
    const [conditions] = useAtom(conditionsAtom);

    useEffect(() => {
        if (actionData?.submitType === 'addRule') {
            shopify.toast.show(actionData?.message);
            setNewRule(emptyNewRule);
            setToggle(prev => ({ ...prev, addRule: false }));
            setLoadingButton(prev => ({ ...prev, addRule: false }));
        }
    }, [actionData]);

    const event = useMemo(() => {
        const event = loaderData?.events?.find(s => s.id === parseInt(newRule.eventId));
        return event?.type?.toUpperCase();
    }, [newRule.eventId, loaderData?.events]);


    const handleToggleAddRule = () => {
        setNewRule(emptyNewRule);
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
        const _conditions = conditions || null;

        submit({
            submitType: "addRule",
            rule: JSON.stringify(newRule),
            conditions: JSON.stringify(_conditions)
        }, { method: "post" });
    };


    const renderEventConditionForm = () => {
        switch (event) {
            case "CREATE ORDER":
                return <OrderConditionCreateForm />;

            case "UPDATE ORDER":
                return <UpdateOrderForm />;

            case "DELETE ORDER":
                return <DeleteOrderForm />;

            default:
                return <FixedPoints />;
        }
    };


    return (<s-box>
        {toggle?.addRule && <s-grid gridTemplateColumns="2fr 1fr" gap="base">
            <s-box>
                {/* <pre>{JSON.stringify(conditions, null, 2)}</pre> */}

                {/* Event Type */}
                <s-box paddingBlockEnd="base">
                    <EventType />
                </s-box>

                {/* Event specific condition inputs */}
                <s-box paddingBlockEnd="base">
                    {renderEventConditionForm()}
                </s-box>


                <s-section>
                    <s-heading>Description (Optional)</s-heading>
                    <s-box paddingBlockEnd="small" />
                    <s-text-area
                        label="Description"
                        labelAccessibilityVisibility="exclusive"
                        placeholder="Description about this event"
                        value={newRule.description}
                        onInput={e => setNewRule(prev => ({ ...prev, description: e.target.value }))}
                    />
                </s-section>

                <s-stack direction="inline" gap="base" justifyContent="end" paddingBlockStart="base">
                    <s-button onClick={handleToggleAddRule}>Cancel</s-button>
                    <s-button
                        variant="primary"
                        onClick={() => handleSaveRule()}
                        disabled={loadingButton.addRule || !newRule.eventId}
                        loading={loadingButton.addRule}
                    >
                        Save Rule
                    </s-button>
                </s-stack>
            </s-box>
            <s-box>
                <s-section>
                    <s-heading>Summary</s-heading>

                </s-section>
                <s-box paddingBlockEnd="base" />
                <s-section>
                    <s-heading>Active Status</s-heading>
                    <s-box paddingBlockEnd="small" />
                    <s-switch
                        labelAccessibilityVisibility="exclusion"
                        label={newRule.isActive ? "Active" : "Inactive"}
                        checked={newRule.isActive}
                        onChange={e => setNewRule(prev => ({ ...prev, isActive: e.target.checked }))}
                    />
                </s-section>
            </s-box>
        </s-grid>}
    </s-box>)
}
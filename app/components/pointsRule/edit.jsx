import { useAtom } from "jotai";
import { selectedRuleAtom, actionDataAtom, loaderDataAtom, loadingButtonAtom } from "@atoms/pointsRule";
import { useEffect } from "react";
import { useSubmit } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

export default function EditPointsRule() {

    const [actionData] = useAtom(actionDataAtom);
    const [loaderData] = useAtom(loaderDataAtom);
    const [selectedRule, setSelectedRule] = useAtom(selectedRuleAtom);
    const submit = useSubmit();
    const shopify = useAppBridge()
    const [loadingButton, setLoadingButton] = useAtom(loadingButtonAtom);

    const existingRuleEventIds = loaderData?.existingRuleEventIds || [];

    const isOrderRelated = (eventId) => {
        const event = loaderData?.events?.find(s => s.id === parseInt(eventId));
        return event?.type?.toUpperCase() === "ORDER";
    };

    const handleUpdateRule = () => {
        setLoadingButton(prev => ({ ...prev, updateRule: true }));
        submit({ submitType: "updateRule", rule: JSON.stringify(selectedRule) }, { method: "post" });
    };

    useEffect(() => {
        if (actionData?.submitType === 'updateRule') {
            shopify.toast.show(actionData?.message);
            setSelectedRule(null);
            setLoadingButton(prev => ({ ...prev, updateRule: false }));
        }

    }, [actionData])
    return (
        <s-modal id="edit-modal" heading="Edit Points Rule" size="base">
            {selectedRule && (
                <>
                    <s-select
                        label="Points event *"
                        value={selectedRule.eventId || ""}
                        onChange={e => setSelectedRule(prev => ({ ...prev, eventId: e.target.value }))}
                        disabled
                    >
                        {loaderData?.events?.map(event => {
                            const isAdded = existingRuleEventIds.includes(event.id) && event.id !== selectedRule.eventId;
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
                            value={selectedRule.name || ""}
                            onInput={e => setSelectedRule(prev => ({ ...prev, name: e.target.value }))}
                        />
                        <s-text-field
                            label="Priority"
                            type="number"
                            value={selectedRule.priority || 0}
                            onInput={e => setSelectedRule(prev => ({ ...prev, priority: e.target.value }))}
                        />
                    </s-grid>

                    <s-box paddingBlockEnd="base" />
                    <s-text-area
                        label="Description"
                        value={selectedRule?.description || ""}
                        onInput={e => setSelectedRule(prev => ({ ...prev, description: e.target.value }))}
                    />

                    <s-grid gridTemplateColumns="1fr 1fr" gap="base" paddingBlockStart="base">
                        <s-text-field
                            label="Fixed Points"
                            type="number"
                            value={selectedRule.points || ""}
                            onInput={e => setSelectedRule(prev => ({ ...prev, points: e.target.value }))}
                        />
                        <s-text-field
                            label="Multiplier"
                            type="number"
                            step="0.1"
                            value={selectedRule.multiplier || ""}
                            onInput={e => setSelectedRule(prev => ({ ...prev, multiplier: e.target.value }))}
                        />
                    </s-grid>


                    {isOrderRelated(selectedRule.eventId) && (
                        <s-box paddingBlockStart="base">
                            <s-text-field
                                label="Minimum Order Amount"
                                type="number"
                                value={selectedRule.minAmount || ""}
                                onInput={e => setSelectedRule(prev => ({ ...prev, minAmount: e.target.value }))}
                            />
                        </s-box>
                    )}

                    <s-box paddingBlockEnd="base" />
                    <s-switch
                        label="Is Active"
                        checked={selectedRule.isActive ?? true}
                        onChange={e => setSelectedRule(prev => ({ ...prev, isActive: e.target.checked }))}
                    />

                    <s-stack direction="inline" gap="base" justifyContent="end" paddingBlockStart="base">
                        <s-button commandFor="edit-modal" command="--hide">Cancel</s-button>
                        <s-button
                            variant="primary"
                            onClick={handleUpdateRule}
                            loading={loadingButton.updateRule}
                            commandFor="edit-modal"
                            command="--hide"
                        >
                            Save Changes
                        </s-button>
                    </s-stack>
                </>
            )}
        </s-modal>
    );
}
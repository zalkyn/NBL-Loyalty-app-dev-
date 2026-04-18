import {
    newRuleAtom,
    loaderDataAtom,
    actionTypeAtom,
    conditionsAtom
} from "@atoms/pointsRule"
import { useAtom } from "jotai"

export default function EventType() {
    const [loaderData] = useAtom(loaderDataAtom);
    const [newRule, setNewRule] = useAtom(newRuleAtom);
    const [actionType] = useAtom(actionTypeAtom);
    const [conditions, setConditions] = useAtom(conditionsAtom);
    const existingRuleEventIds = loaderData?.rules?.map(rule => rule.eventId) || [];

    const getEvent = (eventId) => {
        const event = loaderData?.events?.find(s => s.id === parseInt(eventId));
        return event;
    };

    const handleEvent = (e) => {
        const eventId = Number(e.target.value);
        const event = getEvent(eventId);

        if (event?.type === 'CREATE ORDER') {
            setConditions(prev => {
                return {
                    ...prev,
                    earning: {
                        ...prev.earning,
                        type: 'incremental'
                    }
                }
            })
        } else {
            setConditions(prev => {
                return {
                    ...prev,
                    earning: {
                        ...prev.earning,
                        type: 'fixed'
                    }
                }
            })
        }
        setNewRule(prev => ({ ...prev, eventId: eventId ? eventId : null }))
    }

    return (
        <s-box>
            <s-section>
                <s-heading>Select Points Event (Required)</s-heading>
                <s-box paddingBlockEnd="small" />
                <s-select
                    disabled={actionType === 'edit'}
                    label="Points event *"
                    labelAccessibilityVisibility="exclusive"
                    value={newRule.eventId}
                    onChange={(e) => handleEvent(e)}
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
            </s-section>
        </s-box>
    );
}
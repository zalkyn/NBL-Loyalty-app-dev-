import { useAtom } from "jotai";
import {
    loaderDataAtom,
    selectedRuleAtom,
    newRuleAtom, toggleAtom,
    actionTypeAtom,
    conditionsAtom
} from "@atoms/pointsRule";

export default function ShowPointsRule() {

    const [loaderData] = useAtom(loaderDataAtom);
    const [, setSelectedRule] = useAtom(selectedRuleAtom);
    const [newRule, setNewRule] = useAtom(newRuleAtom);
    const [, setConditions] = useAtom(conditionsAtom);
    const [toggle, setToggle] = useAtom(toggleAtom);
    const [actionType, setActionType] = useAtom(actionTypeAtom);


    const getEventName = (eventId) => {
        const event = loaderData?.events?.find(s => s.id === parseInt(eventId));
        return event ? event.name : "Unknown Event";
    };

    const handleToggleAddRule = (rule) => {
        setActionType('edit')
        setSelectedRule({ ...rule })
        setNewRule({
            ...newRule,
            id: rule?.id,
            name: rule?.name,
            eventId: rule?.eventId,
            isActive: rule?.isActive,
            description: rule?.description
        })
        setConditions(rule?.conditions)
        setToggle(prev => {
            return {
                ...prev, addRule: !prev.addRule
            }
        })
    };

    return (!toggle.addRule && (
        <s-section>

            <s-table>
                <s-table-header-row>
                    <s-table-header>Rule</s-table-header>
                    <s-table-header>Event</s-table-header>
                    <s-table-header>Points</s-table-header>
                    <s-table-header>Active</s-table-header>
                    <s-table-header>Actions</s-table-header>
                </s-table-header-row>
                <s-table-body>
                    {loaderData?.rules?.length === 0 ? (
                        <s-table-row>
                            <s-table-cell colSpan="9" style={{ textAlign: "center", padding: "3rem" }}>
                                No rules created yet. Click "Add New Rule" above.
                            </s-table-cell>
                        </s-table-row>
                    ) : loaderData?.rules?.map(rule => (
                        <s-table-row key={rule.id}>
                            <s-table-cell>{getEventName(rule.eventId)}</s-table-cell>
                            <s-table-cell>{rule.event?.type || "—"}</s-table-cell>
                            <s-table-cell>{rule.points || "—"}</s-table-cell>
                            <s-table-cell>{rule.isActive ? "✅ Yes" : "❌ No"}</s-table-cell>
                            <s-table-cell>
                                <s-stack gap="small" direction="inline">
                                    <s-button
                                        variant="text"
                                        size="small"
                                        icon="edit"
                                        onClick={() => handleToggleAddRule(rule)}
                                    />
                                    <s-button
                                        variant="text"
                                        size="small"
                                        icon="delete"
                                        destructive
                                        onClick={() => setSelectedRule(rule)}
                                        commandFor="delete-modal"
                                        command="--show"
                                    />
                                </s-stack>
                            </s-table-cell>
                        </s-table-row>
                    ))}
                </s-table-body>
            </s-table>
        </s-section>
    ));
};
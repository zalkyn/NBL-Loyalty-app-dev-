import { useAtom } from "jotai";
import { loaderDataAtom, toggleAtom, selectedRuleAtom } from "@atoms/pointsRule";

export default function ShowPointsRule() {

    const [toggle] = useAtom(toggleAtom);
    const [loaderData] = useAtom(loaderDataAtom);
    const [selectedRule, setSelectedRule] = useAtom(selectedRuleAtom);


    const getEventName = (eventId) => {
        const event = loaderData?.events?.find(s => s.id === parseInt(eventId));
        return event ? event.name : "Unknown Event";
    };

    return (!toggle.addRule && (
        <s-section>

            <s-table>
                <s-table-header-row>
                    <s-table-header>Points event</s-table-header>
                    <s-table-header>Event Type</s-table-header>
                    <s-table-header>Rule Name</s-table-header>
                    <s-table-header>Points</s-table-header>
                    <s-table-header>Multiplier</s-table-header>
                    <s-table-header>Min Amount</s-table-header>
                    <s-table-header>Priority</s-table-header>
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
                            <s-table-cell><strong>{rule?.event?.type}</strong></s-table-cell>
                            <s-table-cell>{rule.name || "—"}</s-table-cell>
                            <s-table-cell>{rule.points || "—"}</s-table-cell>
                            <s-table-cell>{rule.multiplier || "—"}</s-table-cell>
                            <s-table-cell>{rule.minAmount || "—"}</s-table-cell>
                            <s-table-cell>{rule.priority}</s-table-cell>
                            <s-table-cell>{rule.isActive ? "✅ Yes" : "❌ No"}</s-table-cell>
                            <s-table-cell>
                                <s-stack gap="small" direction="inline">
                                    <s-button
                                        variant="text"
                                        size="small"
                                        icon="edit"
                                        onClick={() => setSelectedRule({ ...rule })}
                                        commandFor="edit-modal"
                                        command="--show"
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
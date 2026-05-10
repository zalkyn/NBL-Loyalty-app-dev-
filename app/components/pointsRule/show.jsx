import { useAtom } from "jotai";
import {
    loaderDataAtom,
    selectedRuleAtom,
    newRuleAtom,
    toggleAtom,
    actionTypeAtom,
    conditionsAtom,
    savedRuleAtom,
    savedConditionsAtom,
    emptyConditions,
} from "@atoms/pointsRule";

import { usePagination } from "@app/hooks/pagination/usePagination";
import Pagination from "@components/pagination/Pagination";


// ─── Helpers ─────────────────────────────────────────────────────────────────

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}


// ─── Component ───────────────────────────────────────────────────────────────

export default function ShowPointsRule() {
    const [loaderData] = useAtom(loaderDataAtom);
    const [, setSelectedRule] = useAtom(selectedRuleAtom);
    const [newRule, setNewRule] = useAtom(newRuleAtom);
    const [, setConditions] = useAtom(conditionsAtom);
    const [toggle, setToggle] = useAtom(toggleAtom);
    const [, setActionType] = useAtom(actionTypeAtom);
    const [, setSavedRule] = useAtom(savedRuleAtom);
    const [, setSavedConditions] = useAtom(savedConditionsAtom);

    const isLoading = !loaderData;
    const rules = loaderData?.rules ?? [];
    const pagination = usePagination(rules, 10);

    // ── Helpers ───────────────────────────────────────────────────────────────

    function getEventName(eventId) {
        return loaderData?.events?.find(e => e.id === parseInt(eventId))?.name ?? "Unknown Event";
    }

    // ── Handlers ─────────────────────────────────────────────────────────────

    function handleEditClick(rule) {
        const editRule = {
            ...newRule,
            id: rule.id,
            name: rule.name,
            eventId: rule.eventId,
            isActive: rule.isActive,
            description: rule.description,
        };
        const editConditions = rule.conditions ?? emptyConditions;

        setActionType("edit");
        setSelectedRule({ ...rule });
        setNewRule(editRule);
        setConditions(editConditions);

        // Deep clone so future atom updates don't corrupt the snapshot.
        setSavedRule(deepClone(editRule));
        setSavedConditions(deepClone(editConditions));

        setToggle(prev => ({ ...prev, addRule: true }));
    }

    function handleDeleteClick(rule) {
        setSelectedRule(rule);
    }

    // ── Render ────────────────────────────────────────────────────────────────

    if (toggle.addRule) return null;

    return (
        <s-section>
            {isLoading ? (
                <s-stack direction="inline" justifyContent="center" padding="base">
                    <s-spinner />
                </s-stack>
            ) : (
                <>
                    <s-table>
                        <s-table-header-row>
                            <s-table-header>Rule</s-table-header>
                            <s-table-header>Event</s-table-header>
                            <s-table-header>Points</s-table-header>
                            <s-table-header>Active</s-table-header>
                            <s-table-header>Actions</s-table-header>
                        </s-table-header-row>
                        <s-table-body>
                            {pagination.paginatedData.length === 0 ? (
                                <s-table-row>
                                    <s-table-cell colSpan="5" style={{ textAlign: "center", padding: "3rem" }}>
                                        No rules created yet. Click "Add New Rule" above.
                                    </s-table-cell>
                                </s-table-row>
                            ) : pagination.paginatedData.map(rule => (
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
                                                onClick={() => handleEditClick(rule)}
                                            />
                                            <s-button
                                                variant="text"
                                                size="small"
                                                icon="delete"
                                                destructive
                                                onClick={() => handleDeleteClick(rule)}
                                                commandFor="delete-modal"
                                                command="--show"
                                            />
                                        </s-stack>
                                    </s-table-cell>
                                </s-table-row>
                            ))}
                        </s-table-body>
                    </s-table>

                    <Pagination {...pagination} label="rules" />
                </>
            )}
        </s-section>
    );
}
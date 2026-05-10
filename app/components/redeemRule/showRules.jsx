import { useAtom } from "jotai";
import {
    loaderDataAtom,
    selectedRuleAtom,
    newRuleAtom,
    toggleAtom,
    actionTypeAtom,
    savedRuleAtom,
} from "@atoms/redeemRule";

import { usePagination } from "@app/hooks/pagination/usePagination";
import Pagination from "@components/pagination/Pagination";


// ─── Helpers ─────────────────────────────────────────────────────────────────

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function resolveRuleTitle(title, discountType, rewardValue) {
    if (!title) return title;
    const formatted = discountType === "percentage"
        ? `${rewardValue}% off`
        : `$${rewardValue}`;
    return title.replace(/\{\{currency_value\}\}/gi, formatted);
}

function formatDiscountValue(discountType, rewardValue) {
    return discountType === "fixed" ? `$${rewardValue}` : `${rewardValue}%`;
}


// ─── Component ───────────────────────────────────────────────────────────────

export default function ShowRules() {
    const [data] = useAtom(loaderDataAtom);
    const [, setSelected] = useAtom(selectedRuleAtom);
    const [, setNewRule] = useAtom(newRuleAtom);
    const [, setToggle] = useAtom(toggleAtom);
    const [, setActionType] = useAtom(actionTypeAtom);
    const [, setSavedRule] = useAtom(savedRuleAtom);

    const isLoading = !data;
    const rewards = data?.rewards ?? [];
    const pagination = usePagination(rewards, 10);

    // ── Handlers ─────────────────────────────────────────────────────────────

    function handleEditClick(rule) {
        setSelected(rule);
        setNewRule(rule);
        // Deep clone so edits don't corrupt the snapshot used for hasChanges.
        setSavedRule(deepClone(rule));
        setToggle(prev => ({ ...prev, inputSection: true }));
        setActionType("edit");
    }

    function handleDeleteClick(rule) {
        setSelected(rule);
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <s-box>
            <s-section>
                {isLoading ? (
                    <s-stack direction="inline" justifyContent="center" padding="base">
                        <s-spinner />
                    </s-stack>
                ) : (
                    <>
                        <s-table>
                            <s-table-header-row>
                                <s-table-header>Title</s-table-header>
                                <s-table-header>Points</s-table-header>
                                <s-table-header>Discount Type</s-table-header>
                                <s-table-header>Discount Value</s-table-header>
                                <s-table-header>Active</s-table-header>
                                <s-table-header>Actions</s-table-header>
                            </s-table-header-row>
                            <s-table-body>
                                {pagination.paginatedData.length === 0 ? (
                                    <s-table-row>
                                        <s-table-cell colSpan="6" style={{ textAlign: "center", padding: "3rem" }}>
                                            No rules created yet. Click "Create New Rule" above.
                                        </s-table-cell>
                                    </s-table-row>
                                ) : pagination.paginatedData.map(rule => (
                                    <s-table-row key={rule.id}>
                                        <s-table-cell>
                                            <s-heading>
                                                {resolveRuleTitle(rule.title, rule.discountType, rule.rewardValue)}
                                            </s-heading>
                                        </s-table-cell>
                                        <s-table-cell>
                                            <s-text>{rule.pointsCost} points</s-text>
                                        </s-table-cell>
                                        <s-table-cell>
                                            <s-text>{rule.discountType}</s-text>
                                        </s-table-cell>
                                        <s-table-cell>
                                            <s-text>{formatDiscountValue(rule.discountType, rule.rewardValue)}</s-text>
                                        </s-table-cell>
                                        <s-table-cell>
                                            {rule.isActive ? "✅ Yes" : "❌ No"}
                                        </s-table-cell>
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
                                                    commandFor="delete-reward-modal"
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
        </s-box>
    );
}
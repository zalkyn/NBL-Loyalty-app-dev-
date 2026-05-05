import {
    loaderDataAtom,
    selectedRuleAtom,
    newRuleAtom,
    toggleAtom,
    actionTypeAtom
} from "@atoms/redeemRule";

import { useAtom } from "jotai";

export default function ShowRules() {
    const [data] = useAtom(loaderDataAtom);
    const [, setSelected] = useAtom(selectedRuleAtom);
    const [, setNewRule] = useAtom(newRuleAtom)
    const [, setToggle] = useAtom(toggleAtom);
    const [, setActionType] = useAtom(actionTypeAtom)

    const rewards = data?.rewards || [];
    return (<s-box>
        <s-section>
            <s-table>
                <s-table-header-row>
                    <s-table-header>Title</s-table-header>
                    <s-table-header>Points</s-table-header>
                    <s-table-header>Discount type</s-table-header>
                    <s-table-header>Discount value</s-table-header>
                    <s-table-header>Active</s-table-header>
                    <s-table-header>Actions</s-table-header>
                </s-table-header-row>
                <s-table-body>
                    {rewards?.length === 0 ? (
                        <s-table-row>
                            <s-table-cell colSpan="9" style={{ textAlign: "center", padding: "3rem" }}>
                                No rules created yet. Click "Add New Rule" above.
                            </s-table-cell>
                        </s-table-row>
                    ) : rewards?.map(rule => (
                        <s-table-row key={rule.id}>
                            <s-table-cell>
                                <s-heading>{rule?.title?.replace("{{currency_value}}", `${rule?.discountType === 'fixed' ? '$' : ''}${rule?.rewardValue}${rule?.discountType === 'fixed' ? '' : '%'}`)}</s-heading>
                            </s-table-cell>
                            <s-table-cell>
                                <s-text>{rule?.pointsCost} points</s-text>
                            </s-table-cell>
                            <s-table-cell>
                                <s-text>{rule?.discountType}</s-text>
                            </s-table-cell>
                            <s-table-cell>
                                <s-text>{rule?.discountType === 'fixed' ? '$' : ''}{rule?.rewardValue}{rule?.discountType === 'fixed' ? '' : '%'}</s-text>
                            </s-table-cell>
                            <s-table-cell>{rule.isActive ? "✅ Yes" : "❌ No"}</s-table-cell>
                            <s-table-cell>
                                <s-stack gap="small" direction="inline">
                                    <s-button
                                        type="button"
                                        variant="text"
                                        size="small"
                                        icon="edit"
                                        onClick={() => {
                                            setSelected(rule);
                                            setNewRule(rule);
                                            setToggle(prev => {
                                                return {
                                                    ...prev, inputSection: true
                                                }
                                            })
                                            setActionType('edit')
                                        }}
                                    />
                                    <s-button
                                        variant="text"
                                        size="small"
                                        icon="delete"
                                        destructive
                                        onClick={() => {
                                            setSelected(rule);
                                        }}
                                        commandFor="delete-reward-modal"
                                        command="--show"
                                    />
                                </s-stack>
                            </s-table-cell>
                        </s-table-row>
                    ))}
                </s-table-body>
            </s-table>
        </s-section>
    </s-box>)
}
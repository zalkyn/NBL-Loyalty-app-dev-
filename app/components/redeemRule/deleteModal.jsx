import { useAtom } from "jotai";
import { selectedRuleAtom, actionDataAtom, loadingButtonAtom } from "@atoms/redeemRule";
import { useEffect } from "react";
import { useSubmit } from "react-router";

export default function DeleteRewardRule() {
    const submit = useSubmit();
    const [actionData, setActionData] = useAtom(actionDataAtom);
    const [selectedRule, setSelectedRule] = useAtom(selectedRuleAtom);
    const [loadingButton, setLoadingButton] = useAtom(loadingButtonAtom);

    useEffect(() => {
        if (actionData?.submitType === 'deleteRule') {
            shopify.toast.show(actionData?.message);
            setSelectedRule(null);
            setLoadingButton(prev => ({ ...prev, deleteRule: false }));
        }
        setActionData(null);
    }, [actionData])

    const handleDeleteRule = () => {
        if (!selectedRule) {
            shopify.toast.show("No selected rule found!");
            return;
        };
        setLoadingButton(prev => ({ ...prev, deleteRule: true }));
        submit({ submitType: "deleteRule", ruleId: selectedRule.id }, { method: "post" });
    };

    return (<s-modal id="delete-reward-modal" heading="Delete Reward Rule" size="small">
        <s-paragraph color="subdued">Are you sure? This action cannot be undone.</s-paragraph>
        <s-button slot="secondary-actions" commandFor="delete-reward-modal" command="--hide">Cancel</s-button>
        <s-button
            slot="primary-action"
            variant="primary"
            destructive
            onClick={() => handleDeleteRule()}
            commandFor="delete-reward-modal"
            command="--hide"
            loading={loadingButton.deleteRule}
            disabled={loadingButton.deleteRule}
        >
            Yes, Delete
        </s-button>
    </s-modal>);
}
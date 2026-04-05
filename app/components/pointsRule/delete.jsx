import { useAtom } from "jotai";
import { selectedRuleAtom, actionDataAtom, loadingButtonAtom } from "@atoms/pointsRule";
import { useEffect } from "react";
import { useSubmit } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

export default function DeletePointsRule() {
    const [actionData] = useAtom(actionDataAtom);
    const [selectedRule, setSelectedRule] = useAtom(selectedRuleAtom);
    const submit = useSubmit();
    const shopify = useAppBridge()
    const [loadingButton, setLoadingButton] = useAtom(loadingButtonAtom);

    useEffect(() => {
        if (actionData?.submitType === 'deleteRule') {
            shopify.toast.show(actionData?.message);
            setSelectedRule(null);
            setLoadingButton(prev => ({ ...prev, deleteRule: false }));
        }

    }, [actionData])

    const handleDeleteRule = () => {
        if (!selectedRule) return;
        setLoadingButton(prev => ({ ...prev, deleteRule: true }));
        submit({ submitType: "deleteRule", ruleId: selectedRule.id }, { method: "post" });
    };

    return (<s-modal id="delete-modal" heading="Delete Points Rule" size="small">
        <s-paragraph color="subdued">Are you sure? This action cannot be undone.</s-paragraph>
        <s-button slot="secondary-actions" commandFor="delete-modal" command="--hide">Cancel</s-button>
        <s-button
            slot="primary-action"
            variant="primary"
            destructive
            onClick={handleDeleteRule}
            commandFor="delete-modal"
            command="--hide"
            loading={loadingButton.deleteRule}
            disabled={loadingButton.deleteRule}
        >
            Yes, Delete
        </s-button>
    </s-modal>);
}
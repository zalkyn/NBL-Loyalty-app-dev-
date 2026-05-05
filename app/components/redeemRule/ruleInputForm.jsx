import {
    toggleAtom,
    newRuleAtom,
    emptyNewRule,
    loadingButtonAtom,
    actionDataAtom,
} from "@atoms/redeemRule";

import { useAtom } from "jotai";
import { useEffect, useMemo } from "react";

import RewardType from "./rewardType"
import OrderDiscountInput from "./orderDiscountInput";
import ActiveStatus from "./activeStatus";
import DisplayTitle from "./displayTitle";
import Description from "./description";


export default function RuleInputForm() {
    const [actionData, setActionData] = useAtom(actionDataAtom);
    const [toggle, setToggle] = useAtom(toggleAtom);
    const [newRule, setNewRule] = useAtom(newRuleAtom);
    const [, setLoadingButton] = useAtom(loadingButtonAtom);

    useEffect(() => {
        if (actionData?.submitType === 'addRule') {
            shopify.toast.show(actionData?.message);
            setNewRule(emptyNewRule);
            setToggle(prev => ({ ...prev, inputSection: false }));
            setLoadingButton(prev => ({ ...prev, addRule: false }));
        } else if (actionData?.submitType === 'updateRule') {
            shopify.toast.show(actionData?.message);
            setNewRule(emptyNewRule);
            setToggle(prev => ({ ...prev, inputSection: false }));
            setLoadingButton(prev => ({ ...prev, updateRule: false }));
        }
        setActionData(null)
    }, [actionData]);

    const type = useMemo(() => {
        return newRule?.rewardType;
    }, [newRule?.rewardType])

    const handleDiscountInputByType = () => {
        switch (type) {
            case "orderDiscount":
                return <OrderDiscountInput />;

            default:
                return <s-box>Default</s-box>
        }
    }

    return toggle?.inputSection && (<s-box>
        <s-grid gridTemplateColumns="2fr 1fr" gap="base">
            <s-box>
                <RewardType />

                {handleDiscountInputByType()}

                <DisplayTitle />
                <Description />
            </s-box>
            <s-box>
                <s-section>
                    <s-heading>Summary</s-heading>
                </s-section>

                <s-box paddingBlockEnd="base" />
                <s-section>
                    <ActiveStatus />
                </s-section>
            </s-box>
        </s-grid>
    </s-box>)
}
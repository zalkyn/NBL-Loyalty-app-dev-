
import { useAtom } from "jotai";
import {
    loaderDataAtom,
    actionDataAtom,
    emptyNewRule,
    toggleAtom,
    loadingButtonAtom,
    newRuleAtom,
    actionTypeAtom,
} from "@atoms/pointsRule";
import { useEffect, useMemo } from "react";
import OrderConditionsForm from "./order/conditionsForm";
import ReferralConditionsForm from "./referral/conditionsForm"
import ReferralConditionsFormNew from "./referral/conditionsFormNew"
import ReviewConditionsForm from "./review/conditionsForm"
import FixedPoints from "@components/pointsRule/fixedPoints"
import EventType from "./eventType"
import ActiveStatus from "./activeStatus"
import Description from "./description"

export default function RulesForm() {
    const [toggle, setToggle] = useAtom(toggleAtom);

    const [loaderData] = useAtom(loaderDataAtom);
    const [actionData] = useAtom(actionDataAtom);
    const [, setLoadingButton] = useAtom(loadingButtonAtom);

    const [newRule, setNewRule] = useAtom(newRuleAtom);
    const [actionType] = useAtom(actionTypeAtom);

    useEffect(() => {
        if (actionData?.submitType === 'addRule') {
            shopify.toast.show(actionData?.message);
            setNewRule(emptyNewRule);
            setToggle(prev => ({ ...prev, addRule: false }));
            setLoadingButton(prev => ({ ...prev, addRule: false }));
        } else if (actionData?.submitType === 'updateRule') {
            shopify.toast.show(actionData?.message);
            setNewRule(emptyNewRule);
            setToggle(prev => ({ ...prev, addRule: false }));
            setLoadingButton(prev => ({ ...prev, addRule: false }));
        }
    }, [actionData]);

    const event = useMemo(() => {
        const event = loaderData?.events?.find(s => s.id === parseInt(newRule.eventId));
        return event?.type?.toUpperCase();
    }, [newRule.eventId, loaderData?.events]);


    const renderEventConditionForm = () => {
        switch (event) {
            case "ORDER":
                return <OrderConditionsForm />;
            case "REFERRAL":
                return <s-box>
                    <ReferralConditionsFormNew />
                    <s-divider />
                    {/* <ReferralConditionsForm /> */}
                </s-box>
            case "REVIEW":
                return <ReviewConditionsForm />;

            default:
                return <FixedPoints />;
        }
    };


    return (<s-box>
        {toggle?.addRule && <s-grid gridTemplateColumns="2fr 1fr" gap="base">
            <s-box>
                {/* Event Type */}
                {actionType !== 'edit' &&
                    <s-box paddingBlockEnd="base">
                        <EventType />
                    </s-box>
                }

                {/* Event specific condition inputs */}
                <s-box paddingBlockEnd="base">
                    {renderEventConditionForm()}
                </s-box>

                <Description />

            </s-box>
            <s-box>
                <s-section>
                    <s-heading>Summary</s-heading>

                </s-section>
                <s-box paddingBlockEnd="base" />
                <ActiveStatus />
            </s-box>
        </s-grid>}
    </s-box>)
}
import { useAtom } from "jotai";
import {
    newRuleAtom
} from "@atoms/redeemRule";


export default function DiscountType() {
    const [newRule, setNewRule] = useAtom(newRuleAtom);

    return (<s-box paddingBlockEnd="base">
        <s-section>
            <s-select
                label={`Discount Type (${newRule?.discountType})`}
                placeholder="Select discount type"
                value={newRule?.discountType}
                onInput={event => {
                    setNewRule(prev => {
                        return {
                            ...prev,
                            discountType: event.target.value
                        }
                    })
                }}
            >
                <s-option value="fixed">Fixed amount</s-option>
                <s-option value="percentage">Percentage Amount</s-option>
            </s-select>
        </s-section>
    </s-box>)
}
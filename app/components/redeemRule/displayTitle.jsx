import { useAtom } from "jotai";
import {
    newRuleAtom
} from "@atoms/redeemRule";


export default function DisplayTitle() {
    const [newRule, setNewRule] = useAtom(newRuleAtom);

    return (<s-box paddingBlockEnd="base">
        <s-section>
            <s-text-field
                label="Display Title"
                placeholder="Voucher $10"
                value={newRule?.title}
                details="Use {{currency_value}} to insert the formatted discount amount."
                onInput={event => {
                    setNewRule(prev => {
                        return {
                            ...prev,
                            title: event.target.value
                        }
                    })
                }}
            />
            {newRule?.title?.includes("{{currency_value}}") && <s-text>{newRule?.title?.replace("{{currency_value}}", `${newRule?.discountType === 'fixed' ? '$' : ''}${newRule?.rewardValue}${newRule?.discountType === 'fixed' ? '' : '%'}`)}</s-text>}
        </s-section>
    </s-box>)
}
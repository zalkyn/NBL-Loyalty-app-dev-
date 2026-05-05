import { useAtom } from "jotai";
import {
    newRuleAtom
} from "@atoms/redeemRule";


export default function DiscountValue() {
    const [newRule, setNewRule] = useAtom(newRuleAtom);

    return (<s-box paddingBlockEnd="base">
        <s-section>
            <s-number-field
                label="Value"
                placeholder="Discount value"
                suffix={newRule?.discountType === 'fixed' ? '' : '% '}
                prefix={newRule?.discountType === 'fixed' ? '$' : ''}
                step={1}
                min={0}
                value={newRule?.rewardValue}
                onInput={event => {
                    setNewRule(prev => {
                        return {
                            ...prev,
                            rewardValue: Number(event.target.value)
                        }
                    })
                }}
            />
        </s-section>
    </s-box>)
}
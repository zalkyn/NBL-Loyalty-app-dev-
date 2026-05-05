import { useAtom } from "jotai";
import {
    newRuleAtom
} from "@atoms/redeemRule";


export default function RewardType() {
    const [newRule, setNewRule] = useAtom(newRuleAtom);

    return (<s-box paddingBlockEnd="base">
        <s-section>
            <s-select
                label="Reward type"
                placeholder="Select reward type"
                value={newRule?.rewardType}
                onInput={event => {
                    setNewRule(prev => {
                        return {
                            ...prev,
                            rewardType: event.target.value
                        }
                    })
                }}
            >
                <s-option value="orderDiscount">Order Discount (discount the total order amount)</s-option>
                {/* <s-option value="productDiscount">Product Discount (percentage discount of a specific product)</s-option>
                <s-option value="freeProduct">Free Product (full discount of a specific product)</s-option>
                <s-option value="freeShipping">Free Shipping (offer free shipping on an order)</s-option> */}
            </s-select>
        </s-section>
    </s-box>)
}
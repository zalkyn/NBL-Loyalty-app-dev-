import { useAtom } from "jotai";
import {
    newRuleAtom
} from "@atoms/redeemRule";

import PointCost from "./pointCost";
import DiscountType from "./discountType";
import DiscountValue from "./discountValue";



export default function OrderDiscountInput() {
    const [newRule] = useAtom(newRuleAtom);

    return <s-box paddingBlockEnd="base">
        <s-section>
            <s-grid gridTemplateColumns="2fr 1fr" gap="base">
                <DiscountType />
                <DiscountValue />
            </s-grid>
            <PointCost />
        </s-section>
    </s-box>
}
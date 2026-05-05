import { useAtom } from "jotai";
import {
    newRuleAtom
} from "@atoms/redeemRule";


export default function PointCost() {
    const [newRule, setNewRule] = useAtom(newRuleAtom);

    return (<s-box paddingBlockEnd="base">
        <s-section>
            <s-number-field
                label="Points Cost"
                placeholder="Points Cost"
                value={newRule?.pointsCost}
                suffix="points"
                min={0}
                step={1}
                onInput={event => {
                    setNewRule(prev => {
                        return {
                            ...prev,
                            pointsCost: event.target.value
                        }
                    })
                }}
            />
        </s-section>
    </s-box>)
}
import {
    newRuleAtom
} from "@atoms/redeemRule"
import { useAtom } from "jotai"

export default function Description() {
    const [newRule, setNewRule] = useAtom(newRuleAtom)

    return (
        <s-box>
            <s-section>
                <s-text-area
                    label="Description"
                    labelAccessibilityVisibility="visible"
                    placeholder="Description about this reward rule"
                    value={newRule.description}
                    rows={3}
                    onInput={e => setNewRule(prev => ({ ...prev, description: e.target.value }))}
                />
            </s-section>
        </s-box>
    );
}
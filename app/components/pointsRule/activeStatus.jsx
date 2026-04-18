import {
    newRuleAtom
} from "@atoms/pointsRule"
import { useAtom } from "jotai"

export default function ActiveStatus() {
    const [newRule, setNewRule] = useAtom(newRuleAtom)

    return (
        <s-box>
            <s-section>
                <s-heading>Active Status</s-heading>
                <s-box paddingBlockEnd="small" />
                <s-switch
                    labelAccessibilityVisibility="exclusion"
                    label={newRule.isActive ? "Active" : "Inactive"}
                    checked={newRule.isActive}
                    onChange={e => setNewRule(prev => ({ ...prev, isActive: e.target.checked }))}
                />
            </s-section>
        </s-box>
    );
}
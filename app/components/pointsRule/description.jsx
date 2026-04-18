import {
    newRuleAtom
} from "@atoms/pointsRule"
import { useAtom } from "jotai"

export default function Description() {
    const [newRule, setNewRule] = useAtom(newRuleAtom)

    return (
        <s-box>
            <s-section>
                <s-heading>Description (Optional)</s-heading>
                <s-box paddingBlockEnd="small" />
                <s-text-area
                    label="Description"
                    labelAccessibilityVisibility="exclusive"
                    placeholder="Description about this event"
                    value={newRule.description}
                    onInput={e => setNewRule(prev => ({ ...prev, description: e.target.value }))}
                />
            </s-section>
        </s-box>
    );
}
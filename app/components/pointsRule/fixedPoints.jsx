import {
    conditionsAtom
} from "@atoms/pointsRule"
import { useAtom } from "jotai"

export default function FixedPoints() {
    const [conditions, setConditions] = useAtom(conditionsAtom)

    return (
        <s-box>
            <s-section>
                <s-heading>Earning Points</s-heading>
                <s-box paddingBlockEnd="small" />

                <s-number-field
                    label="Points"
                    labelAccessibilityVisibility="exclusive"
                    suffix="points"
                    value={conditions?.earning?.fixedPoints ?? ""}
                    onInput={(event) => {
                        const value = event.target.value
                            ? Number(event.target.value)
                            : 0;

                        setConditions(prev => ({
                            ...prev,
                            earning: {
                                ...prev.earning,
                                fixedPoints: value
                            }
                        }));
                    }}
                />
            </s-section>
        </s-box>
    );
}
import {
    conditionsAtom
} from "@atoms/pointsRule"
import { useAtom } from "jotai"

export default function EarningMethod() {
    const [conditions, setConditions] = useAtom(conditionsAtom)

    return (
        <s-box>
            <s-section>
                <s-heading>Earning Method</s-heading>

                <s-choice-list
                    label="Earning Method"
                    labelAccessibilityVisibility="exclusive"
                    name="earningMethod"
                    onInput={(e) => {
                        const value = e.currentTarget.values[0];

                        setConditions(prev => ({
                            ...prev,
                            earning: {
                                ...prev.earning,
                                type: value,

                                // reset default based on type
                                rate: value === "incremental"
                                    ? { amount: 10, points: 1 }
                                    : prev.earning.rate,

                                fixedPoints: value === "fixed"
                                    ? 10
                                    : prev.earning.fixedPoints
                            }
                        }));
                    }}
                >
                    <s-choice
                        value="incremental"
                        selected={conditions.earning.type === "incremental"}
                    >
                        Incremented Points (Recommended)
                    </s-choice>

                    <s-choice
                        value="fixed"
                        selected={conditions.earning.type === "fixed"}
                    >
                        Fixed Amount of Points
                    </s-choice>
                </s-choice-list>
            </s-section>
        </s-box>
    );
}
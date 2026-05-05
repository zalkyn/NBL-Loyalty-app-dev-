import { useAtom } from "jotai";
import { conditionsAtom } from "@atoms/pointsRule";

const earningOptions = [
    {
        value: "incremental",
        label: "Incremented Points (Recommended)",
    },
    {
        value: "fixed",
        label: "Fixed Amount of Points",
    },
];

export default function EarningMethod() {
    const [conditions, setConditions] = useAtom(conditionsAtom);

    const currentType = conditions?.earning?.type ?? "";

    const handleChange = (value) => {
        setConditions((prev) => ({
            ...prev,
            earning: {
                ...prev.earning,
                type: value,
                rate: value === "incremental"
                    ? { amount: 10, points: 1 }
                    : prev.earning.rate,
                fixedPoints: value === "fixed"
                    ? 10
                    : prev.earning.fixedPoints,
            },
        }));
    };

    return (
        <s-box>
            <s-section>
                <s-heading>Earning Method</s-heading>

                <s-choice-list
                    label="Earning Method"
                    labelAccessibilityVisibility="exclusive"
                    name="earningMethod"
                    value={[currentType]}
                    onInput={(e) => handleChange(e.currentTarget.values[0])}
                >
                    {earningOptions.map(({ value, label }) => (
                        <s-choice
                            key={value}
                            value={value}
                            selected={currentType === value}
                        >
                            {label}
                        </s-choice>
                    ))}
                </s-choice-list>
            </s-section>
        </s-box>
    );
}
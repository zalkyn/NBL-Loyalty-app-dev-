import { useAtom } from "jotai";
import { conditionsAtom } from "@atoms/pointsRule";

const appliesToOptions = [
    { value: "allProducts", label: "All Products" },
    { value: "specificProducts", label: "Specific Products" },
    // { value: "specificCollections", label: "Specific Collections" },
];

export default function AppliesType() {
    const [conditions, setConditions] = useAtom(conditionsAtom);

    const currentType = conditions?.appliesTo?.type ?? "";

    const handleChange = (value) => {
        setConditions((prev) => ({
            ...prev,
            appliesTo: {
                ...prev.appliesTo,
                type: value,
                products: [],
                collections: [],
            },
        }));
    };

    return (
        <s-box>
            <s-section>
                <s-heading>Applies To</s-heading>
                <s-box paddingBlockEnd="small" />

                <s-choice-list
                    name="appliesToType"
                    value={[currentType]}
                    onInput={(e) => handleChange(e.currentTarget.values[0])}
                >
                    {appliesToOptions.map(({ value, label }) => (
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
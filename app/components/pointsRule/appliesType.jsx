import {
    conditionsAtom
} from "@atoms/pointsRule"
import { useAtom } from "jotai"

export default function AppliesType() {
    const [conditions, setConditions] = useAtom(conditionsAtom);

    const handleChange = (value) => {
        setConditions(prev => ({
            ...prev,
            appliesTo: {
                ...prev.appliesTo,
                type: value,
                products: [],
                collections: []
            }
        }));
    };

    return (
        <s-box>
            <s-section>
                <s-heading>Applies To</s-heading>
                <s-box paddingBlockEnd="small" />

                <s-choice-list
                    name="appliesToType"
                    value={[conditions.appliesTo.type]}
                    onInput={(e) => {
                        const value = e.currentTarget.values[0];
                        handleChange(value);
                    }}
                >
                    <s-choice selected={conditions?.appliesTo?.type === 'allProducts' ? true : false} value="allProducts">
                        All Products
                    </s-choice>

                    <s-choice selected={conditions?.appliesTo?.type === 'specificProducts' ? true : false} value="specificProducts">
                        Specific Products
                    </s-choice>

                    {/* <s-choice selected={conditions?.appliesTo?.type === 'specificCollections' ? true : false} value="specificCollections">
                        Specific Collections
                    </s-choice> */}
                </s-choice-list>
            </s-section>
        </s-box>
    );
}
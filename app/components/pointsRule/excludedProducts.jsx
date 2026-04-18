import {
    conditionsAtom
} from "@atoms/pointsRule"
import { useAtom } from "jotai"

export default function ExcludedProducts() {
    const [conditions, setConditions] = useAtom(conditionsAtom)

    const resourcePicker = async () => {
        const selectionIds = conditions.appliesTo.excludedProducts.map(p => ({
            id: p.id
        }));

        const selected = await shopify.resourcePicker({
            type: "product",
            multiple: true,
            selectionIds,
            filter: {
                variants: false
            }
        });

        if (selected?.selection?.length > 0) {
            const selectedProducts = selected.selection.map(s => ({
                id: s.id,
                title: s.title,
                image: s.images?.[0]?.originalSrc,
                handle: s.handle
            }));

            setConditions(prev => ({
                ...prev,
                appliesTo: {
                    ...prev.appliesTo,
                    excludedProducts: selectedProducts
                }
            }));
        }
    };

    const removeProduct = (id) => {
        setConditions(prev => ({
            ...prev,
            appliesTo: {
                ...prev.appliesTo,
                excludedProducts: prev.appliesTo.excludedProducts.filter(p => p.id !== id)
            }
        }));
    };

    return (
        <s-box>
            <s-section>
                <s-heading>Skip Earnings for Products (Optional)</s-heading>
                <s-text>
                    When any of these products are in the order, no earnings will be granted
                </s-text>

                <s-box paddingBlockEnd="base" />

                <s-stack direction="inline" gap="base" alignItems="center">
                    <s-button variant="primary" onClick={resourcePicker}>
                        Select Excluded Products (optional)
                    </s-button>

                    {conditions.appliesTo.excludedProducts.length > 0 && (
                        <s-text>
                            {conditions.appliesTo.excludedProducts.length} product(s) selected
                        </s-text>
                    )}
                </s-stack>

                <s-box paddingBlockEnd="base" />

                <s-ordered-list>
                    {conditions.appliesTo.excludedProducts.map(product => (
                        <s-list-item key={product.id}>
                            <s-grid
                                gridTemplateColumns="1fr 50px"
                                gap="base"
                                alignItems="center"
                            >
                                <s-stack direction="inline" gap="base" alignItems="center">
                                    <s-text>{product.title}</s-text>
                                </s-stack>

                                <s-button
                                    icon="delete"
                                    variant="text"
                                    onClick={() => removeProduct(product.id)}
                                />
                            </s-grid>
                        </s-list-item>
                    ))}
                </s-ordered-list>
            </s-section>
        </s-box>
    );
}
import { conditionsAtom } from "@atoms/pointsRule";
import { useAtom } from "jotai";

export default function ResourceSelector({
    label = "Select Resources",
    info = "When any of these products are in the order, no earnings will be granted",
    resourceType = "product", // "product" | "collection"
    field = "products" // "products" | "collections" | "excludedProducts"
}) {
    const [conditions, setConditions] = useAtom(conditionsAtom);

    const list = conditions.appliesTo[field] || [];

    const resourcePicker = async () => {
        const selectionIds = list.map(item => ({ id: item.id }));

        const selected = await shopify.resourcePicker({
            type: resourceType,
            multiple: true,
            selectionIds,
            filter: {
                variants: false
            }
        });

        if (selected?.selection?.length > 0) {
            const mapped = selected.selection.map(s => ({
                id: s.id,
                title: s.title,
                image: s.image?.originalSrc || s.images?.[0]?.originalSrc,
                handle: s.handle
            }));

            setConditions(prev => ({
                ...prev,
                appliesTo: {
                    ...prev.appliesTo,
                    [field]: mapped
                }
            }));
        }
    };

    const removeItem = (id) => {
        setConditions(prev => ({
            ...prev,
            appliesTo: {
                ...prev.appliesTo,
                [field]: prev.appliesTo[field].filter(item => item.id !== id)
            }
        }));
    };

    return (
        <s-box>
            <s-section>
                <s-heading>{label}</s-heading>
                <s-text>{info}</s-text>

                <s-box paddingBlockEnd="base" />

                <s-stack direction="inline" gap="base" alignItems="center">
                    <s-button variant="primary" onClick={resourcePicker}>
                        Select {resourceType}s
                    </s-button>

                    {list.length > 0 && (
                        <s-text>{list.length} {field} selected</s-text>
                    )}
                </s-stack>

                <s-box paddingBlockEnd="base" />

                <s-ordered-list>
                    {list.map(item => (
                        <s-list-item key={item.id}>
                            <s-grid
                                gridTemplateColumns="1fr 50px"
                                gap="base"
                                alignItems="center"
                            >
                                <s-stack direction="inline" gap="base" alignItems="center">
                                    <s-text>{item.title}</s-text>
                                </s-stack>

                                <s-button
                                    icon="delete"
                                    variant="text"
                                    onClick={() => removeItem(item.id)}
                                />
                            </s-grid>
                        </s-list-item>
                    ))}
                </s-ordered-list>
            </s-section>
        </s-box>
    );
}
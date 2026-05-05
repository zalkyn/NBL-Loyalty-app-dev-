import { useAtom } from "jotai";
import { conditionsAtom } from "@atoms/pointsRule";

const reviewTypes = [
    { key: "text", label: "Text Review" },
    { key: "image", label: "Image Review" },
    { key: "video", label: "Video Review" },
];

export default function ReviewConditionsForm() {
    const [conditions, setConditions] = useAtom(conditionsAtom);

    const updatePoints = (type) => (event) => {
        const value = event.target.value ? Number(event.target.value) : 0;

        setConditions((prev) => ({
            ...prev,
            review: {
                ...prev.review,
                [type]: value,
            },
        }));
    };

    return (
        <s-box>
            {reviewTypes.map(({ key, label }) => (
                <div key={key}>
                    <s-section>
                        <s-heading>{label}</s-heading>
                        <s-box paddingBlockEnd="small" />

                        <s-number-field
                            label="Points"
                            labelAccessibilityVisibility="exclusive"
                            suffix="points"
                            value={conditions?.review?.[key] ?? ""}
                            onInput={updatePoints(key)}
                        />
                    </s-section>

                    {key !== "video" && <s-box paddingBlockEnd="base" />}
                </div>
            ))}
        </s-box>
    );
}
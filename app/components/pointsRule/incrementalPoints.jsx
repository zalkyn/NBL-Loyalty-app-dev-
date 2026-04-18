import {
    conditionsAtom
} from "@atoms/pointsRule"
import { useAtom } from "jotai"

export default function IncrementalPoints() {
    const [conditions, setConditions] = useAtom(conditionsAtom);

    return (
        <s-box>
            <s-section>
                <s-heading>Earning Points</s-heading>
                <s-box paddingBlockEnd="small" />

                <s-grid
                    gridTemplateColumns={
                        conditions.earning.type === "incremental"
                            ? "1fr auto 1fr"
                            : "1fr"
                    }
                    gap="large"
                    alignItems="center"
                >
                    {/* Points */}
                    <s-number-field
                        value={conditions?.earning?.rate?.points ?? ""}
                        suffix="points"
                        step={1}
                        min={1}
                        onInput={(event) => {
                            const value = event.target.value
                                ? Number(event.target.value)
                                : 0;

                            setConditions(prev => ({
                                ...prev,
                                earning: {
                                    ...prev.earning,
                                    rate: {
                                        ...prev.earning.rate,
                                        points: value
                                    }
                                }
                            }));
                        }}
                    />

                    <s-text>for every</s-text>

                    {/* Amount */}
                    <s-number-field
                        value={conditions?.earning?.rate?.amount ?? ""}
                        suffix="spent"
                        prefix="$"
                        step={1}
                        min={1}
                        onInput={(event) => {
                            const value = event.target.value
                                ? Number(event.target.value)
                                : 0;

                            setConditions(prev => ({
                                ...prev,
                                earning: {
                                    ...prev.earning,
                                    rate: {
                                        ...prev.earning.rate,
                                        amount: value
                                    }
                                }
                            }));
                        }}
                    />
                </s-grid>
            </s-section>
        </s-box>
    );
}
import { useAtom } from "jotai";
import {
    conditionsAtom,
} from "@atoms/pointsRule";


//  referral: {
//         trigger: "oneTime", // oneTime | subscription

//         referrer: {
//             firstOrderPoints: 100,
//             allowRenewalReward: true,
//             renewalPoints: 80
//         },

//         referred: {
//             discountType: "fixed",
//             discountValue: 10,
//             allowRenewalReward: false,
//             renewalPoints: 50
//         }
//     },

export default function ReferralConditionsForm() {
    const [conditions, setConditions] = useAtom(conditionsAtom);

    return <s-box>
        <s-box paddingBlockEnd="base">
            <s-section>
                <s-heading>Referred get discount</s-heading>
                {/* <s-box paddingBlockEnd="small" /> */}
                <s-choice-list
                    label="Earning Method"
                    labelAccessibilityVisibility="exclusive"
                    name="earningMethod"
                    onInput={(e) => {
                        const value = e.currentTarget.values[0];

                        setConditions(prev => ({
                            ...prev,
                            referredEarning: {
                                ...prev.referredEarning,
                                type: value
                            }
                        }));
                    }}
                >
                    <s-choice
                        value="fixed"
                        selected={conditions.referredEarning.type === "fixed"}
                    >
                        Fixed amount (Recommended)
                    </s-choice>

                    <s-choice
                        value="percentage"
                        selected={conditions.referredEarning.type === "percentage"}
                    >
                        Percentage Amount
                    </s-choice>
                </s-choice-list>


                <s-box paddingBlockEnd="small" />
                <s-number-field
                    label="Points"
                    labelAccessibilityVisibility="exclusive"
                    prefix={conditions?.referredEarning?.type === "fixed" ? '$' : ''}
                    suffix={conditions?.referredEarning?.type === "fixed" ? '' : '%'}
                    value={conditions?.referredEarning?.amount ?? ""}
                    onInput={(event) => {
                        const value = event.target.value
                            ? Number(event.target.value)
                            : 0;

                        setConditions(prev => ({
                            ...prev,
                            referredEarning: {
                                ...prev.referredEarning,
                                amount: value
                            }
                        }));
                    }}
                />
            </s-section>
        </s-box>

        <s-box>
            <s-section>
                <s-heading>Referrer earn points</s-heading>
                <s-box paddingBlockEnd="small" />

                <s-number-field
                    label="Points"
                    labelAccessibilityVisibility="exclusive"
                    suffix="points"
                    value={conditions?.referrerPoints ?? ""}
                    onInput={(event) => {
                        const value = event.target.value
                            ? Number(event.target.value)
                            : 0;

                        setConditions(prev => ({
                            ...prev,
                            referrerPoints: value
                        }));
                    }}
                />
            </s-section>
        </s-box>
    </s-box>
}
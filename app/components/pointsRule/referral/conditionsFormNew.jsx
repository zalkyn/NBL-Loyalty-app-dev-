import { useAtom } from "jotai";
import { conditionsAtom } from "@atoms/pointsRule";

export default function ReferralConditionsForm() {
    const [conditions, setConditions] = useAtom(conditionsAtom);

    const referral = conditions?.referral;

    /**
     * ===============================
     * UPDATE HELPER (IMMUTABLE SAFE)
     * ===============================
     */
    const updateReferral = (updater) => {
        setConditions(prev => ({
            ...prev,
            referral: updater(prev.referral)
        }));
    };

    // ================= Referral Type =================
    const handleTriggerChange = (e) => {
        const value = e.currentTarget.values?.[0];

        updateReferral(prev => ({
            ...prev,
            trigger: value
        }));
    };

    // ================= Referred Discount Type =================
    const handleReferredDiscountType = (e) => {
        const value = e.currentTarget.values?.[0];

        updateReferral(prev => ({
            ...prev,
            referred: {
                ...prev.referred,
                discountType: value
            }
        }));
    };

    // ================= Referred Discount Value =================
    const handleReferredDiscountValue = (event) => {
        const value = event.target.value;

        updateReferral(prev => ({
            ...prev,
            referred: {
                ...prev.referred,
                discountValue: value === "" ? "" : Number(value)
            }
        }));
    };

    // ================= Referred Renewal Toggle =================
    const handleReferredRenewalToggle = (e) => {
        const checked = e.target.checked;

        updateReferral(prev => ({
            ...prev,
            referred: {
                ...prev.referred,
                allowRenewalReward: checked
            }
        }));
    };

    // ================= Referred Renewal Points =================
    const handleReferredRenewalPoints = (event) => {
        const value = event.target.value;

        updateReferral(prev => ({
            ...prev,
            referred: {
                ...prev.referred,
                renewalPoints: value === "" ? "" : Number(value)
            }
        }));
    };

    // ================= Referrer First Order Points =================
    const handleReferrerFirstOrderPoints = (event) => {
        const value = event.target.value;

        updateReferral(prev => ({
            ...prev,
            referrer: {
                ...prev.referrer,
                firstOrderPoints: value === "" ? "" : Number(value)
            }
        }));
    };

    // ================= Referrer Renewal Toggle =================
    const handleReferrerRenewalToggle = (e) => {
        const checked = e.target.checked;

        updateReferral(prev => ({
            ...prev,
            referrer: {
                ...prev.referrer,
                allowRenewalReward: checked
            }
        }));
    };

    // ================= Referrer Renewal Points =================
    const handleReferrerRenewalPoints = (event) => {
        const value = event.target.value;

        updateReferral(prev => ({
            ...prev,
            referrer: {
                ...prev.referrer,
                renewalPoints: value === "" ? "" : Number(value)
            }
        }));
    };

    return (
        <s-box>

            {/* =======================================================
                SECTION 1: REFERRAL TYPE
                (Defines when referral reward will trigger)
            ======================================================= */}
            <s-section>
                <s-heading>Referral Type</s-heading>

                <s-choice-list
                    name="referralType"
                    onInput={handleTriggerChange}
                >
                    <s-choice
                        value="oneTime"
                        selected={referral?.trigger === "oneTime"}
                    >
                        One-time Referral
                    </s-choice>

                    <s-choice
                        value="subscription"
                        selected={referral?.trigger === "subscription"}
                    >
                        Subscription-based Referral
                    </s-choice>
                </s-choice-list>

                <s-text>
                    Choose when referral rewards should be triggered.
                    One-time = only first purchase, Subscription = recurring rewards.
                </s-text>
            </s-section>

            {/* =======================================================
                SECTION 2: REFERRED CUSTOMER
                (Customer who gets discount when joining)
            ======================================================= */}
            <s-box paddingBlockEnd="base" />
            <s-section>
                <s-heading>Referred Customer Benefits</s-heading>

                {/* Discount Type */}
                <s-choice-list onInput={handleReferredDiscountType}>
                    <s-choice
                        value="fixed"
                        selected={referral?.referred?.discountType === "fixed"}
                    >
                        Fixed Discount
                    </s-choice>

                    <s-choice
                        value="percentage"
                        selected={referral?.referred?.discountType === "percentage"}
                    >
                        Percentage Discount
                    </s-choice>
                </s-choice-list>

                <s-text>
                    Select how discount will be applied to the referred customer.
                    Fixed = fixed amount, Percentage = % based discount.
                </s-text>

                {/* Discount Value */}
                <s-box paddingBlockEnd="base" />
                <s-number-field
                    label="Discount Value"
                    value={referral?.referred?.discountValue ?? ""}
                    onInput={handleReferredDiscountValue}
                    details="This value will be applied as discount for the referred customer during first purchase."
                    prefix={referral?.referred?.discountType === "fixed" ? '$' : ''}
                    suffix={referral?.referred?.discountType === "fixed" ? '' : '%'}
                />

                {/* Renewal Toggle */}
                <s-box paddingBlockEnd="base" />
                <s-switch
                    labelAccessibilityVisibility="exclusion"
                    label={
                        referral?.referred?.allowRenewalReward
                            ? "Renewal Reward Enabled"
                            : "Renewal Reward Disabled"
                    }
                    checked={referral?.referred?.allowRenewalReward}
                    onChange={handleReferredRenewalToggle}
                    details="Enable this if referred customers should receive rewards on subscription renewals or repeat purchases."
                />

                {/* Renewal Points */}
                <s-box paddingBlockEnd="base" />
                {referral?.referred?.allowRenewalReward && (
                    <s-number-field
                        label="Renewal Reward Points"
                        value={referral?.referred?.renewalPoints ?? ""}
                        onInput={handleReferredRenewalPoints}
                        details="Points given to referred customers on each renewal or repeat purchase."
                    />
                )}
            </s-section>

            {/* =======================================================
                SECTION 3: REFERRER
                (User who invites others)
            ======================================================= */}
            <s-box paddingBlockEnd="base" />
            <s-section>
                <s-heading>Referrer Rewards</s-heading>

                {/* First Order Points */}
                <s-number-field
                    label="First Order Reward Points"
                    value={referral?.referrer?.firstOrderPoints ?? ""}
                    onInput={handleReferrerFirstOrderPoints}
                    details="Reward points given to the referrer when the referred customer places their first order."
                />

                {/* Renewal Toggle */}
                <s-box paddingBlockEnd="base" />
                <s-switch
                    labelAccessibilityVisibility="exclusion"
                    label={
                        referral?.referrer?.allowRenewalReward
                            ? "Renewal Reward Enabled"
                            : "Renewal Reward Disabled"
                    }
                    checked={referral?.referrer?.allowRenewalReward}
                    onChange={handleReferrerRenewalToggle}
                    details="Enable this if referrers should earn points on every renewal or repeat purchase of their referred customers."
                />

                {/* Renewal Points */}
                <s-box paddingBlockEnd="base" />
                {referral?.referrer?.allowRenewalReward && (
                    <s-number-field
                        label="Renewal Reward Points"
                        value={referral?.referrer?.renewalPoints ?? ""}
                        onInput={handleReferrerRenewalPoints}
                        details="Points awarded to referrer on each renewal transaction."
                    />
                )}
            </s-section>

        </s-box>
    );
}
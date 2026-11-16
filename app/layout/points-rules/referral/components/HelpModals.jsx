// Detailed explanations for the referral rule settings, opened from a
// "How does this work?" button next to each setting. The modals are rendered
// once as direct children of <s-page> (like the Guide modal); the buttons sit
// inside the setting's own section.

export const TIMING_HELP_ID = "referral-timing-help";
export const APPROVAL_HELP_ID = "referral-approval-help";

/** Small "How does this work?" button that opens one of the modals below. */
export function HelpButton({ modalId, label = "How does this work?" }) {
    return (
        <s-button variant="tertiary" icon="info" command="--show" commandFor={modalId}>
            {label}
        </s-button>
    );
}

const Block = ({ title, children }) => (
    <s-box padding="base" background="subdued" borderRadius="base">
        <s-stack direction="block" gap="small">
            {title && <s-text type="strong">{title}</s-text>}
            {children}
        </s-stack>
    </s-box>
);

const Close = ({ id }) => (
    <s-button slot="primary-action" variant="primary" command="--hide" commandFor={id}>Got it</s-button>
);

/** "When are referral points given?" — full explanation with a worked example. */
export function TimingHelpModal() {
    return (
        <s-modal id={TIMING_HELP_ID} heading="When are referral points given?" size="large">
            <s-stack direction="block" gap="base">
                <s-paragraph>
                    Many subscriptions start with a cheap first month (for example A$1) and move to the full price on
                    the second payment. Paying the referral reward on that cheap first order means a referrer can be
                    rewarded for a member who never pays the real price. This setting decides when the reward is paid.
                </s-paragraph>

                <s-heading>Example</s-heading>
                <s-text color="subdued">
                    Full price A$49. Referral reward: referrer 2,500 points, new member 1,000 points. Renewal points: 200.
                    Setting: after the first full-price payment, referral reward only.
                </s-text>
                <s-table>
                    <s-table-header-row>
                        <s-table-header>Payment</s-table-header>
                        <s-table-header>The new member pays</s-table-header>
                        <s-table-header>What happens</s-table-header>
                    </s-table-header-row>
                    <s-table-body>
                        <s-table-row>
                            <s-table-cell>1st (first month)</s-table-cell>
                            <s-table-cell>A$1 with the referral code</s-table-cell>
                            <s-table-cell>Nobody is paid yet. The reward waits under &quot;Waiting for full payment&quot; and both people are told it is on its way.</s-table-cell>
                        </s-table-row>
                        <s-table-row>
                            <s-table-cell>2nd (first renewal)</s-table-cell>
                            <s-table-cell>A$49</s-table-cell>
                            <s-table-cell>The referrer gets 2,500 and the new member 1,000, together. No renewal points on this payment.</s-table-cell>
                        </s-table-row>
                        <s-table-row>
                            <s-table-cell>3rd</s-table-cell>
                            <s-table-cell>A$49</s-table-cell>
                            <s-table-cell>The referrer earns the 200 renewal points, and so on for each renewal.</s-table-cell>
                        </s-table-row>
                    </s-table-body>
                </s-table>

                <s-heading>The choices</s-heading>
                <Block title="After the first full-price payment (recommended)">
                    <s-text>
                        The reward waits until the new member&apos;s money actually reaches the regular price. It is not
                        tied to &quot;the second payment&quot;: if a promo runs for two months, the reward waits for the first
                        payment that is really at the full price. If their very first order was already at the full
                        price, the reward is paid straight away.
                    </s-text>
                </Block>
                <Block title="On the first order (old behaviour)">
                    <s-text>
                        The reward is paid as soon as the new member places their first order, even a A$1 promo order.
                    </s-text>
                </Block>
                <Block title="On the payment that releases the reward">
                    <s-text><strong>Referral reward only</strong> (recommended): that payment gives the referral reward and nothing else. Renewal points start from the next payment, so nobody is paid twice for one payment.</s-text>
                    <s-text><strong>Referral reward and renewal points</strong>: that payment also gives that payment&apos;s renewal points. It only adds something when the Renewal bonus is switched on below.</s-text>
                </Block>

                <s-heading>Close an unpaid reward after (days)</s-heading>
                <s-paragraph>
                    If the new member cancels after the promo, they never reach the full price and the reward would wait
                    forever. With a number of days set, a reward still unpaid after that long is closed: nobody gets the
                    referral points, and both people are told.
                </s-paragraph>
                <s-table>
                    <s-table-header-row>
                        <s-table-header>You enter</s-table-header>
                        <s-table-header>What happens</s-table-header>
                    </s-table-header-row>
                    <s-table-body>
                        <s-table-row>
                            <s-table-cell>0 (default)</s-table-cell>
                            <s-table-cell>Never closed. A reward waits for as long as it takes.</s-table-cell>
                        </s-table-row>
                        <s-table-row>
                            <s-table-cell>60</s-table-cell>
                            <s-table-cell>Closed if the full-price payment hasn&apos;t come within 60 days of the promo order. Right for a one-month promo with monthly billing.</s-table-cell>
                        </s-table-row>
                        <s-table-row>
                            <s-table-cell>10</s-table-cell>
                            <s-table-cell>Too short for a one-month promo. The full-price payment normally comes after about 30 days, so most real referrals would be closed first.</s-table-cell>
                        </s-table-row>
                    </s-table-body>
                </s-table>
                <s-banner tone="warning" heading="Two things to know">
                    <s-text>A closed reward can&apos;t be reopened. And changing the number also applies to rewards that are already waiting, so lowering it can close some within the hour.</s-text>
                </s-banner>
            </s-stack>
            <Close id={TIMING_HELP_ID} />
        </s-modal>
    );
}

/** "Approve referrals manually" — what customers and you will see. */
export function ApprovalHelpModal() {
    return (
        <s-modal id={APPROVAL_HELP_ID} heading="Approve referrals manually" size="large">
            <s-stack direction="block" gap="base">
                <s-paragraph>
                    Use this to stop fake or abusive referral claims: nothing is issued until you have looked at the claim.
                </s-paragraph>

                <Block title="When it is OFF (default)">
                    <s-text>A customer who claims a referral gets their discount code straight away, as before.</s-text>
                </Block>
                <Block title="When it is ON">
                    <s-ordered-list>
                        <s-list-item>A new customer opens a friend&apos;s referral link and claims. They see &quot;Referral Received — your referral is waiting for approval&quot;. No discount code exists yet.</s-list-item>
                        <s-list-item>The claim appears in Referral Reviews under <strong>New claims</strong>, with the referrer, the new customer and the date.</s-list-item>
                        <s-list-item><strong>Approve</strong>: the discount code is created and the customer is told it is ready (they open the same referral link again to see it).</s-list-item>
                        <s-list-item><strong>Reject</strong>: no code is created and the customer is told their request wasn&apos;t approved. No points are given.</s-list-item>
                    </s-ordered-list>
                </Block>

                <s-heading>Good to know</s-heading>
                <s-unordered-list>
                    <s-list-item>Referrals claimed <strong>before</strong> you switch this on are not affected. Their codes already exist and work as before.</s-list-item>
                    <s-list-item>Approving needs the customer to still be new. If they have placed an order since claiming, Approve is refused because a first-order code would be useless to them. Reject it instead.</s-list-item>
                    <s-list-item>Referral points are still paid by the other setting below (after the first full-price payment, or on the first order). Approving a claim does not pay points by itself.</s-list-item>
                    <s-list-item>Switching it off again does not touch claims that are already waiting. They stay in New claims until you decide.</s-list-item>
                </s-unordered-list>
            </s-stack>
            <Close id={APPROVAL_HELP_ID} />
        </s-modal>
    );
}

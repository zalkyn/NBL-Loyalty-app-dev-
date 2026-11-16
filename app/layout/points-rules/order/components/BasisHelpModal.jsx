// Detailed explanation of "What points are counted on", opened from a
// "How does this work?" button in that section. Rendered once as a direct
// child of <s-page>.

import { useShopCurrency } from "@app/hooks/useShopCurrency.jsx";

export const BASIS_HELP_ID = "order-basis-help";

export function BasisHelpButton() {
    return (
        <s-button variant="tertiary" icon="info" command="--show" commandFor={BASIS_HELP_ID}>
            How does this work?
        </s-button>
    );
}

export function BasisHelpModal() {
    const { symbol: c } = useShopCurrency();
    return (
        <s-modal id={BASIS_HELP_ID} heading="What points are counted on" size="large">
            <s-stack direction="block" gap="base">
                <s-paragraph>
                    Points are worked out for each product on the order, from what the customer paid for it. Whatever
                    you choose below, two things never change: shipping is never counted, and a product that was paid
                    for nothing earns 0 points, even with a fixed-points rule.
                </s-paragraph>

                <s-heading>Examples</s-heading>
                <s-text color="subdued">Rate: 20 points for every {c}1.</s-text>
                <s-table>
                    <s-table-header-row>
                        <s-table-header>Order</s-table-header>
                        <s-table-header>After discounts (default)</s-table-header>
                        <s-table-header>Before discounts (old)</s-table-header>
                    </s-table-header-row>
                    <s-table-body>
                        <s-table-row>
                            <s-table-cell>{c}40 product, no discount</s-table-cell>
                            <s-table-cell>{c}40 → 800 points</s-table-cell>
                            <s-table-cell>{c}40 → 800 points</s-table-cell>
                        </s-table-row>
                        <s-table-row>
                            <s-table-cell>{c}40 product with {c}10 off</s-table-cell>
                            <s-table-cell>{c}30 → 600 points</s-table-cell>
                            <s-table-cell>{c}40 → 800 points</s-table-cell>
                        </s-table-row>
                        <s-table-row>
                            <s-table-cell>{c}233 product, 100% discount code (order total {c}0.00)</s-table-cell>
                            <s-table-cell>{c}0 → 0 points</s-table-cell>
                            <s-table-cell>0 points (a product paid for nothing never earns)</s-table-cell>
                        </s-table-row>
                        <s-table-row>
                            <s-table-cell>{c}49 product on a {c}1 first-month promo</s-table-cell>
                            <s-table-cell>{c}1 → 20 points</s-table-cell>
                            <s-table-cell>{c}49 → 980 points if the list price is {c}49</s-table-cell>
                        </s-table-row>
                    </s-table-body>
                </s-table>

                <s-heading>Discounts</s-heading>
                <s-box padding="base" background="subdued" borderRadius="base">
                    <s-stack direction="block" gap="small">
                        <s-text><strong>After discounts (recommended):</strong> counts what was really paid for the product, including discount codes, automatic discounts and a share of any order-level discount.</s-text>
                        <s-text><strong>Before discounts (old behaviour):</strong> counts the full list price. Use it only if you want points to ignore discounts. A product paid for nothing still earns 0.</s-text>
                    </s-stack>
                </s-box>

                <s-heading>Tax</s-heading>
                <s-box padding="base" background="subdued" borderRadius="base">
                    <s-stack direction="block" gap="small">
                        <s-text><strong>Count tax (default):</strong> tax is money received, so nothing is taken off.</s-text>
                        <s-text><strong>Leave tax out:</strong> only matters when your store prices already include tax (such as GST in Australia). A {c}110 product with {c}10 GST then earns points on {c}100. If your prices do not include tax, this changes nothing.</s-text>
                    </s-stack>
                </s-box>

                <s-banner tone="info" heading="Good to know">
                    <s-text>Changing this only affects new orders. Orders already earned keep their points. Refunds and cancellations still take back the matching share of the points.</s-text>
                </s-banner>
            </s-stack>
            <s-button slot="primary-action" variant="primary" command="--hide" commandFor={BASIS_HELP_ID}>Got it</s-button>
        </s-modal>
    );
}

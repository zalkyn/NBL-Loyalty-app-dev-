import { useShopCurrency } from "@app/hooks/useShopCurrency.jsx";
/**
 * Multiplier x Points-per-$1 calculator — helps the merchant work out a
 * sensible points cost from a product's dollar value. Purely a local UI
 * helper; the resulting suggestion is applied via PricingFields' "Use this".
 */
export function MultiplierCalculator({
    productValue,
    multiplier,
    onMultiplierChange,
    pointsPerDollar,
    onPointsPerDollarChange,
    suggestedPoints,
}) {
    const { symbol } = useShopCurrency();
    return (
        <s-section>
            <s-text variant="headingSm">Multiplier Calculator</s-text>
            <s-text color="subdued" variant="bodySm">
                Points cost = Product value × Multiplier × Points per {symbol}1.
                Lower multiplier = easier to claim (10x). Higher = harder (20x).
            </s-text>
            <s-box paddingBlockEnd="small" />
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
                <s-number-field
                    label="Multiplier"
                    suffix="x"
                    step={1} min={1} max={100}
                    value={multiplier}
                    onInput={(e) => onMultiplierChange(Number(e.target.value) || 15)}
                />
                <s-number-field
                    label={`Points per ${symbol}1 spent`}
                    suffix="pts"
                    step={1} min={1}
                    value={pointsPerDollar}
                    onInput={(e) => onPointsPerDollarChange(Number(e.target.value) || 10)}
                />
            </s-grid>

            {/* Calculated breakdown */}
            {productValue && suggestedPoints && (
                <s-box paddingBlockStart="small">
                    <s-text color="subdued" variant="bodySm">
                        {symbol}{Number(productValue).toLocaleString()} × {multiplier}x × {pointsPerDollar} pts/{symbol}1
                        {" = "}<strong>{suggestedPoints.toLocaleString()} pts</strong>
                        {" · "}Spend equivalent: <strong>{symbol}{(suggestedPoints / pointsPerDollar).toLocaleString()}</strong>
                        {" · "}Effective return: <strong>{((Number(productValue) / (suggestedPoints / pointsPerDollar)) * 100).toFixed(1)}%</strong>
                        {" · "}Value per point: <strong>{symbol}{(Number(productValue) / suggestedPoints).toFixed(4)}</strong>
                    </s-text>
                </s-box>
            )}
        </s-section>
    );
}

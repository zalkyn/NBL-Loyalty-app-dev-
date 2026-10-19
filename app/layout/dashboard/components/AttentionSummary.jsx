import { useNavigate } from "react-router";
import { useShopCurrency } from "@app/hooks/useShopCurrency.jsx";
import { buildAttentionItems, needsAttention } from "../../health/_attention.js";

/**
 * One short banner on the dashboard when something needs the merchant; the
 * details and actions live on the Program Health page. Renders nothing when
 * all is well, so the dashboard stays focused on its charts.
 */
export function AttentionSummary({ health }) {
    const navigate = useNavigate();
    const { code: shopCurrency } = useShopCurrency();
    const todo = needsAttention(buildAttentionItems(health, shopCurrency));
    if (!todo.length) return null;

    const tone = todo.some((i) => i.tone === "critical") ? "critical" : "warning";

    return (
        <s-banner slot="supplemental-start" tone={tone} heading={`${todo.length} thing${todo.length > 1 ? "s" : ""} need${todo.length > 1 ? "" : "s"} your attention`}>
            <s-text>{todo.map((i) => i.heading).join(" · ")}</s-text>
            <s-button slot="secondary-actions" variant="secondary" onClick={() => navigate("/app/health")}>
                View details
            </s-button>
        </s-banner>
    );
}

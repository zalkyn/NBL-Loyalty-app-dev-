/**
 * "Is everything switched on?" — one row per thing a working programme needs.
 * Required rows show To do until done; optional rows say Optional. Each row
 * links to where it is set up, so a to-do is one click from fixed.
 */
function buildRows(c) {
    return [
        { name: "Order points rule", state: c.orderRule, required: true, text: "Customers earn points on paid orders.", href: "/app/points-rules/order", cta: "Open order rule" },
        { name: "At least one reward", state: c.rewardRules > 0 ? "on" : "none", required: true, text: c.rewardRules > 0 ? `${c.rewardRules} active reward${c.rewardRules === 1 ? "" : "s"} customers can redeem.` : "Without a reward, customers have nothing to spend points on.", href: "/app/rewards-rules", cta: "Open reward rules" },
        { name: "Referral rule", state: c.referralRule, required: false, text: "Members share a code; the friend gets a discount.", href: "/app/points-rules/referral", cta: "Open referral rule" },
        { name: "Review points rule", state: c.reviewRule, required: false, text: "Customers earn points for Loox reviews.", href: "/app/points-rules/review", cta: "Open review rule" },
        { name: "Loox connection", state: c.looxLink ? "on" : "none", required: false, text: "A private link Shopify Flow uses to tell this app about reviews.", href: "/app/loox-setup", cta: "Open review setup" },
        { name: "Physical prizes", state: c.prizes > 0 ? "on" : "none", required: false, text: c.prizes > 0 ? `${c.prizes} active prize${c.prizes === 1 ? "" : "s"}.` : "Real products customers can claim with points.", href: "/app/physical-prizes-rules", cta: "Open prize rules" },
    ];
}

export function SetupChecklist({ checklist }) {
    const rows = buildRows(checklist);
    const todo = rows.filter((r) => r.required && r.state !== "on").length;

    return (
        <s-section heading="Setup checklist">
            <s-stack direction="block" gap="base">
                <s-text color="subdued">
                    {todo === 0 ? "The basics are in place." : `${todo} basic step${todo === 1 ? " is" : "s are"} still to do.`}
                    {" "}Optional items only matter if you want that feature.
                </s-text>
                {rows.map((row) => (
                    <s-stack key={row.name} direction="inline" gap="base" justifyContent="space-between" alignItems="center">
                        <s-stack direction="block" gap="small-500">
                            <s-stack direction="inline" gap="small" alignItems="center">
                                <s-text type="strong">{row.name}</s-text>
                                <s-badge tone={row.state === "on" ? "success" : row.state === "off" ? "warning" : row.required ? "warning" : "neutral"}>
                                    {row.state === "on" ? "Done" : row.state === "off" ? "Switched off" : row.required ? "To do" : "Optional"}
                                </s-badge>
                            </s-stack>
                            <s-text color="subdued">{row.state === "off" ? "This rule exists but is switched off, so it does nothing right now." : row.text}</s-text>
                        </s-stack>
                        <s-button href={row.href}>{row.state === "off" ? "Switch on" : row.cta}</s-button>
                    </s-stack>
                ))}
            </s-stack>
        </s-section>
    );
}

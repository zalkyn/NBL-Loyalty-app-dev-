import { useNavigate } from "react-router";

const TRIGGER_TEXT = {
    oneTime: "one-time orders only",
    subscription: "subscription orders only",
    both: "all orders",
};

function Card({ heading, status, children, linkLabel, href }) {
    const navigate = useNavigate();
    return (
        <s-section heading={heading}>
            <s-stack gap="small">
                {status && <s-badge tone={status.tone}>{status.label}</s-badge>}
                {children}
                {href && (
                    <s-button variant="tertiary" onClick={() => navigate(href)}>{linkLabel}</s-button>
                )}
            </s-stack>
        </s-section>
    );
}

/**
 * Plain-language "how each feature works, and how it is doing" cards. The
 * explanations are static; the numbers come from the dashboard loader.
 */
export function FeatureHealth({ health }) {
    const { referral, jobs } = health;

    const referralStatus = referral.ruleActive === null
        ? { tone: "neutral", label: "Not set up" }
        : referral.ruleActive
            ? { tone: "success", label: "Active" }
            : { tone: "warning", label: "Switched off" };

    return (
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(280px, 1fr))" gap="base">
            <Card heading="Referrals" status={referralStatus} linkLabel="Open referral rule" href="/app/points-rules/referral">
                <s-text>
                    A customer shares their code; when a friend uses it on their first order, both can earn points
                    {referral.trigger ? ` (currently ${TRIGGER_TEXT[referral.trigger] ?? referral.trigger})` : ""}.
                    Before paying, the app compares the two accounts: strong matches are held for your approval,
                    weaker ones are paid and flagged.
                </s-text>
                <s-text tone="subdued">
                    Last 30 days: {referral.held} waiting for review · {referral.flagged30d} flagged · {referral.skipped30d} skipped by your rule settings
                </s-text>
            </Card>

            <Card heading="Order processing" status={jobs.failed > 0 ? { tone: "critical", label: `${jobs.failed} failed` } : { tone: "success", label: "Running" }}>
                <s-text>
                    Every paid order is processed in the background to award points. If something isn't ready
                    yet (for example subscription details from Appstle), the order is retried automatically
                    instead of being skipped.
                </s-text>
                <s-text tone="subdued">{jobs.waiting} being retried right now</s-text>
            </Card>

            <Card heading="Customer messages" linkLabel="Customize the widget" href="/app/customize">
                <s-text>
                    Customers see a short message in the widget whenever points are added, removed, held, rejected
                    or skipped. You can turn these pop-ups on or off in Widget Customize.
                </s-text>
            </Card>
        </s-grid>
    );
}

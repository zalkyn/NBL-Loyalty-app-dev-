import { useState } from "react";

const personName = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(" ") || p?.name || p?.email || "—";

/** How a referral's state reads to the merchant (and what colour it gets). */
export function referralState(referral) {
    const meta = referral?.metadata ?? {};
    switch (referral?.status) {
        case "HELD": return { label: "Waiting for your decision", tone: "warning" };
        case "REJECTED": return { label: "Rejected", tone: "critical" };
        case "USED":
            if (meta.skipped) return { label: "No reward (rule)", tone: "neutral" };
            if (meta.approval) return { label: "Approved by you", tone: "success" };
            if (meta.reviewFlag) return { label: "Rewarded, flagged", tone: "caution" };
            return referral.rewardGiven ? { label: "Rewarded", tone: "success" } : { label: "Used", tone: "neutral" };
        case "ACTIVE": return { label: "Code not used yet", tone: "info" };
        default: return { label: referral?.status ?? "—", tone: "neutral" };
    }
}

function Row({ label, children }) {
    return (
        <s-grid gridTemplateColumns="140px 1fr" gap="base" alignItems="center">
            <s-text color="subdued">{label}</s-text>
            <s-box>{children}</s-box>
        </s-grid>
    );
}

/**
 * Who the customer is and how they connect to the referral programme: their
 * code, who referred them, and who they referred (with each referral's state).
 */
export function SummaryCard({ customer }) {
    const [copied, setCopied] = useState(false);
    const sent = customer?.referralsSent ?? [];
    const used = customer?.referralsUsed ?? null;

    const copyCode = async () => {
        try {
            await navigator.clipboard.writeText(customer.referralCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard blocked — the code is still visible to copy by hand */ }
    };

    return (
        <s-section heading="Profile">
            <s-stack direction="block" gap="base">
                <Row label="Email"><s-text>{customer?.email ?? "N/A"}</s-text></Row>
                <Row label="Joined">
                    <s-text>{customer?.enrolledAt ? new Date(customer.enrolledAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "N/A"}</s-text>
                </Row>
                <Row label="Referral code">
                    <s-stack direction="inline" gap="small" alignItems="center">
                        <s-text>{customer?.referralCode ?? "N/A"}</s-text>
                        {customer?.referralCode && (
                            <s-button variant="tertiary" size="small" icon={copied ? "check" : "clipboard"} onClick={copyCode}>
                                {copied ? "Copied" : "Copy"}
                            </s-button>
                        )}
                    </s-stack>
                </Row>
                <Row label="Referred by">
                    {used ? (
                        <s-stack direction="inline" gap="small" alignItems="center">
                            <s-link href={`/app/customers/${used.referrer.id}`}>{personName(used.referrer)}</s-link>
                            <s-badge tone={referralState(used).tone}>{referralState(used).label}</s-badge>
                        </s-stack>
                    ) : <s-text color="subdued">Nobody</s-text>}
                </Row>
                <Row label="Has referred">
                    {sent.length === 0 ? <s-text color="subdued">Nobody yet</s-text> : (
                        <s-stack direction="block" gap="small-300">
                            {sent.map((r) => (
                                <s-stack key={r.id} direction="inline" gap="small" alignItems="center">
                                    <s-link href={`/app/customers/${r.referred.id}`}>{personName(r.referred)}</s-link>
                                    <s-badge tone={referralState(r).tone}>{referralState(r).label}</s-badge>
                                </s-stack>
                            ))}
                        </s-stack>
                    )}
                </Row>
            </s-stack>
        </s-section>
    );
}

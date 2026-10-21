import { useRevalidator } from "react-router";
import { useEffect, useState } from "react";
import { timeAgo } from "../_format.js";

/**
 * The answer to "is my programme OK?" in one glance: an overall status, how
 * many things need the merchant, and a Refresh button. Banners above hold the
 * detail and the fixes; this just summarises them.
 */
export function StatusHero({ items, checkedAt }) {
    const revalidator = useRevalidator();
    const critical = items.filter((i) => i.tone === "critical").length;
    const warning = items.filter((i) => i.tone === "warning").length;
    const info = items.filter((i) => i.tone === "info").length;

    // Time passes after load; re-render the "checked … ago" text each minute.
    const [, tick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => tick((v) => v + 1), 60000);
        return () => clearInterval(id);
    }, []);

    const status = critical
        ? { tone: "critical", label: "Needs attention now", line: "Something is stopping points or rewards from reaching customers." }
        : warning
            ? { tone: "warning", label: "A decision is waiting", line: "Everything is running, but something needs a look from you." }
            : { tone: "success", label: "Healthy", line: info ? "Everything is running. Some orders are being retried by themselves." : "Orders are processing and nothing is waiting for you." };

    return (
        <s-section>
            <s-stack direction="inline" gap="base" justifyContent="space-between" alignItems="center">
                <s-stack direction="block" gap="small-500">
                    <s-stack direction="inline" gap="small" alignItems="center">
                        <s-heading>Program status</s-heading>
                        <s-badge tone={status.tone}>{status.label}</s-badge>
                    </s-stack>
                    <s-text>{status.line}</s-text>
                    <s-text color="subdued">
                        {critical + warning === 0
                            ? "Nothing needs you right now."
                            : `${critical ? `${critical} urgent` : ""}${critical && warning ? " · " : ""}${warning ? `${warning} to decide` : ""}`}
                        {" · "}Checked {timeAgo(checkedAt)}
                    </s-text>
                </s-stack>
                <s-button
                    icon="refresh"
                    loading={revalidator.state === "loading" || undefined}
                    disabled={revalidator.state === "loading"}
                    onClick={() => revalidator.revalidate()}
                >
                    Check again
                </s-button>
            </s-stack>
        </s-section>
    );
}

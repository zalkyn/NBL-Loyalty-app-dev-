import Pagination from "@components/pagination/Pagination";

export const TX_FILTERS = [
    { key: "all", label: "All" },
    { key: "earned", label: "Earned" },
    { key: "spent", label: "Spent" },
    { key: "adjusted", label: "Adjusted" },
];

/** Zero-point rows are notices to the customer (e.g. "reward is being reviewed"), not point movements. */
export const isNotice = (tx) => tx.points === 0 && tx.status === "PENDING";

export function matchesFilter(tx, key) {
    if (key === "earned") return tx.points > 0 && ["EARN", "BACKFILL", "REFERRAL", "SUBSCRIPTION_CANCEL_RESTORE"].includes(tx.type);
    if (key === "spent") return ["REDEEM", "EXPIRE"].includes(tx.type);
    if (key === "adjusted") return ["ADJUST", "REVERSAL", "SUBSCRIPTION_CANCEL_RESET"].includes(tx.type);
    return true;
}

const TYPE_LABEL = {
    EARN: ["Earned", "success"], BACKFILL: ["Backfill", "success"], REFERRAL: ["Referral", "success"],
    REDEEM: ["Spent", "info"], EXPIRE: ["Expired", "neutral"],
    ADJUST: ["Adjusted", "caution"], REVERSAL: ["Reversed", "critical"],
    SUBSCRIPTION_CANCEL_RESET: ["Reset", "critical"], SUBSCRIPTION_CANCEL_RESTORE: ["Restored", "success"],
};

function TypeBadge({ tx }) {
    if (isNotice(tx)) return <s-badge tone="neutral">Notice</s-badge>;
    const [label, tone] = TYPE_LABEL[tx.type] ?? [tx.type, "neutral"];
    return <s-badge tone={tone}>{label}</s-badge>;
}

const when = (value) => {
    const d = new Date(value);
    return (
        <s-stack direction="block" gap="small-500">
            <s-text>{d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</s-text>
            <s-text tone="subdued">{d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</s-text>
        </s-stack>
    );
};

export function TransactionsTable({ pagination, filter, onFilterChange, counts, showNotices, onToggleNotices, noticeCount }) {
    const { paginatedData: transactions } = pagination;

    return (
        <s-section heading={`Transaction history (${counts.all.toLocaleString()})`}>
            <s-stack direction="inline" gap="small" alignItems="center">
                {TX_FILTERS.map((f) => (
                    <s-button key={f.key} size="small" variant={filter === f.key ? "primary" : "secondary"} onClick={() => onFilterChange(f.key)}>
                        {f.label} ({counts[f.key].toLocaleString()})
                    </s-button>
                ))}
                {noticeCount > 0 && (
                    <s-button size="small" variant="tertiary" onClick={onToggleNotices}>
                        {showNotices ? "Hide" : "Show"} {noticeCount} customer notice{noticeCount === 1 ? "" : "s"}
                    </s-button>
                )}
            </s-stack>
            <s-box paddingBlockStart="base" />
            <s-table>
                <s-table-header-row>
                    <s-table-header>Date</s-table-header>
                    <s-table-header>Type</s-table-header>
                    <s-table-header>Points</s-table-header>
                    <s-table-header>Balance after</s-table-header>
                    <s-table-header>Note</s-table-header>
                </s-table-header-row>
                <s-table-body>
                    {transactions.length === 0 ? (
                        <s-table-row>
                            <s-table-cell colSpan={5} style={{ textAlign: "center", padding: "2rem" }}>
                                No transactions match this filter.
                            </s-table-cell>
                        </s-table-row>
                    ) : transactions.map((tx) => (
                        <s-table-row key={tx.id}>
                            <s-table-cell>{when(tx.createdAt)}</s-table-cell>
                            <s-table-cell><TypeBadge tx={tx} /></s-table-cell>
                            <s-table-cell>
                                {isNotice(tx)
                                    ? <s-text tone="subdued">—</s-text>
                                    : <s-text tone={tx.points >= 0 ? "success" : "critical"}>{tx.points >= 0 ? "+" : ""}{tx.points.toLocaleString()}</s-text>}
                            </s-table-cell>
                            <s-table-cell>{isNotice(tx) ? <s-text tone="subdued">—</s-text> : tx.balanceAfter.toLocaleString()}</s-table-cell>
                            <s-table-cell>
                                <s-stack direction="block" gap="small-500">
                                    <s-text>{tx.reason ?? "—"}</s-text>
                                    {tx.event?.name && <s-text tone="subdued">{tx.event.name}</s-text>}
                                </s-stack>
                            </s-table-cell>
                        </s-table-row>
                    ))}
                </s-table-body>
            </s-table>
            <Pagination {...pagination} label="transactions" />
        </s-section>
    );
}

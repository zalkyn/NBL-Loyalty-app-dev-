import Pagination from "@components/pagination/Pagination";

function statusBadge(rw) {
    // discountUsed is the source of truth for "already spent at checkout"
    // (set by voucherUpdateIfAvailable() in orderPaidJob.js) — status alone
    // can lag it in edge cases, so check both.
    if (rw.discountUsed === true || rw.status === "USED") {
        return <s-badge tone="success">Used</s-badge>;
    }
    if (rw.status === "CANCELLED") {
        return <s-badge tone="critical">Cancelled</s-badge>;
    }
    if (rw.status === "ACTIVE") {
        return <s-badge tone="info">Active</s-badge>;
    }
    return <s-badge>{rw.status ?? "—"}</s-badge>;
}

export function RewardsTable({ pagination, onCancelReward }) {
    const { paginatedData: rewards } = pagination;

    return (
        <s-section>
            <h3 style={{ marginTop: 0 }}>Rewards History</h3>
            <s-table>
                <s-table-header-row>
                    <s-table-header>Date</s-table-header>
                    <s-table-header>Title</s-table-header>
                    <s-table-header>Type</s-table-header>
                    <s-table-header>Points Cost</s-table-header>
                    <s-table-header>Status</s-table-header>
                    <s-table-header>Actions</s-table-header>
                </s-table-header-row>
                <s-table-body>
                    {rewards.length === 0 ? (
                        <s-table-row>
                            <s-table-cell colSpan={6} style={{ textAlign: "center", color: "var(--p-color-text-secondary, #6d7175)" }}>
                                No rewards found.
                            </s-table-cell>
                        </s-table-row>
                    ) : rewards.map((rw) => {
                        // Only unused, still-active rewards can be cancelled —
                        // mirrors the check in _action.server.js's
                        // handleCancelReward (server re-verifies this too, this
                        // is just to avoid showing a button that would fail).
                        const isCancellable = rw.status === "ACTIVE" && rw.discountUsed === false;

                        return (
                            <s-table-row key={rw.id}>
                                <s-table-cell>{new Date(rw.createdAt).toLocaleDateString()}</s-table-cell>
                                <s-table-cell>{rw.title ?? "—"}</s-table-cell>
                                <s-table-cell>{rw.type  ?? "—"}</s-table-cell>
                                <s-table-cell>{(rw.pointsCost ?? 0).toLocaleString()}</s-table-cell>
                                <s-table-cell>{statusBadge(rw)}</s-table-cell>
                                <s-table-cell>
                                    {isCancellable ? (
                                        <s-button
                                            variant="secondary"
                                            tone="critical"
                                            size="small"
                                            onClick={() => onCancelReward?.(rw)}
                                        >
                                            Cancel
                                        </s-button>
                                    ) : (
                                        <s-text tone="subdued">—</s-text>
                                    )}
                                </s-table-cell>
                            </s-table-row>
                        );
                    })}
                </s-table-body>
            </s-table>
            <Pagination {...pagination} label="rewards" />
        </s-section>
    );
}

/**
 * Shadow rules table for the list view — name/description, rate summary,
 * max points, currency, active flag, times-used count, edit/delete
 * actions, plus pagination.
 */

import { DELETE_MODAL_ID } from "./DeleteConfirmModal";

function formatRate(rule) {
    if (rule.rateType === "FIXED") {
        return `${Number(rule.fixedPoints ?? 0).toLocaleString()} pts flat`;
    }
    if (rule.rateType === "PER_AMOUNT") {
        return `${Number(rule.pointsPerUnit ?? 0).toLocaleString()} pt(s) per ${Number(rule.perAmount ?? 0).toLocaleString()} ${rule.currencyCode ?? ""}`;
    }
    return "—";
}

export function ShadowRuleTable({
    rules,
    currentPage,
    totalPages,
    isAnyBusy,
    onEdit,
    onRequestDelete,
    onPageChange,
}) {
    return (
        <s-section>
            <s-table>
                <s-table-header-row>
                    <s-table-header>Name</s-table-header>
                    <s-table-header>Rate</s-table-header>
                    <s-table-header>Max Points</s-table-header>
                    <s-table-header>Used By</s-table-header>
                    <s-table-header>Active</s-table-header>
                    <s-table-header>Actions</s-table-header>
                </s-table-header-row>
                <s-table-body>
                    {rules.length === 0 ? (
                        <s-table-row>
                            <s-table-cell colSpan="6" style={{ textAlign: "center", padding: "3rem" }}>
                                No points backfill rules yet. Click "Add Points Backfill Rule" to get started.
                            </s-table-cell>
                        </s-table-row>
                    ) : (
                        rules.map((r) => (
                            <s-table-row key={r.id}>
                                <s-table-cell>
                                    <s-text variant="headingSm">{r.name}</s-text>
                                    {r.description && (
                                        <s-text tone="subdued" variant="bodySm">
                                            {r.description.length > 60 ? r.description.slice(0, 60) + "…" : r.description}
                                        </s-text>
                                    )}
                                </s-table-cell>
                                <s-table-cell>{formatRate(r)}</s-table-cell>
                                <s-table-cell>
                                    {r.maxPoints != null ? `${Number(r.maxPoints).toLocaleString()} pts` : "No cap"}
                                </s-table-cell>
                                <s-table-cell>
                                    {r.entryCount > 0 ? (
                                        <s-badge tone="info">{r.entryCount.toLocaleString()} customer(s)</s-badge>
                                    ) : (
                                        <s-text tone="subdued">Not run yet</s-text>
                                    )}
                                </s-table-cell>
                                <s-table-cell><s-badge tone={r.isActive ? "success" : "critical"}>{r.isActive ? "Yes" : "No"}</s-badge></s-table-cell>
                                <s-table-cell>
                                    <s-stack gap="small" direction="inline">
                                        <s-button
                                            variant="text" size="small" icon="edit"
                                            accessibilityLabel={`Edit ${r.name}`}
                                            disabled={isAnyBusy} onClick={() => onEdit(r)}
                                        />
                                        <s-button
                                            variant="text" size="small" icon="delete" destructive
                                            accessibilityLabel={
                                                r.entryCount > 0
                                                    ? `${r.name} can't be deleted — it has already awarded points`
                                                    : `Delete ${r.name}`
                                            }
                                            disabled={isAnyBusy || r.entryCount > 0}
                                            onClick={() => onRequestDelete(r)}
                                            commandFor={DELETE_MODAL_ID} command="--show"
                                        />
                                    </s-stack>
                                </s-table-cell>
                            </s-table-row>
                        ))
                    )}
                </s-table-body>
            </s-table>

            {totalPages > 1 && (
                <s-stack direction="inline" justifyContent="center" gap="small" style={{ marginBlockStart: "1rem" }}>
                    <s-button
                        variant="plain" disabled={currentPage === 1 || isAnyBusy}
                        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                    >Previous</s-button>
                    <s-text>Page {currentPage} of {totalPages}</s-text>
                    <s-button
                        variant="plain" disabled={currentPage === totalPages || isAnyBusy}
                        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                    >Next</s-button>
                </s-stack>
            )}
        </s-section>
    );
}

import { useNavigate } from "react-router";
import Pagination from "@app/components/pagination/Pagination";
import { formatDate, SKIP_REASON_LABEL, restoreRemaining as getRestoreRemaining } from "../_data";

/**
 * Main cancellations table — one row per Appstle subscription.cancelled
 * event this app has recorded. Selection checkboxes only appear on rows
 * that are actually actionable — see _data.js's isActionable/
 * NON_ACTIONABLE_SKIP_REASONS for exactly which rows that excludes.
 */
export function CancelEventsTable({
    events,
    selectedIds,
    selectableIds,
    allSelected,
    onToggleSelect,
    onToggleSelectAll,
    onResetOne,
    onRestore,
    isBusy,
    isSubmitting,
    currentPage,
    totalPages,
    totalItems,
    perPage,
    startIndex,
    setCurrentPage,
    setPerPage,
}) {
    const selectableSet = new Set(selectableIds);
    const navigate = useNavigate();

    return (
        <s-section padding="none">
            <s-table>
                <s-table-header-row>
                    <s-table-header>
                        {selectableIds.length > 0 && (
                            <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={onToggleSelectAll}
                                title="Select all actionable rows on this page"
                            />
                        )}
                    </s-table-header>
                    <s-table-header>Customer</s-table-header>
                    <s-table-header>Cancelled At</s-table-header>
                    <s-table-header>Points at Cancellation</s-table-header>
                    <s-table-header>Reset Applied</s-table-header>
                    <s-table-header>Actions</s-table-header>
                </s-table-header-row>
                <s-table-body>
                    {events.length === 0 ? (
                        <s-table-row>
                            <s-table-cell colSpan="6">
                                <s-text tone="subdued">No cancellations found.</s-text>
                            </s-table-cell>
                        </s-table-row>
                    ) : (
                        events.map((event) => {
                            const busy = isBusy(event.id);
                            const isSelectable = selectableSet.has(event.id);
                            const fullName = event.customerName || "Unknown";
                            const restoreRemaining = getRestoreRemaining(event);
                            const canRestore = event.resetApplied && restoreRemaining > 0;

                            return (
                                <s-table-row key={event.id}>

                                    {/* Checkbox */}
                                    <s-table-cell>
                                        {isSelectable && (
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(event.id)}
                                                onChange={() => onToggleSelect(event.id)}
                                                disabled={isSubmitting}
                                            />
                                        )}
                                    </s-table-cell>

                                    {/* Customer */}
                                    <s-table-cell>
                                        <s-stack direction="block" gap="none">
                                            <s-stack direction="inline" gap="small" alignItems="center">
                                                <s-text variant="headingSm">{fullName}</s-text>
                                                {event.customerId && (
                                                    <s-button variant="plain" disabled={busy} onClick={() => navigate(`/app/customers/${event.customerId}`)}>
                                                        View profile
                                                    </s-button>
                                                )}
                                            </s-stack>
                                            <s-text tone="subdued" variant="bodySm">{event.customerEmail ?? "—"}</s-text>
                                        </s-stack>
                                    </s-table-cell>

                                    {/* Cancelled At */}
                                    <s-table-cell>
                                        <s-text tone="subdued" variant="bodySm">{formatDate(event.cancelledAt)}</s-text>
                                    </s-table-cell>

                                    {/* Points at cancellation */}
                                    <s-table-cell>
                                        <s-text variant="headingSm">{Number(event.previousBalance).toLocaleString()} pts</s-text>
                                    </s-table-cell>

                                    {/* Reset Applied */}
                                    <s-table-cell>
                                        <s-stack direction="block" gap="small-300">
                                            <s-badge tone={event.resetApplied ? "success" : "warning"}>
                                                {event.resetApplied ? "Yes" : "No"}
                                            </s-badge>
                                            {event.skipReason && (
                                                <s-text tone="subdued" variant="bodySm">
                                                    {SKIP_REASON_LABEL[event.skipReason] ?? event.skipReason}
                                                </s-text>
                                            )}
                                            {event.resolvedManually && (
                                                <s-badge tone="info">Manually reset</s-badge>
                                            )}
                                            {event.restoredAmount > 0 && (
                                                <s-text tone="subdued" variant="bodySm">
                                                    {event.restoredAmount.toLocaleString()} pts restored
                                                    {restoreRemaining > 0 ? ` (${restoreRemaining.toLocaleString()} left)` : " (in full)"}
                                                </s-text>
                                            )}
                                        </s-stack>
                                    </s-table-cell>

                                    {/* Actions */}
                                    <s-table-cell>
                                        <s-stack direction="block" gap="small-300">
                                            {isSelectable && (
                                                <s-button variant="primary" disabled={isSubmitting} onClick={() => onResetOne(event)}>
                                                    Reset Now
                                                </s-button>
                                            )}
                                            {canRestore && (
                                                <s-button variant="secondary" disabled={isSubmitting} onClick={() => onRestore(event)}>
                                                    Restore Points
                                                </s-button>
                                            )}
                                            {/* ALREADY_ZERO rows never get Restore Points (nothing was
                                                deducted by them) — say why instead of a bare "—", and
                                                point at the row that did deduct, if any (route.jsx loader). */}
                                            {!isSelectable && !canRestore && event.skipReason === "ALREADY_ZERO" && (
                                                // Capped width — unbounded, this sentence stretched the
                                                // Actions column across the table.
                                                <s-box maxInlineSize="280px">
                                                    <s-text tone="subdued" variant="bodySm">
                                                        {event.resetBySibling
                                                            ? `No points were deducted here. This customer's reset was applied on their cancellation from ${formatDate(event.resetBySibling.cancelledAt)} — restore from that row.`
                                                            : "No points were deducted for this cancellation, so there's nothing to restore."}
                                                    </s-text>
                                                </s-box>
                                            )}
                                            {!isSelectable && !canRestore && event.skipReason !== "ALREADY_ZERO" && (
                                                <s-text tone="subdued">—</s-text>
                                            )}
                                        </s-stack>
                                    </s-table-cell>

                                </s-table-row>
                            );
                        })
                    )}
                </s-table-body>
            </s-table>

            <s-divider />

            <s-box paddingBlockEnd="base" paddingInline="base">
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    perPage={perPage}
                    startIndex={startIndex}
                    setCurrentPage={setCurrentPage}
                    setPerPage={setPerPage}
                    label="cancellations"
                    // DEFAULT_PER_PAGE (_data.js) is 20 — not in Pagination's
                    // own default option list ([5, 10, 25, 50]). A <select>
                    // whose value doesn't match any of its <option>s falls
                    // back to displaying the FIRST option as if selected
                    // (here, "5") while the actual perPage state stays 20 —
                    // exactly the "dropdown says 5, but 10 of 10 rows are
                    // showing" mismatch this fixes.
                    perPageOptions={[5, 10, 20, 50]}
                />
            </s-box>
        </s-section>
    );
}

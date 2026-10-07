import { useNavigate } from "react-router";
import Pagination from "@components/pagination/Pagination";
import { SKIP_REASON_LABEL, isActionable, pickResetSibling, nothingToRestoreNote } from "@app/layout/subscription-cancellations/_data";

/**
 * Read-only history of this customer's subscription cancellations (Appstle
 * subscription.cancelled events this app has recorded). The manual "Reset
 * Now" action lives on the dedicated Subscription Cancellations page —
 * same "read-only here, manage there" split as PhysicalPrizeClaimsTable.
 */
export function SubscriptionCancelEventsTable({ pagination, allEvents }) {
    const { paginatedData: events } = pagination;
    const navigate = useNavigate();
    // From ALL of this customer's events, not just the current page — the
    // reset an ALREADY_ZERO row points at may be on another page.
    const resetBySibling = pickResetSibling(allEvents ?? events);

    return (
        <s-section>
            <h3 style={{ marginTop: 0 }}>Subscription Cancellations</h3>
            <s-table>
                <s-table-header-row>
                    <s-table-header>Cancelled At</s-table-header>
                    <s-table-header>Points at Cancellation</s-table-header>
                    <s-table-header>Reset Applied</s-table-header>
                </s-table-header-row>
                <s-table-body>
                    {events.length === 0 ? (
                        <s-table-row>
                            <s-table-cell colSpan={3} style={{ textAlign: "center", color: "var(--p-color-text-secondary, #6d7175)" }}>
                                No subscription cancellations found.
                            </s-table-cell>
                        </s-table-row>
                    ) : events.map((event) => (
                        <s-table-row key={event.id}>
                            <s-table-cell>{new Date(event.cancelledAt).toLocaleDateString()}</s-table-cell>
                            <s-table-cell>{Number(event.previousBalance).toLocaleString()} pts</s-table-cell>
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
                                    {/* Same note as the cancellations page's Actions column —
                                        explains why this row has no Restore Points. */}
                                    {event.skipReason === "ALREADY_ZERO" && (
                                        <s-box maxInlineSize="280px">
                                            <s-text tone="subdued" variant="bodySm">
                                                {nothingToRestoreNote(resetBySibling)}
                                            </s-text>
                                        </s-box>
                                    )}
                                    {/* Shared isActionable, not a local re-check — a bare
                                        `skipReason !== "ALREADY_ZERO"` here previously missed
                                        NEGATIVE_BALANCE too, showing "Manage" for a row that
                                        the main page correctly refuses to act on (a dead-end
                                        click). See NON_ACTIONABLE_SKIP_REASONS's own comment
                                        in _data.js on why this check is centralized. */}
                                    {isActionable(event) && (
                                        <s-button variant="plain" onClick={() => navigate("/app/subscription-cancellations")}>
                                            Manage
                                        </s-button>
                                    )}
                                </s-stack>
                            </s-table-cell>
                        </s-table-row>
                    ))}
                </s-table-body>
            </s-table>
            <Pagination {...pagination} label="cancellations" />
        </s-section>
    );
}

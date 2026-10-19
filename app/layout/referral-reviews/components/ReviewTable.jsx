import { personName, sentence, gidNumber } from "../_data";
import { DECISION_MODAL_ID } from "./ConfirmDecisionModal";

// Stacked (block) so name, email and the points lines never run together.
function Person({ person }) {
    return (
        <s-stack direction="block" gap="small-500">
            <s-link href={`/app/customers/${person.id}`}>{personName(person)}</s-link>
            <s-text tone="subdued">{person.email}</s-text>
        </s-stack>
    );
}

// The order's page in the Shopify admin, in a new tab so this list isn't lost.
// Plain text when the id isn't a real Shopify order (e.g. test data).
function OrderLink({ shop, orderGid, label }) {
    const id = gidNumber(orderGid);
    if (!id || !shop) return <s-text>{label ?? "—"}</s-text>;
    return (
        <s-link href={`https://${shop}/admin/orders/${id}`} target="_blank">
            {label ?? `Order ${id}`}
        </s-link>
    );
}

const date = (value) => (value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

const EMPTY = {
    waiting: "Nothing is waiting for your decision.",
    flagged: "No flagged referrals yet.",
    rejected: "No rejected referrals.",
};

/**
 * One table for all three tabs. Only the waiting tab has selection and the
 * Approve / Reject actions; the others are a read-only record.
 */
export function ReviewTable({ tab, rows, shop, q, busy, selected, onToggle, onTogglePage, onDecide }) {
    const waiting = tab === "waiting";
    const allSelected = waiting && rows.length > 0 && rows.every((r) => selected.has(r.id));
    const columns = waiting ? 8 : 5;

    return (
        <s-table>
            <s-table-header-row>
                {waiting && (
                    <s-table-header>
                        {rows.length > 0 && (
                            <input type="checkbox" checked={allSelected} onChange={onTogglePage} disabled={busy} title="Select everything on this page" />
                        )}
                    </s-table-header>
                )}
                <s-table-header>Referrer</s-table-header>
                <s-table-header>Referred customer</s-table-header>
                <s-table-header>Order</s-table-header>
                <s-table-header>{waiting ? "Why it was held" : "Note"}</s-table-header>
                {waiting && <s-table-header>Points</s-table-header>}
                <s-table-header>{tab === "rejected" ? "Rejected on" : waiting ? "Held on" : "Date"}</s-table-header>
                {waiting && <s-table-header>Decision</s-table-header>}
            </s-table-header-row>
            <s-table-body>
                {rows.length === 0 ? (
                    <s-table-row>
                        <s-table-cell colSpan={columns} style={{ textAlign: "center", padding: "2rem" }}>
                            {q ? `No referrals match "${q}".` : EMPTY[tab]}
                        </s-table-cell>
                    </s-table-row>
                ) : rows.map((r) => {
                    const hold = r.metadata?.hold ?? {};
                    const note = r.metadata?.approval
                        ? `Approved by you. ${sentence(r.metadata.approval.heldReason ?? "")}`
                        : sentence(r.metadata?.reviewFlag?.reason ?? hold.reason);
                    const when = r.metadata?.rejection?.rejectedAt ?? r.metadata?.approval?.approvedAt ?? hold.heldAt ?? r.updatedAt;

                    return (
                        <s-table-row key={r.id}>
                            {waiting && (
                                <s-table-cell>
                                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => onToggle(r.id)} disabled={busy} />
                                </s-table-cell>
                            )}
                            <s-table-cell><Person person={r.referrer} /></s-table-cell>
                            <s-table-cell><Person person={r.referred} /></s-table-cell>
                            <s-table-cell>
                                <OrderLink shop={shop} orderGid={hold.orderId ?? r.orderId} label={hold.orderLabel} />
                            </s-table-cell>
                            <s-table-cell>{note}</s-table-cell>
                            {waiting && (
                                <s-table-cell>
                                    <s-stack direction="block" gap="small-500">
                                        <s-text>Referrer: {(hold.referrerPoints ?? 0).toLocaleString()}</s-text>
                                        <s-text tone="subdued">Friend: {(hold.referredPoints ?? 0).toLocaleString()}</s-text>
                                    </s-stack>
                                </s-table-cell>
                            )}
                            <s-table-cell>{date(when)}</s-table-cell>
                            {waiting && (
                                <s-table-cell>
                                    <s-stack direction="inline" gap="small">
                                        <s-button variant="primary" size="small" disabled={busy}
                                            commandFor={DECISION_MODAL_ID} command="--show" onClick={() => onDecide("approve", [r])}>
                                            Approve
                                        </s-button>
                                        <s-button tone="critical" size="small" disabled={busy}
                                            commandFor={DECISION_MODAL_ID} command="--show" onClick={() => onDecide("reject", [r])}>
                                            Reject
                                        </s-button>
                                    </s-stack>
                                </s-table-cell>
                            )}
                        </s-table-row>
                    );
                })}
            </s-table-body>
        </s-table>
    );
}

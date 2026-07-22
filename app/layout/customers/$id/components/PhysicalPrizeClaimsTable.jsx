import { useNavigate } from "react-router";
import Pagination from "@components/pagination/Pagination";

const STATUS_TONE = {
    PENDING: undefined,
    FULFILLED: "info",
    COMPLETED: "success",
    CANCELLED: "critical",
};

/**
 * Read-only history of this customer's physical prize claims. Full claim
 * management (mark fulfilled/completed, cancel + refund, tracking info) is
 * handled on the dedicated Physical Prizes Claims page. "View Details" here
 * hands off to that page (via ?claimId=) which auto-opens the same
 * ViewClaimModal used there — see route.jsx / _hooks.js on that page.
 */
export function PhysicalPrizeClaimsTable({ pagination }) {
    const { paginatedData: claims } = pagination;
    const navigate = useNavigate();

    return (
        <s-section>
            <h3 style={{ marginTop: 0 }}>Physical Prize Claims</h3>
            <s-table>
                <s-table-header-row>
                    <s-table-header>Date</s-table-header>
                    <s-table-header>Prize</s-table-header>
                    <s-table-header>Points Cost</s-table-header>
                    <s-table-header>Status</s-table-header>
                    <s-table-header>Fulfilled</s-table-header>
                    <s-table-header>Completed</s-table-header>
                    <s-table-header>Actions</s-table-header>
                </s-table-header-row>
                <s-table-body>
                    {claims.length === 0 ? (
                        <s-table-row>
                            <s-table-cell colSpan={7} style={{ textAlign: "center", color: "var(--p-color-text-secondary, #6d7175)" }}>
                                No physical prize claims found.
                            </s-table-cell>
                        </s-table-row>
                    ) : claims.map((claim) => (
                        <s-table-row key={claim.id}>
                            <s-table-cell>{new Date(claim.createdAt).toLocaleDateString()}</s-table-cell>
                            <s-table-cell>{claim.prize?.title ?? "—"}</s-table-cell>
                            <s-table-cell>{(claim.pointsCost ?? 0).toLocaleString()}</s-table-cell>
                            <s-table-cell>
                                <s-badge tone={STATUS_TONE[claim.status]}>{claim.status ?? "—"}</s-badge>
                            </s-table-cell>
                            <s-table-cell>{claim.fulfilledAt ? new Date(claim.fulfilledAt).toLocaleDateString() : "—"}</s-table-cell>
                            <s-table-cell>{claim.completedAt ? new Date(claim.completedAt).toLocaleDateString() : "—"}</s-table-cell>
                            <s-table-cell>
                                <s-button
                                    variant="plain"
                                    onClick={() => navigate(`/app/physical-prizes-claims-manage?claimId=${claim.id}`)}
                                >
                                    View Details
                                </s-button>
                            </s-table-cell>
                        </s-table-row>
                    ))}
                </s-table-body>
            </s-table>
            <Pagination {...pagination} label="prize claims" />
        </s-section>
    );
}
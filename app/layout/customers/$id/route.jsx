/**
 * @file layout/customers/$id/route.jsx
 * @description Customer details page — thin composition layer.
 *
 *   _loader.server.js  -> prisma + Shopify GraphQL queries
 *   _action.server.js  -> adjustPoints handler
 *   _hooks.js          -> page state (no jotai)
 *   components/
 *     SummaryCard.jsx        -> profile + referral relationships
 *     StatsGrid.jsx          -> four headline numbers
 *     AdjustPointsModal.jsx  -> add/remove toggle + live preview
 *     TransactionsTable.jsx  -> filterable, paginated transaction history
 *     RewardsTable.jsx       -> paginated rewards history
 *     PhysicalPrizeClaimsTable.jsx        -> read-only prize claim history
 *     SubscriptionCancelEventsTable.jsx   -> read-only subscription cancellation history
 */

import { useLoaderData, useActionData } from "react-router";
import { authenticate } from "shopify-server";

import { loadCustomerDetails } from "./_loader.server";
import { handleAdjustPoints, handleCancelReward }  from "./_action.server";
import { useCustomerDetailsPage } from "./_hooks";

import { SummaryCard }        from "./components/SummaryCard";
import { StatsGrid, needsCancelReset }          from "./components/StatsGrid";
import { AdjustPointsModal }  from "./components/AdjustPointsModal";
import { CancelRewardModal }  from "./components/CancelRewardModal";
import { TransactionsTable }  from "./components/TransactionsTable";
import { RewardsTable }       from "./components/RewardsTable";
import { PhysicalPrizeClaimsTable } from "./components/PhysicalPrizeClaimsTable";
import { SubscriptionCancelEventsTable } from "./components/SubscriptionCancelEventsTable";
import { GuideButton } from "@app/layout/guide/components/GuideButton.jsx";

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request, params }) => {
    const { admin, session } = await authenticate.admin(request);
    return loadCustomerDetails(admin, session.id, params.id);
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const formData  = await request.formData();
    const submitType = formData.get("submitType");
    const ctx = { formData, session, admin };

    switch (submitType) {
        case "adjustPoints": return handleAdjustPoints(ctx);
        case "cancelReward": return handleCancelReward(ctx);
        default: return { message: "Invalid action.", status: "error", submitType };
    }
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomerDetails() {
    const loaderData = useLoaderData();
    const actionData = useActionData();
    const page       = useCustomerDetailsPage(loaderData, actionData);

    if (!page.customer?.id) {
        return (
            <s-page heading="Customer">
                <s-banner slot="supplemental-start" tone="critical" heading="Customer not found">
                    <s-text>This customer may have been removed. Go back to the customer list and try again.</s-text>
                </s-banner>
            </s-page>
        );
    }

    return (
        <s-page heading={page.customerLabel}>
            <GuideButton topic="customers" />

            {/* ── Header: title is the page heading; back link and the single
                primary action live in their page slots ── */}
            <s-button slot="breadcrumb-actions" onClick={page.handleBack}>
                Customers
            </s-button>
            <s-button
                slot="primary-action"
                variant="primary"
                icon="plus-circle"
                command="--show"
                commandFor="adjust-points-modal"
            >
                Adjust Points
            </s-button>

            {/* ── Modals ── */}
            <AdjustPointsModal
                customer={page.customer}
                isAdjusting={page.isAdjusting}
                onConfirm={page.handleAdjustPoints}
            />
            <CancelRewardModal
                modalRef={page.cancelRewardModalRef}
                target={page.cancelTarget}
                isSubmitting={page.isCancellingReward}
                onConfirm={page.handleConfirmCancelReward}
                onHide={page.closeCancelRewardModal}
            />

            {/* ── Things that need attention on this customer ── */}
            {(page.customer.points ?? 0) < 0 && (
                <s-banner slot="supplemental-start" tone="critical" heading="This customer owes points">
                    <s-text>
                        Their balance is {page.customer.points.toLocaleString()} because points from an order were reversed after they had spent them.
                        New reward and prize claims are blocked until it is paid back down. Use Adjust Points to correct it.
                    </s-text>
                </s-banner>
            )}
            {needsCancelReset(page.customer) && (
                <s-banner slot="supplemental-start" tone="warning" heading="A cancelled subscription still needs its points reset">
                    <s-text>This customer cancelled a subscription and their points balance hasn&apos;t been reset yet.</s-text>
                    <s-button slot="secondary-actions" variant="secondary" onClick={() => page.navigate("/app/subscription-cancellations")}>
                        Open Subscription Cancellations
                    </s-button>
                </s-banner>
            )}
            {page.heldReferrals > 0 && (
                <s-banner slot="supplemental-start" tone="warning" heading="A referral reward for this customer is waiting for your decision">
                    <s-text>It was held because the two accounts look alike. Approve or reject it in Referral Reviews.</s-text>
                    <s-button slot="secondary-actions" variant="secondary" onClick={() => page.navigate(`/app/referral-reviews?q=${encodeURIComponent(page.customer.email)}`)}>
                        Open Referral Reviews
                    </s-button>
                </s-banner>
            )}

            {/* ── Headline numbers, then who they are ── */}
            <s-box paddingBlockEnd="base">
                <StatsGrid customer={page.customer} />
            </s-box>
            <SummaryCard customer={page.customer} />

            {/* ── Transaction History ── */}
            <TransactionsTable
                pagination={page.txPagination}
                filter={page.txFilter}
                onFilterChange={page.setTxFilter}
                counts={page.txCounts}
                showNotices={page.showNotices}
                onToggleNotices={() => page.setShowNotices((v) => !v)}
                noticeCount={page.noticeCount}
            />

            {/* ── Rewards History ── */}
            <RewardsTable pagination={page.rwPagination} onCancelReward={page.openCancelReward} />

            {/* ── Physical Prize Claims (read-only) ── */}
            <PhysicalPrizeClaimsTable pagination={page.prizeClaimPagination} />

            {/* ── Subscription Cancellations (read-only) ── */}
            <SubscriptionCancelEventsTable
                pagination={page.cancelEventPagination}
                allEvents={page.customer?.subscriptionCancelEvents ?? []}
            />

        </s-page>
    );
}

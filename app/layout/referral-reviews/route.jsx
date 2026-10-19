/**
 * @file referral-reviews/route.jsx
 * @description Referral Reviews — referral rewards the app held back because
 * the two accounts look like the same person or household (see
 * utils/referralFraud.js), plus recently rewarded referrals that carry a
 * weaker flag. The merchant approves (points are awarded) or rejects (no
 * points) each held one.
 */

import { useEffect } from "react";
import { useLoaderData, useActionData, useSubmit, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "shopify-server";

import { loadReviews, handleApprove, handleReject } from "./_data.server";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    return { ...(await loadReviews(session)), shop: session.shop };
};

export const action = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const submitType = formData.get("submitType");
    const ctx = { formData, session, admin };

    switch (submitType) {
        case "approveReferral": return handleApprove(ctx);
        case "rejectReferral": return handleReject(ctx);
        default: return { message: "Invalid action.", status: "error", submitType };
    }
};

const personName = (p) => [p.firstName, p.lastName].filter(Boolean).join(" ") || p.name || "—";

// Stacked (block) so name, email and the points lines never run together.
function Person({ person }) {
    return (
        <s-stack direction="block" gap="small-500">
            <s-text>{personName(person)}</s-text>
            <s-text tone="subdued">{person.email}</s-text>
        </s-stack>
    );
}

// The order's page in the Shopify admin, opened in a new tab so the review
// list isn't lost. Falls back to plain text when the id isn't a real Shopify
// order (e.g. test data).
function OrderLink({ shop, orderGid, label }) {
    const id = String(orderGid ?? "").match(/\/(\d+)$/)?.[1];
    if (!id || !shop) return <s-text>{label ?? "—"}</s-text>;
    return (
        <s-link href={`https://${shop}/admin/orders/${id}`} target="_blank">
            {label ?? `Order ${id}`}
        </s-link>
    );
}

const sentence = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) + "." : "—");

export default function ReferralReviewsPage() {
    const { held, flagged, shop } = useLoaderData();
    const actionData = useActionData();
    const submit = useSubmit();
    const navigation = useNavigation();
    const shopify = useAppBridge();
    const busy = navigation.state === "submitting";

    useEffect(() => {
        if (!actionData) return;
        shopify.toast.show(actionData.message, { isError: actionData.status === "error" });
    }, [actionData, shopify]);

    const decide = (submitType, referralId) => {
        const fd = new FormData();
        fd.set("submitType", submitType);
        fd.set("referralId", String(referralId));
        submit(fd, { method: "post" });
    };

    return (
        <s-page heading="Referral Reviews">
            <s-section heading="Waiting for your decision">
                <s-paragraph tone="subdued">
                    These referral rewards were held because the two accounts look like the same person or
                    household. The referred customer's discount was already applied by Shopify. Approve to
                    award the points, or reject to award nothing.
                </s-paragraph>
                <s-table>
                    <s-table-header-row>
                        <s-table-header>Referrer</s-table-header>
                        <s-table-header>Referred customer</s-table-header>
                        <s-table-header>Order</s-table-header>
                        <s-table-header>Why it was held</s-table-header>
                        <s-table-header>Points</s-table-header>
                        <s-table-header>Decision</s-table-header>
                    </s-table-header-row>
                    <s-table-body>
                        {held.length === 0 ? (
                            <s-table-row>
                                <s-table-cell colSpan="6" style={{ textAlign: "center", padding: "2rem" }}>
                                    Nothing is waiting for review.
                                </s-table-cell>
                            </s-table-row>
                        ) : held.map((r) => {
                            const hold = r.metadata?.hold ?? {};
                            return (
                                <s-table-row key={r.id}>
                                    <s-table-cell><Person person={r.referrer} /></s-table-cell>
                                    <s-table-cell><Person person={r.referred} /></s-table-cell>
                                    <s-table-cell><OrderLink shop={shop} orderGid={hold.orderId} label={hold.orderLabel} /></s-table-cell>
                                    <s-table-cell>{sentence(hold.reason)}</s-table-cell>
                                    <s-table-cell>
                                        <s-stack direction="block" gap="small-500">
                                            <s-text>Referrer: {(hold.referrerPoints ?? 0).toLocaleString()}</s-text>
                                            <s-text tone="subdued">Friend: {(hold.referredPoints ?? 0).toLocaleString()}</s-text>
                                        </s-stack>
                                    </s-table-cell>
                                    <s-table-cell>
                                        <s-stack direction="inline" gap="small">
                                            <s-button variant="primary" size="small" disabled={busy}
                                                onClick={() => decide("approveReferral", r.id)}>
                                                Approve
                                            </s-button>
                                            <s-button tone="critical" size="small" disabled={busy}
                                                onClick={() => decide("rejectReferral", r.id)}>
                                                Reject
                                            </s-button>
                                        </s-stack>
                                    </s-table-cell>
                                </s-table-row>
                            );
                        })}
                    </s-table-body>
                </s-table>
            </s-section>

            <s-section heading="Rewarded, but worth a look">
                <s-paragraph tone="subdued">
                    These were rewarded normally, but one weaker signal was noticed (same name, or a similar
                    address), or you approved them after a hold.
                </s-paragraph>
                <s-table>
                    <s-table-header-row>
                        <s-table-header>Referrer</s-table-header>
                        <s-table-header>Referred customer</s-table-header>
                        <s-table-header>Order</s-table-header>
                        <s-table-header>Note</s-table-header>
                    </s-table-header-row>
                    <s-table-body>
                        {flagged.length === 0 ? (
                            <s-table-row>
                                <s-table-cell colSpan="4" style={{ textAlign: "center", padding: "2rem" }}>
                                    Nothing flagged.
                                </s-table-cell>
                            </s-table-row>
                        ) : flagged.map((r) => (
                            <s-table-row key={r.id}>
                                <s-table-cell><Person person={r.referrer} /></s-table-cell>
                                <s-table-cell><Person person={r.referred} /></s-table-cell>
                                <s-table-cell><OrderLink shop={shop} orderGid={r.orderId} /></s-table-cell>
                                <s-table-cell>
                                    {r.metadata?.approval
                                        ? `Approved by you — ${r.metadata.approval.heldReason ?? ""}`
                                        : r.metadata?.reviewFlag?.reason ?? ""}
                                </s-table-cell>
                            </s-table-row>
                        ))}
                    </s-table-body>
                </s-table>
            </s-section>
        </s-page>
    );
}

/**
 * @file referral-reviews/route.jsx
 * @description Referral Reviews — referral rewards the app held back because
 * the two accounts look like the same person or household (see
 * utils/referralFraud.js), plus a record of flagged and rejected ones.
 *
 *   _data.js          -> tabs, limits, pure helpers
 *   _data.server.js   -> tab/search/pagination queries; approve & reject (single or bulk)
 *   components/       -> ReviewTable, ConfirmDecisionModal
 *
 * URL params drive everything: ?tab=waiting|flagged|rejected&q=&page=&perPage=
 */

import { useEffect, useState } from "react";
import { useLoaderData, useActionData, useSubmit, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "shopify-server";
import Pagination from "@components/pagination/Pagination";

import { loadReviews, handleDecide } from "./_data.server";
import { TABS, PER_PAGE_OPTIONS, BULK_LIMIT } from "./_data.js";
import { ReviewTable } from "./components/ReviewTable";
import { ConfirmDecisionModal } from "./components/ConfirmDecisionModal";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    return loadReviews(session, new URL(request.url).searchParams);
};

export const action = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const submitType = formData.get("submitType");
    const ctx = { formData, session, admin };

    switch (submitType) {
        case "approveReferrals": return handleDecide(ctx, "approve");
        case "rejectReferrals": return handleDecide(ctx, "reject");
        default: return { message: "Invalid action.", status: "error", submitType };
    }
};

export default function ReferralReviewsPage() {
    const { tab, q, page, perPage, total, totalPages, rows, counts, shop } = useLoaderData();
    const actionData = useActionData();
    const submit = useSubmit();
    const navigation = useNavigation();
    const shopify = useAppBridge();

    const busy = navigation.state === "submitting";
    const loading = navigation.state === "loading" && navigation.formMethod !== "POST";

    const [search, setSearch] = useState(q);
    useEffect(() => setSearch(q), [q]);

    const [selected, setSelected] = useState(() => new Set());
    const [pending, setPending] = useState({ decision: "approve", rows: [] });

    // Selection belongs to the rows on screen — drop it when the list changes.
    useEffect(() => setSelected(new Set()), [tab, q, page, perPage, rows.length]);

    useEffect(() => {
        if (!actionData) return;
        shopify.toast.show(actionData.message, { isError: actionData.status === "error" });
        setSelected(new Set());
    }, [actionData, shopify]);

    // ── URL ───────────────────────────────────────────────────────────────────
    const go = (next) => {
        const params = new URLSearchParams({
            tab: next.tab ?? tab,
            q: next.q ?? q,
            page: String(next.page ?? 1),
            perPage: String(next.perPage ?? perPage),
        });
        submit(params, { method: "GET", replace: true });
    };
    const resolve = (valueOrFn, current) => (typeof valueOrFn === "function" ? valueOrFn(current) : valueOrFn);

    // ── Selection ─────────────────────────────────────────────────────────────
    const toggle = (id) => setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const togglePage = () => setSelected((prev) =>
        rows.every((r) => prev.has(r.id)) ? new Set() : new Set(rows.map((r) => r.id)));
    const selectedRows = rows.filter((r) => selected.has(r.id));

    // ── Decisions ─────────────────────────────────────────────────────────────
    const askDecision = (decision, list) => setPending({ decision, rows: list });
    const confirmDecision = () => {
        const fd = new FormData();
        fd.set("submitType", pending.decision === "approve" ? "approveReferrals" : "rejectReferrals");
        fd.set("referralIds", pending.rows.map((r) => r.id).join(","));
        submit(fd, { method: "post" });
    };

    return (
        <s-page heading="Referral Reviews">
            {counts.waiting > 0 && tab !== "waiting" && (
                <s-banner slot="supplemental-start" tone="warning" heading={`${counts.waiting} referral${counts.waiting === 1 ? " is" : "s are"} waiting for your decision`}>
                    <s-text>Customers are waiting on these rewards.</s-text>
                    <s-button slot="secondary-actions" variant="secondary" onClick={() => go({ tab: "waiting", page: 1 })}>Show them</s-button>
                </s-banner>
            )}

            <ConfirmDecisionModal decision={pending.decision} rows={pending.rows} busy={busy} onConfirm={confirmDecision} />

            <s-section>
                {/* ── Tabs with live counts ── */}
                <s-stack direction="inline" gap="small" alignItems="center">
                    {TABS.map((t) => (
                        <s-button
                            key={t.key}
                            variant={t.key === tab ? "primary" : "secondary"}
                            disabled={busy}
                            onClick={() => go({ tab: t.key, page: 1 })}
                        >
                            {t.label} ({counts[t.key].toLocaleString()})
                        </s-button>
                    ))}
                </s-stack>

                <s-box paddingBlockStart="base" />
                <s-paragraph tone="subdued">
                    {tab === "waiting" && "These rewards were held because the two accounts look like the same person or household. The referred customer's discount was already applied by Shopify. Approve to award the points, or reject to award nothing."}
                    {tab === "flagged" && "These were rewarded normally, but one weaker signal was noticed (same name, or a similar address), or you approved them after a hold."}
                    {tab === "rejected" && "Rewards you rejected. No points were awarded for these."}
                </s-paragraph>

                {/* ── Search ── */}
                <s-box paddingBlockStart="base" />
                <s-grid gridTemplateColumns="1fr auto auto" gap="small" alignItems="stretch">
                    <s-search-field
                        label="Search referrals"
                        labelAccessibilityVisibility="exclusive"
                        placeholder="Search by name, email, order number or code"
                        value={search}
                        onInput={(e) => setSearch(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") go({ q: search, page: 1 }); }}
                        disabled={busy}
                    />
                    <s-button variant="secondary" disabled={busy} onClick={() => go({ q: search, page: 1 })}>Search</s-button>
                    {q && <s-button variant="tertiary" disabled={busy} onClick={() => go({ q: "", page: 1 })}>Clear</s-button>}
                </s-grid>

                {/* ── Bulk bar (waiting tab, once something is ticked) ── */}
                {tab === "waiting" && selected.size > 0 && (
                    <>
                        <s-box paddingBlockStart="base" />
                        <s-banner tone="info" heading={`${selected.size} selected`}>
                            {selected.size > BULK_LIMIT ? (
                                <s-text>Choose {BULK_LIMIT} or fewer at a time.</s-text>
                            ) : (
                                <s-text>Approve or reject all of them in one go. You&apos;ll be asked to confirm first.</s-text>
                            )}
                            <s-button slot="secondary-actions" variant="secondary" disabled={busy || selected.size > BULK_LIMIT}
                                commandFor="referral-decision-modal" command="--show" onClick={() => askDecision("approve", selectedRows)}>
                                Approve selected
                            </s-button>
                            <s-button slot="secondary-actions" tone="critical" disabled={busy || selected.size > BULK_LIMIT}
                                commandFor="referral-decision-modal" command="--show" onClick={() => askDecision("reject", selectedRows)}>
                                Reject selected
                            </s-button>
                        </s-banner>
                    </>
                )}

                <s-box paddingBlockStart="base" />
                {loading ? (
                    <s-box padding="base" style={{ textAlign: "center", minHeight: "160px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <s-spinner />
                    </s-box>
                ) : (
                    <ReviewTable
                        tab={tab} rows={rows} shop={shop} q={q} busy={busy}
                        selected={selected} onToggle={toggle} onTogglePage={togglePage} onDecide={askDecision}
                    />
                )}

                {total > 0 && (
                    <Pagination
                        currentPage={page}
                        totalPages={totalPages}
                        totalItems={total}
                        perPage={perPage}
                        startIndex={(page - 1) * perPage}
                        setCurrentPage={(v) => go({ page: resolve(v, page) })}
                        setPerPage={(v) => go({ perPage: resolve(v, perPage), page: 1 })}
                        label="referrals"
                        perPageOptions={PER_PAGE_OPTIONS}
                    />
                )}
            </s-section>
        </s-page>
    );
}

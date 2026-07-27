import { useLoaderData, useActionData } from "react-router";
import { authenticate } from "shopify-server";

import { loadCustomers } from "./_loader.server";
import { handleSyncCustomers, handleCustomerCount } from "./_action.server";
import { useCustomersPage } from "./_hooks";
import { CustomerTable } from "./components/CustomerTable";
import { ConfirmSyncModal, SYNC_MODAL_ID } from "./components/ConfirmSyncModal";
import { SyncProgressSection } from "./components/SyncProgressSection";

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);
    return loadCustomers(session.id, session.shop, url.searchParams);
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const submitType = formData.get("submitType");
    const ctx = { formData, session, admin };

    switch (submitType) {
        case "sync-customers": return handleSyncCustomers(ctx);
        case "customer-count": return handleCustomerCount(ctx);
        default: return Response.json({ message: "Unknown action.", isError: true });
    }
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Customers() {
    const loaderData = useLoaderData();
    const actionData = useActionData();
    const page = useCustomersPage(loaderData, actionData);

    return (
        <s-page title="Customers" inlineSize="base">
            {/* onClick fetches the counts; commandFor opens the modal. Both
                are needed: the count has to be in flight by the time the
                modal paints, and the modal has to open declaratively for
                the web component to manage its own focus trap. The same
                split is used by the Start button on the Points Backfill
                page. */}
            {/* accessibilityLabel because Polaris treats a button with an
                icon as icon-only and warns without one — the visible label
                below is a child, not the `label` property it checks. */}
            <s-button
                slot="primary-action"
                variant="primary"
                icon="refresh"
                accessibilityLabel="Sync customers from Shopify"
                loading={page.isSyncRunning}
                disabled={page.isSyncRunning}
                commandFor={SYNC_MODAL_ID}
                command="--show"
                onClick={page.openSyncModal}
            >
                {page.isSyncRunning ? "Syncing…" : "Sync Customers"}
            </s-button>

            {/* Polling gives up eventually rather than pinging the server
                every few seconds forever from a tab left open overnight.
                The sync itself is unaffected — this is only about whether
                this page keeps watching it. */}
            {page.pollExpired && (
                <s-box paddingBlockEnd="base">
                    <s-banner tone="warning">
                        <s-paragraph>
                            <strong>Stopped watching for updates.</strong> This sync has been running a long time —
                            it carries on regardless.
                        </s-paragraph>
                        <s-box paddingBlockStart="small">
                            <s-button variant="secondary" size="small" onClick={page.resumePolling}>
                                Check again
                            </s-button>
                        </s-box>
                    </s-banner>
                </s-box>
            )}

            {(page.isSyncRunning || page.syncJobStatus === "FAILED") && (
                <SyncProgressSection status={page.syncJobStatus} progress={page.syncProgress} />
            )}

            <CustomerTable
                customers={page.customers}
                totalCount={page.totalCount}
                totalPages={page.totalPages}
                page={page.page}
                pageSize={page.pageSize}
                localSearch={page.localSearch}
                sortBy={page.sortBy}
                isLoading={page.isLoading}
                navigatingTo={page.navigatingTo}
                loaderError={page.loaderError}
                onSearch={page.handleSearch}
                onSearchSubmit={page.handleSearchSubmit}
                onSearchKeyDown={page.handleSearchKeyDown}
                onSortChange={page.handleSortChange}
                onPageChange={page.handlePageChange}
                onPageSizeChange={page.handlePageSizeChange}
                onDetails={page.handleDetails}
            />

            <ConfirmSyncModal
                shopifyCount={page.shopifyCustomerCount}
                shopifyCountPrecision={page.shopifyCountPrecision}
                localCount={page.localCustomerCount}
                isCounting={page.isCounting}
                onConfirm={page.handleSync}
            />
        </s-page>
    );
}
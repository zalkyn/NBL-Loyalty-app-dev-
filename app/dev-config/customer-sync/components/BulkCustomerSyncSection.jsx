/**
 * @file dev-config/customer-sync/components/BulkCustomerSyncSection.jsx
 * @description Bulk "sync everyone's metafields from the DB" tool, plus
 * the two destructive maintenance tools (reset sync status, empty config)
 * — see maintenanceToolFlags.js. Same tools, same behaviour, in
 * development and production.
 */

import { MODAL_ID } from "../_hooks";

export function BulkCustomerSyncSection({
    syncStatus, syncPct, activeScope, submittingScope, syncSubmitting, syncFetcher,
    toolFlags, emptyConfigStatus,
    requestBulkSync, requestResetSyncStatus, requestEmptyConfig,
}) {
    return (
        <s-section heading="Bulk Customer Sync">
            <s-paragraph tone="subdued">
                "Syncing" means copying a customer's loyalty data (points,
                rewards, transactions, prize claims) from the app's database
                into their Shopify account, so their widget shows the right
                numbers. This normally happens on its own whenever they earn
                or redeem something — this section is just a manual way to do
                it in bulk if data has drifted or you've made a big change.
            </s-paragraph>
            <s-paragraph tone="subdued">
                It runs in the background in small batches, so it's safe on any
                number of customers — you can leave the page and come back.
                Refresh to see updated progress. Two options below: "Sync only
                unsynced customers" catches just the ones who've never been
                synced (lighter, the usual choice); "Sync all customers now"
                re-syncs everyone from scratch (heavier — only when you're sure
                a full refresh is needed).
            </s-paragraph>

            <s-box paddingBlockStart="base">
                <s-text>
                    {syncStatus.syncedCustomers.toLocaleString()} / {syncStatus.totalCustomers.toLocaleString()} customers synced ({syncPct}%)
                </s-text>
            </s-box>

            {activeScope && (
                <s-paragraph tone="subdued">
                    A "{activeScope}" sync is currently running in the background (resumed from customer #{syncStatus.activeJob.cursor}).
                </s-paragraph>
            )}

            {syncFetcher.data?.message && (
                <s-paragraph tone={syncFetcher.data.ok ? "success" : "critical"}>
                    {syncFetcher.data.message}
                </s-paragraph>
            )}

            <s-box paddingBlockStart="base">
                <s-stack direction="inline" gap="base">
                    <s-button
                        variant="secondary"
                        disabled={syncSubmitting || !!activeScope}
                        commandFor={MODAL_ID}
                        command="--show"
                        onClick={() => requestBulkSync("unsynced")}
                    >
                        {submittingScope === "unsynced" || activeScope === "unsynced" ? "Syncing…" : "Sync only unsynced customers"}
                    </s-button>
                    <s-button
                        variant="secondary"
                        disabled={syncSubmitting || !!activeScope}
                        commandFor={MODAL_ID}
                        command="--show"
                        onClick={() => requestBulkSync("all")}
                    >
                        {submittingScope === "all" || activeScope === "all" ? "Syncing…" : "Sync all customers now"}
                    </s-button>
                </s-stack>
            </s-box>

            {toolFlags.showResetSyncButton && (
                <s-box paddingBlockStart="base">
                    <s-paragraph tone="critical">
                        Resets the "last synced" marker for every customer at
                        once, so the app treats them all as never-synced. It
                        does not touch real points or Shopify data — only the
                        internal tracking used to decide who needs an update.
                        Mainly for re-testing the update flow. Read the
                        confirmation before proceeding.
                    </s-paragraph>
                    <s-button
                        variant="secondary"
                        tone="critical"
                        disabled={syncSubmitting}
                        commandFor={MODAL_ID}
                        command="--show"
                        onClick={requestResetSyncStatus}
                    >
                        Reset all customers' sync status
                    </s-button>
                </s-box>
            )}

            {toolFlags.showEmptyConfigButton && (
                <s-box paddingBlockStart="base">
                    <s-paragraph tone="critical">
                        Permanently deletes the real Shopify loyalty data
                        (points, rewards, transactions, prize claims) for every
                        customer who is currently synced — used to test how the
                        widget behaves when data goes missing. This cannot be
                        undone; the only way back is running a sync again.
                        Read the confirmation carefully before proceeding.
                    </s-paragraph>
                    {emptyConfigStatus.active && (
                        <s-paragraph tone="subdued">
                            An empty-config job is currently running (resumed from customer #{emptyConfigStatus.cursor}).
                        </s-paragraph>
                    )}
                    <s-button
                        variant="secondary"
                        tone="critical"
                        disabled={syncSubmitting || emptyConfigStatus.active}
                        commandFor={MODAL_ID}
                        command="--show"
                        onClick={requestEmptyConfig}
                    >
                        {emptyConfigStatus.active ? "Emptying…" : "Empty already-synced customers' config"}
                    </s-button>
                </s-box>
            )}
        </s-section>
    );
}

/**
 * @file dev-config/customer-sync/_hooks.js
 * @description All client-side state + handlers for the Customer Sync
 * page. Split out of version-tracking/_hooks.js — see that file's git
 * history for the original combined version.
 *
 * Two independent useFetcher() instances on purpose — "bulk sync /
 * maintenance tools" and "single customer sync" each need their own loading state, so
 * submitting one never disables/shows loading on the other's buttons.
 *
 * Every mutating action on this page goes through ONE shared confirmation
 * modal (see MODAL_ID) — every request* function below only ever *stages*
 * a pending action; nothing fires until confirmPendingAction() runs, which
 * only happens from the modal's own Confirm button.
 */

import { useState } from "react";
import { useFetcher, useSearchParams } from "react-router";

// Shared id for the single confirmation modal — every trigger button on
// this page references this via commandFor to open it declaratively.
export const MODAL_ID = "customer-sync-confirm-modal";

export function useCustomerSyncPage(loaderData) {
    const { syncStatus, toolFlags, emptyConfigStatus, searchedEmail, foundCustomer } = loaderData;

    const [searchParams, setSearchParams] = useSearchParams();

    // ── Shared confirm-modal flow ────────────────────────────────────────────
    const [pendingAction, setPendingAction] = useState(null);

    function confirmPendingAction() {
        if (pendingAction) pendingAction.run();
        setPendingAction(null);
        // Closing the modal itself is handled declaratively — the Confirm
        // button also carries commandFor={MODAL_ID} command="--hide".
    }

    // ── "Bulk Customer Sync" + maintenance tools section ─────────────────────
    const syncFetcher = useFetcher();
    const syncSubmitting = syncFetcher.state !== "idle";
    // Which scope is currently mid-submit — used to show "Syncing…" on
    // only the specific button that was clicked, not both.
    const submittingScope = syncSubmitting ? syncFetcher.formData?.get("scope") : null;
    // A sync can also already be running from a PREVIOUS page load/session
    // (this is a background job — it keeps running after the request that
    // started it finishes) — syncStatus.activeJob covers that case, so
    // both buttons stay disabled and reflect the truly-active scope even
    // right after a fresh page load, not just mid-submit.
    const activeScope = syncStatus.activeJob?.scope ?? null;
    const syncPct = syncStatus.totalCustomers > 0
        ? Math.round((syncStatus.syncedCustomers / syncStatus.totalCustomers) * 100)
        : 0;

    function requestBulkSync(scope) {
        if (syncSubmitting || activeScope) return;
        const isAll = scope === "all";
        setPendingAction({
            confirmHeading: isAll ? "Sync ALL customers now?" : "Sync only unsynced customers?",
            confirmText: isAll
                ? "This is a sensitive, resource-intensive action — please read carefully before confirming. " +
                  "It re-syncs EVERY customer's app data (points, rewards, transactions, prize claims) from the " +
                  "database, regardless of whether they've synced before. For a large customer base this makes many " +
                  "real Shopify API calls over a long period and can't be cancelled once started. Only proceed if " +
                  "you're sure a full re-sync is actually needed — for most cases, \"Sync only unsynced customers\" " +
                  "below is the safer, lighter option."
                : "This is a sensitive, resource-intensive action — please read carefully before confirming. " +
                  "It re-syncs every customer who has never been fully synced yet, making real Shopify API calls " +
                  "for each one in the background. This can take a while for a large customer base and can't be " +
                  "cancelled once started. Be careful — only run this if you're sure it's needed right now.",
            run: () => syncFetcher.submit({ intent: "bulkSync", scope }, { method: "post" }),
        });
    }

    // Maintenance tool — available on every shop, in development and
    // production alike.
    function requestResetSyncStatus() {
        if (syncSubmitting) return;
        setPendingAction({
            confirmHeading: "Reset ALL customers' sync status?",
            confirmText:
                "It resets every customer's internal \"last synced\" tracking back to null, making the app think nobody " +
                "has ever synced — so the update banner and sync flow can be re-run from a clean state, repeatedly. " +
                "It does NOT touch Shopify or any customer's real metafields, only this app's own database. Still, be " +
                "careful: this affects your entire customer base's tracked sync status at once, and can't be undone " +
                "(other than by running a real sync again).",
            run: () => syncFetcher.submit({ intent: "resetSyncStatus" }, { method: "post" }),
        });
    }

    // Maintenance tool — genuinely destructive to REAL Shopify data
    // (deletes metafields), not just this app's own DB — see
    // emptyCustomerConfigJob.js.
    function requestEmptyConfig() {
        if (syncSubmitting || emptyConfigStatus.active) return;
        setPendingAction({
            confirmHeading: "Empty already-synced customers' config?",
            confirmText:
                "DESTRUCTIVE to real Shopify data — please read carefully. It deletes the actual app metafields " +
                "(points, rewards, transactions, prize claims) on Shopify for every customer who currently has a " +
                "synced config, simulating a customer whose data went missing or was never written — useful for " +
                "exercising the self-heal/fallback behavior against real data, not just this app's database. Runs " +
                "in the background (real Shopify API calls per customer, can take a while) and cannot be undone — " +
                "the only way back is running a real sync again afterward. Use only when you actually mean to " +
                "clear this data — it affects your real customer base.",
            run: () => syncFetcher.submit({ intent: "emptyConfig" }, { method: "post" }),
        });
    }

    // ── "Single Customer Sync" section — email search + per-customer
    //    Sync/Resync/Empty config/Delete record, all through the same
    //    shared confirm modal as everything else on this page. See
    //    _action.server.js for the matching intents.
    const [emailInput, setEmailInput] = useState(searchedEmail || "");
    function handleEmailSearch() {
        const next = new URLSearchParams(searchParams);
        next.set("email", emailInput.trim());
        setSearchParams(next);
    }
    function handleEmailKeyDown(e) {
        if (e.key === "Enter") handleEmailSearch();
    }

    // Separate fetcher again — so this section's loading state never
    // interferes with the bulk-sync section above.
    const customerFetcher = useFetcher();
    const customerActionSubmitting = customerFetcher.state !== "idle";

    function requestSyncCustomer(customer, mode) {
        if (customerActionSubmitting) return;
        const isResync = mode === "resync";
        setPendingAction({
            confirmHeading: isResync ? "Re-sync this customer's config?" : "Sync this customer's config?",
            confirmText:
                `This ${isResync ? "re-writes" : "writes"} ${customer.name || customer.email}'s current points, rewards, ` +
                "transactions and prize claims to their Shopify app metafields — a real API call. Safe to run; " +
                "this is the same sync that already happens automatically on their own order/reward/referral events.",
            run: () => customerFetcher.submit({ intent: "syncCustomer", shopifyId: customer.shopifyId }, { method: "post" }),
        });
    }

    // Maintenance tool — same rationale as requestEmptyConfig above, just
    // for one customer instead of every already-synced customer.
    function requestEmptyOneCustomerConfig(customer) {
        if (customerActionSubmitting) return;
        setPendingAction({
            confirmHeading: "Empty this customer's config?",
            confirmText:
                `DESTRUCTIVE to real Shopify data for ${customer.name || customer.email} — ` +
                "it deletes their actual app metafields (points, rewards, transactions, prize claims) on Shopify, " +
                "simulating a customer whose synced data went missing. Cannot be undone — the only way back is " +
                "syncing them again afterward. Use only when you actually mean to clear this customer's data.",
            run: () => customerFetcher.submit(
                { intent: "emptyOneCustomerConfig", shopifyId: customer.shopifyId, customerId: String(customer.id) },
                { method: "post" }
            ),
        });
    }

    // Maintenance tool — most destructive single-customer action on this
    // page: deletes both Shopify metafields AND the app DB row (cascading
    // to their transactions/rewards/prize claims/referral history). Unlike
    // requestEmptyOneCustomerConfig above (which only clears metafields so
    // the self-heal path restores their data), this leaves nothing to
    // self-heal from — the next visit genuinely looks like a brand-new
    // customer, reproducing the widget's "Join our Program" step. See
    // deleteCustomerRecord.js.
    function requestDeleteCustomerRecord(customer) {
        if (customerActionSubmitting) return;
        setPendingAction({
            confirmHeading: "Delete this customer's app record entirely?",
            confirmText:
                `This permanently deletes ${customer.name || customer.email}'s ` +
                "Shopify app metafields (including the old legacy metafield, unlike \"Empty config\" — see below) AND their " +
                "entire app-database record (points, rewards, transactions, prize claims, referral history — all of it). " +
                "Unlike \"Empty config\", this leaves nothing for the app to self-heal from AND nothing for the widget to " +
                "fall back to, so their next storefront visit is treated as a genuinely brand-new customer — this reproduces " +
                "the \"Join our Program\" step, which the self-heal + legacy-fallback paths always bypass otherwise. " +
                "Note: their widget shows the explicit Join panel by default — it only skips straight past it if " +
                "this shop has \"Join automatically\" turned ON under Customize &gt; New Customer Onboarding, in which " +
                "case it silently re-creates their record and reloads before they'd see it. " +
                "Also make sure to do a FULL page reload (not just re-opening the widget) on the storefront afterward — the " +
                "widget only re-reads customer data on page load. Cannot be undone — the only way back is re-syncing from " +
                "Shopify, which only happens if they place a new order or click Join again. Use only when you actually " +
                "mean to remove this customer's record.",
            run: () => customerFetcher.submit(
                { intent: "deleteCustomerRecord", shopifyId: customer.shopifyId, customerId: String(customer.id) },
                { method: "post" }
            ),
        });
    }

    return {
        // Shared modal
        pendingAction, setPendingAction, confirmPendingAction,

        // Bulk sync + maintenance tools section
        syncFetcher, syncSubmitting, submittingScope, activeScope, syncPct,
        requestBulkSync, requestResetSyncStatus, requestEmptyConfig,
        toolFlags, emptyConfigStatus, syncStatus,

        // Single customer section
        emailInput, setEmailInput, handleEmailSearch, handleEmailKeyDown,
        customerFetcher, customerActionSubmitting,
        requestSyncCustomer, requestEmptyOneCustomerConfig, requestDeleteCustomerRecord,
        searchedEmail, foundCustomer,
    };
}

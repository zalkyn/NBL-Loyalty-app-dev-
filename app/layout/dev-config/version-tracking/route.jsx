/**
 * @file dev-config/version-tracking/route.jsx
 *
 * Admin page for the widget's "an update is available" banner.
 *
 *   - Announce a new version (title + description shown to customers).
 *   - See rollout progress: how many of the shop's customers have synced
 *     to each announced version.
 *   - History is append-only — old versions are never deleted, only
 *     superseded (see createConfigUpdateVersion.js).
 *
 * The banner itself has a separate master on/off switch, deliberately kept
 * on the Customize page (Update Notifications section) rather than here —
 * an admin can instantly kill the banner without losing this history.
 *
 * Detection is entirely client-side in the widget (zero extra network
 * call) — see main.preact.jsx's computeUpdateStatus() and
 * syncAppConfig.js/syncCustomerConfig.js for how the active version
 * reaches the shop metafield and how a customer's own sync gets stamped.
 */

import { useState } from "react";
import { useLoaderData, useFetcher, useSearchParams } from "react-router";
import { authenticate } from "shopify-server";

import createConfigUpdateVersion from "@controller/configUpdateVersion/createConfigUpdateVersion";
import listConfigUpdateVersions from "@controller/configUpdateVersion/listConfigUpdateVersions";
import { loadCustomizeData } from "app/layout/customize/_loader.server.js";
import { buildInitialWidgetConfig } from "app/layout/customize/constants/cssVarsConfig.js";
import { enqueueBulkCustomerSync, getBulkCustomerSyncStatus } from "@controller/jobs/bulkCustomerSync";
import { enqueueEmptyCustomerConfig, getEmptyCustomerConfigStatus } from "@controller/jobs/emptyCustomerConfig";
import { resetAllCustomersSyncStatus } from "@controller/customers/resetAllSyncStatus";
import { getTestingFlags } from "@controller/appSettings/testingFlags";
import { syncCustomerConfig } from "app/controller/metafieldsSync/syncCustomerConfig";
import clearCustomerMetafields from "app/graphql/mutation/metafieldsSync/clearCustomerMetafields.js";
import deleteCustomerRecord from "@controller/customers/deleteCustomerRecord.js";
import syncAppConfig from "@controller/metafieldsSync/syncAppConfig";
import prisma from "db-server";
import { logger } from "app/utils/logger.js";

const MODULE = "layout/dev-config/version-tracking/route.jsx";

// Every action on this page (publishing a version, starting a bulk sync)
// affects REAL customers or does real Shopify API work at scale — a
// misclick here isn't like a typo in a text field, it can't be silently
// undone. Every trigger button goes through this ONE shared confirmation
// modal (same declarative commandFor/command="--show"/"--hide" pattern as
// the queue-jobs page) — nothing on this page executes on a single
// click.
const MODAL_ID = "config-versions-confirm-modal";

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const email = url.searchParams.get("email")?.trim().slice(0, 200) || "";

    const [{ versions, totalCustomers }, syncStatus, testingFlags, emptyConfigStatus, foundCustomer, customizeData] = await Promise.all([
        listConfigUpdateVersions({ shop: session.shop, sessionId: session.id }),
        getBulkCustomerSyncStatus({ shop: session.shop, sessionId: session.id }),
        getTestingFlags(session.shop),
        getEmptyCustomerConfigStatus(session.shop),
        // Single-customer search — exact email match, scoped to this shop.
        // Only runs the query when an email was actually submitted.
        email
            ? prisma.customer.findFirst({
                where: { sessionId: session.id, email: { equals: email, mode: "insensitive" } },
                select: { id: true, shopifyId: true, name: true, email: true, points: true, lastSyncedVersionKey: true },
            })
            : null,
        // Read-only — the actual "off/banner/auto" setting lives on the
        // Customize page (see cssVarsConfig.js's WIDGET_CONFIG_SECTIONS
        // "resync" section for why it's kept there, not here: it's a
        // real merchant-facing behavior setting, this page is
        // developer-only trigger/test tools). Shown here purely so a
        // developer testing rollout doesn't have to tab-switch to check
        // which mode is currently live.
        loadCustomizeData(session.shop),
    ]);
    const updateMode = buildInitialWidgetConfig(customizeData.savedWidgetConfig).resync.updateMode;

    return { versions, totalCustomers, syncStatus, testingFlags, emptyConfigStatus, searchedEmail: email, foundCustomer, updateMode };
};

// ─── Action ───────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
    const { session, admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent")?.toString() || "publishVersion";

    if (intent === "bulkSync") {
        const scope = formData.get("scope")?.toString();
        return enqueueBulkCustomerSync({ shop: session.shop, scope });
    }

    if (intent === "resetSyncStatus") {
        // Re-check the flag server-side too, not just at render time — the
        // button not rendering is the primary safety mechanism, but a
        // direct POST to this action must never work either just because
        // someone knows the intent string. See testingFlags.js: there's no
        // app UI path that can ever set this true, only a developer
        // editing the database directly.
        const testingFlags = await getTestingFlags(session.shop);
        if (!testingFlags.showResetSyncButton) {
            logger.warn(MODULE, "Blocked resetSyncStatus — testing flag is off", { shop: session.shop });
            return { ok: false, message: "This action is disabled." };
        }
        return resetAllCustomersSyncStatus({ shop: session.shop, sessionId: session.id });
    }

    if (intent === "emptyConfig") {
        // Same server-side re-check as resetSyncStatus above.
        const testingFlags = await getTestingFlags(session.shop);
        if (!testingFlags.showEmptyConfigButton) {
            logger.warn(MODULE, "Blocked emptyConfig — testing flag is off", { shop: session.shop });
            return { ok: false, message: "This action is disabled." };
        }
        return enqueueEmptyCustomerConfig({ shop: session.shop });
    }

    // ── Single-customer sync/resync — see this file's "Single Customer Sync"
    //    section below. Same underlying syncCustomerConfig call used
    //    everywhere else in the app (order/reward/referral events) —
    //    "sync" vs "resync" is a UI-only distinction (which button shows,
    //    based on whether the found customer is already synced).
    if (intent === "syncCustomer") {
        const shopifyId = formData.get("shopifyId")?.toString();
        if (!shopifyId) return { ok: false, message: "Missing customer." };

        const customer = await syncCustomerConfig(admin, shopifyId);
        if (!customer) {
            logger.error(MODULE, "Failed to sync single customer", { shop: session.shop, shopifyId });
            return { ok: false, message: "Sync failed. Please try again." };
        }
        return { ok: true, message: "Customer synced." };
    }

    // ── Single-customer empty config (TESTING ONLY) — same destructive
    //    operation as the bulk "empty already-synced customers' config"
    //    tool above, for just one customer. Fast enough (one API call) to
    //    run synchronously, no background job needed.
    if (intent === "emptyOneCustomerConfig") {
        const testingFlags = await getTestingFlags(session.shop);
        if (!testingFlags.showEmptyConfigButton) {
            logger.warn(MODULE, "Blocked emptyOneCustomerConfig — testing flag is off", { shop: session.shop });
            return { ok: false, message: "This action is disabled." };
        }

        const shopifyId = formData.get("shopifyId")?.toString();
        const customerId = Number(formData.get("customerId"));
        if (!shopifyId || !customerId) return { ok: false, message: "Missing customer." };

        try {
            await clearCustomerMetafields(admin, shopifyId);
            await prisma.customer.update({ where: { id: customerId }, data: { lastSyncedVersionKey: null } });
            return { ok: true, message: "Customer's config emptied." };
        } catch (error) {
            logger.error(MODULE, "Failed to empty single customer config", { shop: session.shop, shopifyId, error: error?.message });
            return { ok: false, message: "Failed to empty config. Please try again." };
        }
    }

    // ── Single-customer full record delete (TESTING ONLY) — deletes the
    //    Shopify metafields AND the app DB row, so the next visit has no
    //    record to self-heal from and the widget's actual "Join our
    //    Program" step can be reproduced/tested. See
    //    deleteCustomerRecord.js for why this is a separate tool from
    //    "emptyOneCustomerConfig" above rather than the same one.
    if (intent === "deleteCustomerRecord") {
        const testingFlags = await getTestingFlags(session.shop);
        if (!testingFlags.showDeleteCustomerButton) {
            logger.warn(MODULE, "Blocked deleteCustomerRecord — testing flag is off", { shop: session.shop });
            return { ok: false, message: "This action is disabled." };
        }

        const shopifyId = formData.get("shopifyId")?.toString();
        const customerId = Number(formData.get("customerId"));
        if (!shopifyId || !customerId) return { ok: false, message: "Missing customer." };

        try {
            await deleteCustomerRecord(admin, { shop: session.shop, customerId, shopifyId });
            return { ok: true, message: "Customer's app record deleted. They'll be treated as brand new on their next visit." };
        } catch (error) {
            logger.error(MODULE, "Failed to delete customer record", { shop: session.shop, shopifyId, error: error?.message });
            return { ok: false, message: "Failed to delete customer record. Please try again." };
        }
    }

    const title = formData.get("title")?.toString() || "";
    const description = formData.get("description")?.toString() || "";

    try {
        const version = await createConfigUpdateVersion({ shop: session.shop, title, description });

        // Push the new active version to the shop metafield so it's visible
        // to the storefront right away — mirrors the Customize page's own
        // upsertAndSync pattern (save to DB, then sync).
        await syncAppConfig(admin, session);

        return { ok: true, message: `"${version.title}" is now the active version.` };
    } catch (error) {
        logger.error(MODULE, "Failed to create config update version", { shop: session.shop, error: error?.message });
        return { ok: false, message: error?.message || "Failed to create version." };
    }
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConfigVersionsPage() {
    const { versions, totalCustomers, syncStatus, testingFlags, emptyConfigStatus, searchedEmail, foundCustomer, updateMode } = useLoaderData();
    const [searchParams, setSearchParams] = useSearchParams();
    const fetcher = useFetcher();
    const busy = fetcher.state !== "idle";

    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");

    // ── Shared confirm-modal flow — see MODAL_ID's comment above. Every
    //    action below only ever *requests* a pending action; the actual
    //    fetcher.submit only happens from confirmPendingAction(), after the
    //    admin explicitly clicks "Confirm" in the modal.
    const [pendingAction, setPendingAction] = useState(null);

    function confirmPendingAction() {
        if (pendingAction) pendingAction.run();
        setPendingAction(null);
        // Closing the modal itself is handled declaratively — the Confirm
        // button also carries commandFor={MODAL_ID} command="--hide".
    }

    function requestPublish() {
        if (!title.trim() || busy) return;
        setPendingAction({
            confirmHeading: "Publish this update?",
            confirmText:
                "This is a sensitive, shop-wide action — please read carefully before confirming. " +
                "Publishing makes this the new active version immediately. If the update banner is turned on " +
                "(Customize > Update Notifications), every customer whose account hasn't synced yet will start " +
                "seeing it — this can mean a large portion of your customer base, right away. " +
                "Double-check the title/description are correct before continuing; this cannot be undone, only superseded by publishing another version.",
            run: () => {
                fetcher.submit({ intent: "publishVersion", title, description }, { method: "post" });
                setTitle("");
                setDescription("");
            },
        });
    }

    // Separate fetcher from the "publish version" form above — so
    // submitting one never disables/shows loading on the other's buttons.
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
            confirmHeading: isAll ? 'Sync ALL customers now?' : "Sync only unsynced customers?",
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

    // TESTING ONLY — see testingFlags.js for why testingFlags.showResetSyncButton
    // can only ever be true via a developer directly editing the database,
    // never through any UI this app exposes. The button below doesn't even
    // render unless that's true, so in production this whole block is dead
    // code from the user's point of view — nothing to accidentally click.
    function requestResetSyncStatus() {
        if (syncSubmitting) return;
        setPendingAction({
            confirmHeading: "Reset ALL customers' sync status? (TESTING ONLY)",
            confirmText:
                "This is a developer testing tool — it should never be used against a real production customer base. " +
                "It resets every customer's internal \"last synced\" tracking back to null, making the app think nobody " +
                "has ever synced — so the update banner and sync flow can be re-tested from a clean state, repeatedly. " +
                "It does NOT touch Shopify or any customer's real metafields, only this app's own database. Still, be " +
                "careful: this affects your entire customer base's tracked sync status at once, and can't be undone " +
                "(other than by running a real sync again).",
            run: () => syncFetcher.submit({ intent: "resetSyncStatus" }, { method: "post" }),
        });
    }

    // TESTING ONLY — same gating principle as requestResetSyncStatus above,
    // but this one is genuinely destructive to REAL Shopify data (deletes
    // metafields), not just this app's own DB — see emptyCustomerConfigJob.js.
    function requestEmptyConfig() {
        if (syncSubmitting || emptyConfigStatus.active) return;
        setPendingAction({
            confirmHeading: "Empty already-synced customers' config? (TESTING ONLY)",
            confirmText:
                "This is a developer testing tool and is DESTRUCTIVE to real Shopify data — please read carefully. " +
                "It deletes the actual app metafields (points, rewards, transactions, prize claims) on Shopify for " +
                "every customer who currently has a synced config, simulating a customer whose data went missing " +
                "or was never written — useful for testing the self-heal/fallback behavior against real data, not " +
                "just this app's database. Runs in the background (real Shopify API calls per customer, can take a " +
                "while) and cannot be undone — the only way back is running a real sync again afterward. Never use " +
                "this against a real production customer base.",
            run: () => syncFetcher.submit({ intent: "emptyConfig" }, { method: "post" }),
        });
    }

    // ── Single Customer Sync — email search + per-customer Sync/Resync/Empty
    //    config, all through the same shared confirm modal as everything
    //    else on this page. See this file's action() for the matching
    //    "syncCustomer" / "emptyOneCustomerConfig" intents.
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
    // interferes with the bulk-sync or publish-version sections above.
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

    // TESTING ONLY — same gating principle as requestEmptyConfig above, just
    // for one customer instead of every already-synced customer.
    function requestEmptyOneCustomerConfig(customer) {
        if (customerActionSubmitting) return;
        setPendingAction({
            confirmHeading: "Empty this customer's config? (TESTING ONLY)",
            confirmText:
                `This is a developer testing tool and is DESTRUCTIVE to real Shopify data for ${customer.name || customer.email} — ` +
                "it deletes their actual app metafields (points, rewards, transactions, prize claims) on Shopify, " +
                "simulating a customer whose synced data went missing. Cannot be undone — the only way back is " +
                "syncing them again afterward. Never use this against a real customer.",
            run: () => customerFetcher.submit(
                { intent: "emptyOneCustomerConfig", shopifyId: customer.shopifyId, customerId: String(customer.id) },
                { method: "post" }
            ),
        });
    }

    // TESTING ONLY — most destructive single-customer action on this page:
    // deletes both Shopify metafields AND the app DB row (cascading to
    // their transactions/rewards/prize claims/referral history). Unlike
    // requestEmptyOneCustomerConfig above (which only clears metafields so
    // the self-heal path restores their data), this leaves nothing to
    // self-heal from — the next visit genuinely looks like a brand-new
    // customer, so the widget's "Join our Program" step can actually be
    // tested. See deleteCustomerRecord.js.
    function requestDeleteCustomerRecord(customer) {
        if (customerActionSubmitting) return;
        setPendingAction({
            confirmHeading: "Delete this customer's app record entirely? (TESTING ONLY)",
            confirmText:
                `This is a developer testing tool and is DESTRUCTIVE — it permanently deletes ${customer.name || customer.email}'s ` +
                "Shopify app metafields (including the old legacy metafield, unlike \"Empty config\" — see below) AND their " +
                "entire app-database record (points, rewards, transactions, prize claims, referral history — all of it). " +
                "Unlike \"Empty config\", this leaves nothing for the app to self-heal from AND nothing for the widget to " +
                "fall back to, so their next storefront visit is treated as a genuinely brand-new customer — useful for " +
                "testing the \"Join our Program\" step, which the self-heal + legacy-fallback paths always bypass otherwise. " +
                "Note: their widget will show the explicit Join panel by default now — it only skips straight past it if " +
                "this shop has \"Join automatically\" turned ON under Customize &gt; New Customer Onboarding, in which " +
                "case it silently re-creates their record and reloads before they'd see it. " +
                "Also make sure to do a FULL page reload (not just re-opening the widget) on the storefront afterward — the " +
                "widget only re-reads customer data on page load. Cannot be undone — this is not a real customer's data " +
                "recovery, only re-syncing from Shopify can rebuild it, and only if they place a new order or click Join " +
                "again. Never use this against a real customer.",
            run: () => customerFetcher.submit(
                { intent: "deleteCustomerRecord", shopifyId: customer.shopifyId, customerId: String(customer.id) },
                { method: "post" }
            ),
        });
    }

    return (
        <s-page heading="Version Tracking">
            <s-section heading="Customer Config Sync">
                <s-paragraph tone="subdued">
                    Manually re-syncs customers' app metafields (points, rewards,
                    transactions, prize claims) straight from the database — the same
                    full sync that already happens automatically on their own order/
                    reward/referral events. Runs in the background in small batches
                    (see queue-jobs (/app/dev-config/queue-jobs) &gt; BULK_CUSTOMER_SYNC), so it's safe to use
                    on any size customer base — refresh this page to see updated
                    progress.
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

                {testingFlags.showResetSyncButton && (
                    <s-box paddingBlockStart="base">
                        <s-paragraph tone="critical">
                            TESTING ONLY — this button is enabled by a database flag a developer set manually. It
                            should never be visible on a real production shop. If you're seeing this on a live
                            store, tell your developer to turn it off.
                        </s-paragraph>
                        <s-button
                            variant="secondary"
                            tone="critical"
                            disabled={syncSubmitting}
                            commandFor={MODAL_ID}
                            command="--show"
                            onClick={requestResetSyncStatus}
                        >
                            Reset all customers' sync status (testing only)
                        </s-button>
                    </s-box>
                )}

                {testingFlags.showEmptyConfigButton && (
                    <s-box paddingBlockStart="base">
                        <s-paragraph tone="critical">
                            TESTING ONLY — DESTRUCTIVE to real Shopify data. Enabled by a database flag a developer
                            set manually. Never use on a real production shop.
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
                            {emptyConfigStatus.active ? "Emptying…" : "Empty already-synced customers' config (testing only)"}
                        </s-button>
                    </s-box>
                )}
            </s-section>

            <s-section heading="Single Customer Sync">
                <s-paragraph tone="subdued">
                    Look up one customer by email to sync, re-sync, or (testing only) empty just their config —
                    useful for fixing/testing one specific account without touching anyone else.
                </s-paragraph>

                <s-box paddingBlockStart="base">
                    <s-stack direction="inline" gap="base">
                        <s-text-field
                            label="Customer email"
                            labelAccessibilityVisibility="exclusive"
                            placeholder="customer@example.com"
                            value={emailInput}
                            disabled={customerActionSubmitting}
                            onInput={(e) => setEmailInput(e.target.value)}
                            onKeyDown={handleEmailKeyDown}
                        />
                        <s-button
                            variant="secondary"
                            disabled={customerActionSubmitting || !emailInput.trim()}
                            onClick={handleEmailSearch}
                        >
                            Search
                        </s-button>
                    </s-stack>
                </s-box>

                {customerFetcher.data?.message && (
                    <s-box paddingBlockStart="base">
                        <s-paragraph tone={customerFetcher.data.ok ? "success" : "critical"}>
                            {customerFetcher.data.message}
                        </s-paragraph>
                    </s-box>
                )}

                {searchedEmail && !foundCustomer && (
                    <s-box paddingBlockStart="base">
                        <s-paragraph tone="subdued">No customer found for "{searchedEmail}".</s-paragraph>
                    </s-box>
                )}

                {foundCustomer && (
                    <s-box paddingBlockStart="base">
                        <s-text fontWeight="bold">{foundCustomer.name || foundCustomer.email}</s-text>
                        <s-box>
                            <s-text tone="subdued">
                                {foundCustomer.email} — {foundCustomer.points.toLocaleString()} pts — {foundCustomer.lastSyncedVersionKey ? "synced" : "never synced"}
                            </s-text>
                        </s-box>
                        <s-box paddingBlockStart="base">
                            <s-stack direction="inline" gap="base">
                                {foundCustomer.lastSyncedVersionKey ? (
                                    <s-button
                                        variant="secondary"
                                        disabled={customerActionSubmitting}
                                        commandFor={MODAL_ID}
                                        command="--show"
                                        onClick={() => requestSyncCustomer(foundCustomer, "resync")}
                                    >
                                        Resync
                                    </s-button>
                                ) : (
                                    <s-button
                                        variant="secondary"
                                        disabled={customerActionSubmitting}
                                        commandFor={MODAL_ID}
                                        command="--show"
                                        onClick={() => requestSyncCustomer(foundCustomer, "sync")}
                                    >
                                        Sync
                                    </s-button>
                                )}
                                {testingFlags.showEmptyConfigButton && foundCustomer.lastSyncedVersionKey && (
                                    <s-button
                                        variant="secondary"
                                        tone="critical"
                                        disabled={customerActionSubmitting}
                                        commandFor={MODAL_ID}
                                        command="--show"
                                        onClick={() => requestEmptyOneCustomerConfig(foundCustomer)}
                                    >
                                        Empty config (testing only)
                                    </s-button>
                                )}
                                {testingFlags.showDeleteCustomerButton && (
                                    <s-button
                                        variant="secondary"
                                        tone="critical"
                                        disabled={customerActionSubmitting}
                                        commandFor={MODAL_ID}
                                        command="--show"
                                        onClick={() => requestDeleteCustomerRecord(foundCustomer)}
                                    >
                                        Delete record entirely (testing only)
                                    </s-button>
                                )}
                            </s-stack>
                        </s-box>
                    </s-box>
                )}
            </s-section>

            <s-section heading="Announce a new update">
                <s-box paddingBlockEnd="base">
                    <s-badge tone={updateMode === "off" ? undefined : "success"}>
                        Update method: {updateMode === "auto" ? "Auto-sync" : updateMode === "banner" ? "Banner (manual)" : "Off"}
                    </s-badge>
                    <s-box paddingBlockStart="small">
                        <s-link href="/app/customize">
                            Change this in Customize &gt; Update Notifications
                        </s-link>
                    </s-box>
                </s-box>
                <s-paragraph tone="subdued">
                    Creating a new version flags any customer whose account
                    hasn't synced it yet — shown as a banner, or silently
                    auto-synced, depending on the method above (read-only
                    here; change it on the Customize page — see badge above).
                </s-paragraph>
                <s-paragraph tone="subdued">
                    The title and description below are for your own internal
                    tracking only (shown in the history table further down) — they
                    are never shown to customers, not even in the storefront's page
                    source. What customers actually see (in Banner mode) is one
                    fixed, generic message configured once under Customize &gt;
                    Labels &amp; Text ("Update banner — Title/Description"), the
                    same text for every update you announce. Old versions are kept
                    below for history; they're never deleted.
                </s-paragraph>

                {fetcher.data?.message && (
                    <s-paragraph tone={fetcher.data.ok ? "success" : "critical"}>
                        {fetcher.data.message}
                    </s-paragraph>
                )}

                <s-box paddingBlockStart="base" paddingBlockEnd="base">
                    <s-text-field
                        label="Internal title (not shown to customers)"
                        placeholder="e.g. Fixed referral discount bug"
                        value={title}
                        disabled={busy}
                        onInput={(e) => setTitle(e.target.value)}
                    />
                </s-box>
                <s-box paddingBlockEnd="base">
                    <s-text-area
                        label="Internal description (optional, not shown to customers)"
                        placeholder="Notes for your own reference."
                        rows={2}
                        value={description}
                        disabled={busy}
                        onInput={(e) => setDescription(e.target.value)}
                    />
                </s-box>
                <s-button
                    variant="primary"
                    disabled={busy || !title.trim()}
                    commandFor={MODAL_ID}
                    command="--show"
                    onClick={requestPublish}
                >
                    {busy ? "Publishing…" : "Publish new version"}
                </s-button>
            </s-section>

            <s-section heading="History & rollout progress">
                {versions.length === 0 ? (
                    <s-paragraph tone="subdued">No version has been announced yet.</s-paragraph>
                ) : (
                    <s-table>
                        <s-table-header-row>
                            <s-table-header>Title</s-table-header>
                            <s-table-header>Status</s-table-header>
                            <s-table-header>Synced customers</s-table-header>
                            <s-table-header>Announced</s-table-header>
                        </s-table-header-row>
                        <s-table-body>
                            {versions.map((v) => {
                                const pct = totalCustomers > 0 ? Math.round((v.syncedCount / totalCustomers) * 100) : 0;
                                return (
                                    <s-table-row key={v.id}>
                                        <s-table-cell>
                                            <s-text fontWeight="bold">{v.title}</s-text>
                                            {v.description && (
                                                <s-box>
                                                    <s-text tone="subdued">{v.description}</s-text>
                                                </s-box>
                                            )}
                                        </s-table-cell>
                                        <s-table-cell>
                                            <s-badge tone={v.isActive ? "success" : undefined}>
                                                {v.isActive ? "Active" : "Superseded"}
                                            </s-badge>
                                        </s-table-cell>
                                        <s-table-cell>
                                            {v.syncedCount} / {totalCustomers} ({pct}%)
                                        </s-table-cell>
                                        <s-table-cell>
                                            {new Date(v.createdAt).toLocaleString()}
                                        </s-table-cell>
                                    </s-table-row>
                                );
                            })}
                        </s-table-body>
                    </s-table>
                )}
            </s-section>

            {/* ── Shared confirmation modal — every trigger button above opens
                   this declaratively via commandFor={MODAL_ID} command="--show".
                   No ref/JS needed to open or close. Every action on this page
                   is sensitive (shop-wide or resource-intensive), so nothing
                   here ever executes straight from a single click. ── */}
            <s-modal
                id={MODAL_ID}
                heading={pendingAction?.confirmHeading || "Confirm action"}
                accessibilityLabel={pendingAction?.confirmHeading || "Confirm action"}
            >
                <s-text>{pendingAction?.confirmText}</s-text>
                <s-button
                    slot="primary-action"
                    variant="primary"
                    commandFor={MODAL_ID}
                    command="--hide"
                    onClick={confirmPendingAction}
                >
                    Confirm
                </s-button>
                <s-button
                    slot="secondary-actions"
                    variant="secondary"
                    commandFor={MODAL_ID}
                    command="--hide"
                    onClick={() => setPendingAction(null)}
                >
                    Cancel
                </s-button>
            </s-modal>
        </s-page>
    );
}
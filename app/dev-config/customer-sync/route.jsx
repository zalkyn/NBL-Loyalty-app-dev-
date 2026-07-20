/**
 * @file dev-config/customer-sync/route.jsx
 *
 * Admin page for syncing customers' app metafields (points, rewards,
 * transactions, prize claims) straight from the database — either in
 * bulk (all/unsynced customers, background job) or for one customer at a
 * time by email search. Also hosts the maintenance tools (reset sync
 * status, empty config, delete record) — see maintenanceToolFlags.js.
 *
 * Split out of the Version Tracking page (see that page's own history) —
 * none of this is actually specific to version rollout, it's a
 * general-purpose maintenance tool that happened to live there
 * originally.
 *
 * Layout follows the app-wide module pattern:
 *   route.jsx           -> loader/action re-exports + page composition only
 *   _loader.server.js   -> the actual loader
 *   _action.server.js   -> the actual action (dispatches by `intent`)
 *   _hooks.js           -> all client-side state + handlers (useCustomerSyncPage)
 *   components/
 *     BulkCustomerSyncSection.jsx    -> bulk sync + maintenance tools
 *     SingleCustomerSyncSection.jsx  -> email search + per-customer actions
 *     ConfirmActionModal.jsx         -> the one shared confirmation modal
 */

import { useLoaderData } from "react-router";

import { loader } from "./_loader.server";
import { action } from "./_action.server";
import { useCustomerSyncPage } from "./_hooks";

import { DevConfigNav } from "../components/DevConfigNav";
import { BulkCustomerSyncSection } from "./components/BulkCustomerSyncSection";
import { SingleCustomerSyncSection } from "./components/SingleCustomerSyncSection";
import { ConfirmActionModal } from "./components/ConfirmActionModal";

export { loader, action };

export default function CustomerSyncPage() {
    const loaderData = useLoaderData();
    const page = useCustomerSyncPage(loaderData);

    return (
        <s-page heading="Customer Sync">
            <DevConfigNav active="customer-sync" />

            <BulkCustomerSyncSection
                syncStatus={page.syncStatus}
                syncPct={page.syncPct}
                activeScope={page.activeScope}
                submittingScope={page.submittingScope}
                syncSubmitting={page.syncSubmitting}
                syncFetcher={page.syncFetcher}
                toolFlags={page.toolFlags}
                emptyConfigStatus={page.emptyConfigStatus}
                requestBulkSync={page.requestBulkSync}
                requestResetSyncStatus={page.requestResetSyncStatus}
                requestEmptyConfig={page.requestEmptyConfig}
            />

            <SingleCustomerSyncSection
                emailInput={page.emailInput}
                setEmailInput={page.setEmailInput}
                handleEmailSearch={page.handleEmailSearch}
                handleEmailKeyDown={page.handleEmailKeyDown}
                customerFetcher={page.customerFetcher}
                customerActionSubmitting={page.customerActionSubmitting}
                searchedEmail={page.searchedEmail}
                foundCustomer={page.foundCustomer}
                toolFlags={page.toolFlags}
                requestSyncCustomer={page.requestSyncCustomer}
                requestEmptyOneCustomerConfig={page.requestEmptyOneCustomerConfig}
                requestDeleteCustomerRecord={page.requestDeleteCustomerRecord}
            />

            <ConfirmActionModal
                pendingAction={page.pendingAction}
                onConfirm={page.confirmPendingAction}
                onCancel={() => page.setPendingAction(null)}
            />
        </s-page>
    );
}

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
 *
 * Bulk/single customer metafield sync used to live on this page too —
 * moved out to dev-config/customer-sync/ since it isn't actually specific
 * to version rollout (see that page's own file comment).
 *
 * Layout follows the app-wide module pattern (dashboard/, rewards-rules/,
 * points-rules/index/, etc.):
 *   route.jsx           -> loader/action re-exports + page composition only
 *   _loader.server.js   -> the actual loader
 *   _action.server.js   -> the actual action
 *   _hooks.js           -> all client-side state + handlers (useVersionTrackingPage)
 *   components/
 *     AnnounceVersionSection.jsx      -> publish-new-version form + update-method badge
 *     VersionHistoryTable.jsx         -> history + rollout progress table
 *     ConfirmActionModal.jsx          -> the one shared confirmation modal
 */

import { useLoaderData } from "react-router";

import { loader } from "./_loader.server";
import { action } from "./_action.server";
import { useVersionTrackingPage } from "./_hooks";

import { DevConfigNav } from "../components/DevConfigNav";
import { AnnounceVersionSection } from "./components/AnnounceVersionSection";
import { VersionHistoryTable } from "./components/VersionHistoryTable";
import { ConfirmActionModal } from "./components/ConfirmActionModal";

export { loader, action };

export default function VersionTrackingPage() {
    const { versions, totalCustomers, updateMode } = useLoaderData();
    const page = useVersionTrackingPage();

    return (
        <s-page heading="Version Tracking">
            <DevConfigNav active="version-tracking" />

            <AnnounceVersionSection
                updateMode={updateMode}
                fetcher={page.fetcher}
                busy={page.busy}
                title={page.title}
                setTitle={page.setTitle}
                description={page.description}
                setDescription={page.setDescription}
                requestPublish={page.requestPublish}
            />

            <VersionHistoryTable versions={versions} totalCustomers={totalCustomers} />

            <ConfirmActionModal
                pendingAction={page.pendingAction}
                onConfirm={page.confirmPendingAction}
                onCancel={() => page.setPendingAction(null)}
            />
        </s-page>
    );
}

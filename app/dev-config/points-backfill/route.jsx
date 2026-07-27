/**
 * @file dev-config/points-backfill/route.jsx
 * @description Admin page for triggering and monitoring a POINTS_BACKFILL
 * run.
 *
 * The flow is deliberately two steps, and the page reads top to bottom as
 * those steps:
 *
 *   1. pick a rule            RuleSelector
 *   2. pick a segment         SegmentSelector   -> "Build preview"
 *   3. review what will happen SnapshotPreview   -> "Award points to N customers"
 *   4. watch it happen         ProgressSection
 *   5. check what happened     EntriesTable
 *
 * Nothing awards points until step 3, and what step 3 starts is exactly
 * the frozen list it just showed — see BackfillAudienceSnapshot's schema
 * comment for why that equality is the point of the design rather than an
 * implementation detail.
 *
 * Module layout follows the app-wide dev-config pattern (same as
 * dev-config/customer-sync):
 *   route.jsx           -> loader/action re-exports + page composition
 *   _loader.server.js   -> the actual loader
 *   _action.server.js   -> the actual action (dispatches by `intent`)
 *   _hooks.js           -> all client-side state + handlers, live polling
 *   components/
 *     RuleSelector.jsx      -> pick which active points backfill rule to run
 *     SegmentSelector.jsx   -> pick a Shopify customer segment, build a preview
 *     SnapshotPreview.jsx   -> review the frozen list, export it, start the run
 *     ProgressSection.jsx   -> live awarded/skipped/failed/pending counts
 *     EntriesTable.jsx      -> who actually got points
 *     ConfirmStartModal.jsx -> the one confirmation modal this page uses
 */

import { useLoaderData, useRouteError, isRouteErrorResponse } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { loader } from "./_loader.server";
import { action } from "./_action.server";
import { usePointsBackfillPage } from "./_hooks";

import { DevConfigNav } from "../components/DevConfigNav";
import { RuleSelector } from "./components/RuleSelector";
import { SegmentSelector } from "./components/SegmentSelector";
import { ActiveWorkBanner } from "./components/ActiveWorkBanner";
import { CreateSegmentModal } from "./components/CreateSegmentModal";
import { SnapshotPreview } from "./components/SnapshotPreview";
import { ProgressSection } from "./components/ProgressSection";
import { EntriesTable } from "./components/EntriesTable";
import { ConfirmStartModal } from "./components/ConfirmStartModal";
import { GuideModal, GUIDE_MODAL_ID } from "./components/GuideModal";

export { loader, action };

export default function PointsBackfillPage() {
    const loaderData = useLoaderData();
    const page = usePointsBackfillPage(loaderData);

    const hasActiveRun = ["PENDING", "PROCESSING"].includes(page.status?.activeJob?.status);
    const isSnapshotBuilding = page.snapshot?.status === "BUILDING";

    const canBuild =
        !!page.selectedRule &&
        !!page.selectedSegmentId &&
        !isSnapshotBuilding &&
        !hasActiveRun &&
        !page.buildLocked;

    // The loader skips BOTH its Shopify calls — the live segment count and
    // the segment list itself — while any job is running, so polling
    // doesn't spend API budget every few seconds on figures nobody is
    // reading. The UI says so rather than showing a stale number as though
    // it were live.
    const countPaused =
        (page.activeWork?.snapshotJobs ?? 0) > 0 || (page.activeWork?.backfillJobs ?? 0) > 0;

    const canStart =
        page.snapshot?.status === "READY" &&
        page.snapshot.awardableCount > 0 &&
        !hasActiveRun &&
        !page.startLocked;

    return (
        <s-page heading="Points Backfill">
            <DevConfigNav active="points-backfill" />

            <s-box paddingBlockEnd="base">
                <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                    {/* Not scoped to whichever rule is selected above (or even
                        to any rule at all) — every customer this shop has ever
                        backfilled, across every rule, in one file. See
                        controller/jobs/pointsBackfill.js's
                        getBackfilledCustomersForExport() for the query.

                        A button, not a link: the export route authenticates
                        with a session token that only exists inside this
                        iframe. See hooks/useCsvDownload.js. */}
                    <s-button
                        variant="secondary"
                        size="small"
                        disabled={page.downloadingKey === "all"}
                        loading={page.downloadingKey === "all" || undefined}
                        onClick={page.downloadAllCsv}
                    >
                        {page.downloadingKey === "all"
                            ? "Preparing CSV…"
                            : "Export ALL backfilled customers (CSV)"}
                    </s-button>
                    <s-button variant="plain" commandFor={GUIDE_MODAL_ID} command="--show">
                        How to use / Guide
                    </s-button>
                </s-stack>
            </s-box>

            {/* Polling gives up after a long stretch rather than pinging
                the server every few seconds forever from a tab someone
                left open a week ago. The work itself is unaffected — this
                is only about whether this page keeps watching it. */}
            {page.pollExpired && (
                <s-box paddingBlockEnd="base">
                    <s-banner tone="warning">
                        <s-paragraph>
                            <strong>Stopped watching for updates.</strong> This has been running a long time —
                            any work still in progress carries on regardless.
                        </s-paragraph>
                        <s-box paddingBlockStart="small">
                            <s-button variant="secondary" size="small" onClick={page.resumePolling}>
                                Check again
                            </s-button>
                        </s-box>
                    </s-banner>
                </s-box>
            )}

            <ActiveWorkBanner
                activeWork={page.activeWork}
                rules={page.rules}
                selectedRuleId={page.selectedRule?.id ?? null}
                onSelectRule={page.selectRule}
            />

            {/* `disabled` here carries ONLY short-lived, in-flight state.
                hasActiveRun and isSnapshotBuilding used to be in it too,
                and they are the two that last minutes or hours — which
                meant a merchant who started a 40,000-customer run was
                locked onto that rule's page for its entire duration,
                unable to look at another rule, its table, or its export.
                Changing rule writes a URL param and re-runs the loader.
                It cannot start, stop, or corrupt anything. */}
            <RuleSelector
                rules={page.rules}
                selectedRule={page.selectedRule}
                onSelect={page.selectRule}
                activeRuleIds={page.activeWork?.ruleIds ?? []}
                disabled={page.buildLocked || page.startLocked || page.isNavigating}
            />

            {/* Two separate gates on purpose.
                `disabled` reaches the picker and the two segment-management
                buttons, so it carries only stable server truth. None of
                those three can double-submit anything, and wiring them to a
                transient client lock is what made them flicker on and off
                for the entire length of a build.
                `buildDisabled` is the anti-double-click lock, and it reaches
                exactly the one button that can be double-clicked. */}
            {page.selectedRule && (
                <SegmentSelector
                    segments={page.segments}
                    segmentsError={page.segmentsError}
                    selectedSegmentId={page.selectedSegmentId}
                    onSelectSegment={page.selectSegment}
                    onRefreshSegments={page.refreshSegments}
                    isRefreshing={page.isRefreshing}
                    liveCount={page.liveCount}
                    countError={page.countError}
                    countPaused={countPaused}
                    disabled={hasActiveRun}
                    buildDisabled={page.buildLocked || hasActiveRun}
                    isNavigating={page.isNavigating}
                    canBuild={canBuild}
                    onBuild={page.requestBuild}
                    isBuilding={page.isBuilding || isSnapshotBuilding}
                />
            )}

            {page.selectedRule && (
                <SnapshotPreview
                    snapshot={page.snapshot}
                    members={page.members}
                    membersPage={page.membersPage}
                    membersPerPage={page.membersPerPage}
                    membersTotalCount={page.membersTotalCount}
                    membersTotalPages={page.membersTotalPages}
                    onMembersPageChange={page.setMembersPage}
                    onMembersPerPageChange={page.setMembersPerPage}
                    onDownloadPreview={page.downloadPreviewCsv}
                    isDownloadingPreview={page.downloadingKey === "preview"}
                    isNavigating={page.isNavigating}
                    onStart={page.requestStart}
                    onRebuild={page.requestBuild}
                    isBuilding={page.isBuilding || isSnapshotBuilding}
                    canStart={canStart}
                    disabled={page.startLocked || hasActiveRun}
                    buildDisabled={page.buildLocked || hasActiveRun}
                    isStarting={page.isStarting}
                    ruleName={page.selectedRule.name}
                />
            )}

            <ProgressSection status={page.status} isRunning={page.isRunning} />

            {page.selectedRule && (
                <EntriesTable
                    entries={page.entries}
                    totalCount={page.entriesTotalCount}
                    unfilteredCount={page.entriesUnfilteredCount}
                    page={page.entriesPage}
                    perPage={page.entriesPerPage}
                    totalPages={page.entriesTotalPages}
                    ruleCurrency={page.selectedRule.currencyCode}
                    onPageChange={page.setEntriesPage}
                    onPerPageChange={page.setEntriesPerPage}
                    onDownload={page.downloadRuleCsv}
                    isDownloading={page.downloadingKey === "rule"}
                    isNavigating={page.isNavigating}
                    query={page.entriesQuery}
                    queryInput={page.entriesQueryInput}
                    onQueryChange={page.setEntriesQuery}
                    onQuerySubmit={page.submitEntriesQuery}
                    onQueryKeyDown={page.onEntriesQueryKeyDown}
                    onClearQuery={page.clearEntriesQuery}
                    sort={page.entriesSort}
                    onSortChange={page.setEntriesSort}
                />
            )}

            <ConfirmStartModal
                pendingAction={page.pendingAction}
                onConfirm={page.confirmPendingAction}
                onCancel={() => page.setPendingAction(null)}
            />

            <CreateSegmentModal
                segmentName={page.segmentName}
                setSegmentName={page.setSegmentName}
                segmentTags={page.segmentTags}
                addSegmentTagRow={page.addSegmentTagRow}
                updateSegmentTagRow={page.updateSegmentTagRow}
                removeSegmentTagRow={page.removeSegmentTagRow}
                cleanSegmentTags={page.cleanSegmentTags}
                isCreatingSegment={page.isCreatingSegment}
                onCreate={page.requestCreateSegment}
            />

            <GuideModal />
        </s-page>
    );
}

/**
 * Route-level error boundary.
 *
 * Without one, any unexpected throw — a loader failure, or a plain
 * render-time ReferenceError of the kind that took this page down once
 * already — bubbles to layout/index.jsx and replaces the entire embedded
 * app with a generic frame the merchant can't act on. This keeps the
 * failure attached to the page it happened on and offers the one thing
 * that usually fixes a transient one.
 *
 * Thrown Responses are handed straight back to Shopify's own boundary
 * rather than rendered over: authenticate.admin() signals re-auth and
 * app-uninstalled that way, and those responses only work if their
 * headers survive. Swallowing one here would replace a re-auth with a
 * dead-end error page.
 */
export function ErrorBoundary() {
    const error = useRouteError();

    if (isRouteErrorResponse(error)) {
        return boundary.error(error);
    }

    return (
        <s-page heading="Points Backfill">
            <s-section>
                <s-banner tone="critical">
                    <s-paragraph>
                        <strong>This page couldn't load.</strong> No backfill was started, and nothing already
                        running has been affected — background jobs are unaware of this page.
                    </s-paragraph>
                    {error?.message && (
                        <s-box paddingBlockStart="small">
                            <s-paragraph tone="subdued">{error.message}</s-paragraph>
                        </s-box>
                    )}
                </s-banner>

                <s-box paddingBlockStart="base">
                    <s-button variant="primary" onClick={() => window.location.reload()}>
                        Reload page
                    </s-button>
                </s-box>
            </s-section>
        </s-page>
    );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
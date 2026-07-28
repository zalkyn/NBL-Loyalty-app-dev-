/**
 * @file dev-config/points-backfill/components/SnapshotPreview.jsx
 * @description The review step. Shows what a run WILL do — how many
 * customers, how many points in total, who gets skipped and why — and
 * gates the Start button behind it.
 *
 * This section is the reason the whole snapshot design exists. A backfill
 * awards real points that can't be cleanly undone (reversing one means a
 * manual balance ADJUST per customer), so the merchant needs to see the
 * actual list before committing, not a description of a filter that will
 * later produce one. Everything below reads from a frozen
 * BackfillAudienceSnapshot, so what's shown here — and what's in the CSV
 * — is byte-for-byte what the run will process.
 */

import Pagination from "@app/components/pagination/Pagination";
import { ProgressBar } from "@app/components/ProgressBar";
import { MODAL_ID } from "../_hooks";
import { ALLOWED_PAGE_SIZES } from "../_data";

/** One figure in the summary row. Plain HTML for the same web-component
 *  styling reason documented in SegmentSelector.jsx. */


function Stat({ label, value, tone }) {
    const color = tone === "critical" ? "#8E1F0B" : tone === "subdued" ? "#6D7175" : "#202223";

    return (
        <div style={{ minWidth: "130px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.02em", color: "#6D7175", textTransform: "uppercase" }}>
                {label}
            </div>
            <div style={{ fontSize: "20px", fontWeight: 650, color, marginTop: "2px" }}>{value}</div>
        </div>
    );
}

function BuildingState({ snapshot }) {
    const total = snapshot.reportedTotalCount;
    const done = snapshot.builtSoFar ?? 0;

    return (
        <s-section heading="Preview">
            <s-stack direction="block" gap="base">
                <s-stack direction="inline" gap="small" alignItems="center">
                    <s-spinner size="small" accessibilityLabel="Building preview" />
                    <s-text>
                        Building the preview for <strong>{snapshot.segmentName}</strong>
                        {total ? ` — ${done.toLocaleString()} of ${total.toLocaleString()} captured` : ` — ${done.toLocaleString()} captured`}.
                    </s-text>
                </s-stack>

                {/* Same bar as the run below it — see ProgressBar.jsx.
                    It draws nothing until Shopify has said how big the
                    segment is, which is the guard this used to carry
                    inline: a bar filling against an unknown total is a
                    guess dressed as data. */}
                <ProgressBar processed={done} total={total} label="Preview build progress" />

                <s-paragraph tone="subdued">
                    This page updates on its own. You can leave and come back — the build runs in the background.
                </s-paragraph>
            </s-stack>
        </s-section>
    );
}

/**
 * `buildDisabled`, not `disabled` — this button rebuilds a preview, so the
 * lock that belongs on it is the build one. It was wired to the start lock
 * instead, which is the lock for awarding points: a button gated on the
 * wrong action is right by coincidence, and stops being right the moment
 * either lock's timing changes.
 */
function FailedState({ snapshot, onRebuild, buildDisabled, isBuilding }) {
    return (
        <s-section heading="Preview">
            <s-banner tone="critical">
                <s-paragraph>
                    <strong>This preview couldn't be built, so nothing can be run from it.</strong>
                </s-paragraph>
                <s-box paddingBlockStart="small">
                    <s-paragraph>{snapshot.lastError || "The build stopped before it finished."}</s-paragraph>
                </s-box>
            </s-banner>
            <s-box paddingBlockStart="base">
                <s-button
                    disabled={buildDisabled || isBuilding}
                    loading={isBuilding || undefined}
                    onClick={onRebuild}
                >
                    {isBuilding ? "Building preview…" : "Build a new preview"}
                </s-button>
            </s-box>
        </s-section>
    );
}

function ConsumedState({ snapshot }) {
    return (
        <s-section heading="Preview">
            <s-paragraph tone="subdued">
                This preview of <strong>{snapshot.segmentName}</strong> has already been used for a run
                {snapshot.consumedAt ? ` on ${new Date(snapshot.consumedAt).toLocaleString()}` : ""}. Progress is below.
            </s-paragraph>
            <s-box paddingBlockStart="small">
                <s-paragraph tone="subdued">
                    To run this rule again, build a fresh preview — segment membership will have moved since, and
                    you should approve what's true now rather than re-approving an older list.
                </s-paragraph>
            </s-box>
        </s-section>
    );
}

/**
 * The READY state — the one that matters.
 *
 * Deliberately leads with the three figures a merchant needs to decide,
 * not with the member table: how many people, how many points, and how
 * many are getting nothing. The table is for spot-checking after those
 * numbers look right; the CSV is for checking properly.
 */
function ReadyState({
    snapshot,
    members,
    membersPage,
    membersPerPage,
    membersTotalCount,
    membersTotalPages,
    onMembersPageChange,
    onMembersPerPageChange,
    onDownloadPreview,
    isDownloadingPreview,
    isNavigating,
    onStart,
    canStart,
    disabled,
    isStarting,
    ruleName,
}) {
    // Derived from the snapshot alone. It used to be gated on `members`
    // being truthy, which tied a headline figure about the whole preview
    // to whether one page of the member table happened to be loaded —
    // a snapshot with members would report the real number, and one
    // without would confidently report zero skipped.
    const skipped = Math.max(0, (snapshot.memberCount ?? 0) - (snapshot.awardableCount ?? 0));

    return (
        <s-section heading="Preview">
            <s-paragraph tone="subdued">
                Frozen from <strong>{snapshot.segmentName}</strong>
                {snapshot.builtAt ? ` on ${new Date(snapshot.builtAt).toLocaleString()}` : ""}. Starting the run
                awards points to exactly these customers — nobody who joins the segment afterwards is included.
            </s-paragraph>

            {snapshot.lastError && (
                <s-box paddingBlockStart="base">
                    <s-banner tone="warning">
                        <s-paragraph>{snapshot.lastError}</s-paragraph>
                    </s-banner>
                </s-box>
            )}

            <s-box paddingBlockStart="base">
                <div style={{ display: "flex", flexWrap: "wrap", gap: "28px" }}>
                    <Stat label="Will be awarded" value={snapshot.awardableCount.toLocaleString()} />
                    <Stat label="Total points" value={snapshot.projectedTotalPoints.toLocaleString()} />
                    <Stat label="Will be skipped" value={skipped.toLocaleString()} tone={skipped > 0 ? "critical" : "subdued"} />
                </div>
            </s-box>

            {/* A button running an authenticated fetch, not an <a href>.
                The export route sits behind authenticate.admin(), and a
                link opens a tab with no App Bridge and therefore no
                session token — which is exactly why this silently did
                nothing before. See hooks/useCsvDownload.js. */}
            <s-box paddingBlockStart="base">
                <s-stack direction="inline" gap="base" alignItems="center">
                    <s-button
                        variant="secondary"
                        size="small"
                        disabled={isDownloadingPreview}
                        loading={isDownloadingPreview || undefined}
                        onClick={onDownloadPreview}
                    >
                        {isDownloadingPreview ? "Preparing CSV…" : "Download this list as CSV"}
                    </s-button>
                    <s-text tone="subdued">Includes every customer, what they'll earn, and any reason they'd be skipped.</s-text>
                </s-stack>
            </s-box>

            {members?.length > 0 && (
                <s-box paddingBlockStart="base">
                    <s-table>
                        <s-table-header-row>
                            <s-table-header>Customer</s-table-header>
                            <s-table-header>Email</s-table-header>
                            <s-table-header>Spent</s-table-header>
                            <s-table-header>Points</s-table-header>
                            <s-table-header>Note</s-table-header>
                        </s-table-header-row>
                        <s-table-body>
                            {members.map((member) => (
                                <s-table-row key={member.id}>
                                    <s-table-cell>{member.displayName || "—"}</s-table-cell>
                                    <s-table-cell>{member.email || "—"}</s-table-cell>
                                    <s-table-cell>
                                        {Number(member.amountSpent).toLocaleString()} {member.currencyCode ?? ""}
                                    </s-table-cell>
                                    <s-table-cell>
                                        {member.projectedPoints > 0 ? member.projectedPoints.toLocaleString() : "—"}
                                    </s-table-cell>
                                    <s-table-cell>
                                        {member.skipReason ? <s-badge tone="warning">{member.skipReason}</s-badge> : ""}
                                    </s-table-cell>
                                </s-table-row>
                            ))}
                        </s-table-body>
                    </s-table>

                    {/* Same app-wide pager as the Backfilled Customers
                        table below, driven by explicit props rather than
                        usePagination() — see EntriesTable.jsx's header.
                        Two tables on one page using two different pagers
                        was the sort of thing nobody reports and everybody
                        notices. */}
                    <Pagination
                        currentPage={membersPage}
                        totalPages={membersTotalPages}
                        totalItems={membersTotalCount}
                        perPage={membersPerPage}
                        startIndex={(membersPage - 1) * membersPerPage}
                        setCurrentPage={onMembersPageChange}
                        setPerPage={onMembersPerPageChange}
                        label="customers in this preview"
                        perPageOptions={ALLOWED_PAGE_SIZES}
                    />
                </s-box>
            )}

            <s-box paddingBlockStart="base">
                {/* commandFor/command is what actually opens the confirmation
                    modal — onClick only populates what the modal will say.
                    Without both, clicking this button sets some state and
                    then visibly does nothing at all, which is exactly how
                    this shipped the first time. */}
                <s-button
                    variant="primary"
                    disabled={!canStart || disabled || isStarting}
                    loading={isStarting || undefined}
                    commandFor={MODAL_ID}
                    command="--show"
                    onClick={onStart}
                >
                    {isStarting ? "Starting…" : `Award points to ${snapshot.awardableCount.toLocaleString()} customers`}
                </s-button>

                {/* A run takes a moment to appear in the progress panel below
                    — the job has to be enqueued, then picked up on the next
                    poller cycle. Saying so beats a button that looks stuck. */}
                {isStarting && (
                    <s-box paddingBlockStart="small">
                        <s-text tone="subdued">Queueing the run — progress appears below in a few seconds.</s-text>
                    </s-box>
                )}
                {!canStart && (
                    <s-box paddingBlockStart="small">
                        <s-text tone="subdued">
                            {snapshot.awardableCount === 0
                                ? `No customer in this preview earns points under "${ruleName}". Adjust the rule or pick a different segment.`
                                : "A run is already in progress for this rule."}
                        </s-text>
                    </s-box>
                )}
            </s-box>
        </s-section>
    );
}

/**
 * Dispatches on snapshot status. Each state gets its own component rather
 * than one component full of conditionals, because they genuinely share
 * nothing — a failed preview and a ready one have different content,
 * different actions, and different things the merchant needs to do next.
 */
export function SnapshotPreview(props) {
    const { snapshot } = props;

    if (!snapshot) return null;

    switch (snapshot.status) {
        case "BUILDING":
            return <BuildingState snapshot={snapshot} />;
        case "FAILED":
            return (
                <FailedState
                    snapshot={snapshot}
                    onRebuild={props.onRebuild}
                    buildDisabled={props.buildDisabled}
                    isBuilding={props.isBuilding}
                />
            );
        case "CONSUMED":
            return <ConsumedState snapshot={snapshot} />;
        case "READY":
            return <ReadyState {...props} />;
        default:
            return null;
    }
}
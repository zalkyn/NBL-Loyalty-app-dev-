/**
 * @file dev-config/points-backfill/components/ProgressSection.jsx
 * @description Live progress for the selected rule's backfill.
 *
 * TWO DIFFERENT NUMBERS LIVE HERE, and conflating them is the mistake
 * this file is arranged to prevent.
 *
 *   status.run      — the job running right now: how many of THIS run's
 *                     customers are done, out of how many there are.
 *                     Drives the bar.
 *   awarded/skipped/
 *   failed          — every entry this rule has ever produced, across
 *                     every run. Drives the totals grid, and is now
 *                     labelled as all-time so nobody reads it as the run
 *                     currently on screen.
 *
 * The grid carried no such label before, so during a run a merchant saw
 * "Awarded 5,842" and had every reason to believe that was the run in
 * front of them. It was that run plus every one before it.
 *
 * ── Why `pending` is NOT in that grid ────────────────────────────────────
 * It sat there as a fourth card and was the only one of the four that
 * wasn't a total. processOneMember() writes a PENDING entry as its
 * idempotency claim BEFORE computing anything, then resolves it to
 * AWARDED/SKIPPED/FAILED milliseconds later — so a row is PENDING only
 * for the length of one customer's processing, and the job runs
 * CONCURRENCY of those at a time. The figure was therefore never a
 * backlog. It was "how many customers happened to be mid-flight at the
 * instant this poll's query ran": ten at most, different every three
 * seconds, and read by anyone sane as "almost done" on a run that had
 * 33,000 customers left to go.
 *
 * The number does mean something, but only once nothing is running. A
 * job that dies between the claim and the resolve strands its PENDING
 * row forever — resume re-processes that member, hits P2002, and moves
 * on without ever tidying it up. That is a real signal, and it's the
 * only thing `pending` is reported as below.
 *
 * Counts come from PointsBackfillEntry and BackfillAudienceMember (via
 * getPointsBackfillStatus), the authoritative sources, not the job's own
 * best-effort payload.counts. See controller/jobs/pointsBackfill.js.
 */

import { ProgressBar } from "@app/components/ProgressBar";

/** One figure in the totals grid.
 *
 *  Plain block-level HTML, not two <s-text> siblings. Those are inline,
 *  so the label and the value rendered on a single line and ran together
 *  — "Awarded5,842", "Skipped0". Same construction as SnapshotPreview's
 *  Stat, which had it right. */
function Stat({ label, value, tone }) {
    const color = tone === "critical" ? "#8E1F0B" : "#202223";

    return (
        <div
            style={{
                padding: "12px 14px",
                border: "1px solid #E1E3E5",
                borderRadius: "8px",
                background: "#FFFFFF",
            }}
        >
            <div
                style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    color: "#6D7175",
                    textTransform: "uppercase",
                }}
            >
                {label}
            </div>
            <div style={{ fontSize: "20px", fontWeight: 650, color, marginTop: "2px" }}>{value}</div>
        </div>
    );
}

/**
 * The running state.
 *
 * A banner, not a subdued paragraph. ActiveWorkBanner deliberately hides
 * itself when the running work belongs to the rule already on screen, on
 * the stated grounds that "the panels below are already saying so in more
 * detail" — and this is that panel. While it announced a live run in the
 * same muted grey as every static hint on the page, that was a trade the
 * merchant paid for and didn't get: the loudest notice stood down and
 * nothing took its place.
 */
function RunningState({ activeJob, run }) {
    const percent = run?.total ? Math.min(100, Math.round((run.processed / run.total) * 100)) : null;

    return (
        <s-banner tone="info">
            <s-stack direction="block" gap="base">
                <s-stack direction="inline" gap="small" alignItems="center">
                    <s-spinner size="small" accessibilityLabel="Backfill running" />
                    <s-text>
                        <strong>
                            Awarding points
                            {run?.segmentName ? ` to ${run.segmentName}` : ""}
                            {percent != null ? ` — ${percent}% done` : ""}.
                        </strong>
                    </s-text>
                </s-stack>

                {/* Renders nothing when the total couldn't be established.
                    The line below still reports what has been counted,
                    which is the honest half of the same information. */}
                <ProgressBar processed={run?.processed} total={run?.total} label="Backfill progress" />

                <s-text tone="subdued">
                    {run?.total
                        ? `${run.processed.toLocaleString()} of ${run.total.toLocaleString()} customers processed.`
                        : "Working through this run's customers."}{" "}
                    Job #{activeJob.id}, status {activeJob.status}. This page updates on its own every few
                    seconds — you can leave and come back, the run carries on either way.
                </s-text>
            </s-stack>
        </s-banner>
    );
}

/**
 * Entries left PENDING by a run that isn't running any more.
 *
 * Deliberately worded to defuse rather than alarm. Nothing is stuck in a
 * queue, no customer is waiting, and no points are owed — the row is
 * simply a claim that never got its verdict written. Someone who reads
 * "unresolved" and panics into re-running the rule does no harm either
 * way, because the idempotency guard skips those customers, but they
 * shouldn't be panicked into it in the first place.
 *
 * Shown only when idle. During a run these rows are just the concurrency
 * window and mean nothing at all.
 */
function StrandedEntriesNotice({ pending }) {
    return (
        <s-box paddingBlockStart="base">
            <s-banner tone="warning">
                <s-paragraph>
                    <strong>
                        {pending.toLocaleString()} {pending === 1 ? "entry was" : "entries were"} left unresolved
                        by an interrupted run.
                    </strong>
                </s-paragraph>
                <s-box paddingBlockStart="small">
                    <s-paragraph tone="subdued">
                        Nothing is waiting on {pending === 1 ? "it" : "them"} and no customer is owed points —
                        {pending === 1 ? " the row was" : " the rows were"} claimed but never finished, most
                        likely by a job that stopped mid-batch. Running this rule again is safe:
                        {pending === 1 ? " that customer" : " those customers"} would be skipped rather than
                        awarded twice.
                    </s-paragraph>
                </s-box>
            </s-banner>
        </s-box>
    );
}

export function ProgressSection({ status, isRunning }) {
    if (!status) {
        return (
            <s-section heading="Progress">
                <s-paragraph tone="subdued">
                    Select a points backfill rule above to see its backfill progress.
                </s-paragraph>
            </s-section>
        );
    }

    const { awarded, skipped, failed, pending, activeJob, run } = status;

    // Only ever asked as "has this rule produced any entries at all",
    // which decides whether there's anything to show. `pending` belongs in
    // it for that question — a rule whose sole run died early has nothing
    // but stranded rows, and "this rule hasn't been run yet" would be a
    // flat lie to the one person who most needs to hear otherwise. It is
    // NOT a denominator, and nothing below divides by it.
    const total = awarded + skipped + failed + pending;

    return (
        <s-section heading="Progress">
            {isRunning ? (
                <RunningState activeJob={activeJob} run={run} />
            ) : total > 0 ? (
                <s-paragraph tone="subdued">No run currently active.</s-paragraph>
            ) : (
                <s-paragraph tone="subdued">This rule hasn't been run yet.</s-paragraph>
            )}

            {total > 0 && (
                <s-box paddingBlockStart="base">
                    {/* Said plainly, and said whether or not a run is
                        active. The old "totals below are from all runs"
                        wording appeared only in the idle state — which is
                        precisely the state where nobody could have
                        mistaken it for anything else. */}
                    <s-text tone="subdued" variant="bodySm">
                        Across all runs of this rule
                    </s-text>

                    <s-box paddingBlockStart="small">
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                                gap: "12px",
                            }}
                        >
                            <Stat label="Awarded" value={awarded.toLocaleString()} />
                            <Stat label="Skipped" value={skipped.toLocaleString()} />
                            <Stat
                                label="Failed"
                                value={failed.toLocaleString()}
                                tone={failed > 0 ? "critical" : undefined}
                            />
                        </div>
                    </s-box>

                    {!isRunning && pending > 0 && <StrandedEntriesNotice pending={pending} />}

                    {failed > 0 && (
                        <s-box paddingBlockStart="base">
                            <s-paragraph tone="critical">
                                {failed.toLocaleString()} customer(s) failed — check the server logs for this job
                                (module "pointsBackfillJob") for the reason on each. Failed entries are never
                                retried automatically.
                            </s-paragraph>
                        </s-box>
                    )}
                </s-box>
            )}
        </s-section>
    );
}
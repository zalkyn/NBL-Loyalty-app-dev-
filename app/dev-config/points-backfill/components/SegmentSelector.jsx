/**
 * @file dev-config/points-backfill/components/SegmentSelector.jsx
 * @description Pick which Shopify customer segment a backfill run will
 * target, then build a preview from it.
 *
 * Replaces AudienceForm.jsx, which asked for two lists of tags and
 * matched them in application code — a workaround for Shopify having
 * deprecated the Customer search filters in Admin API 2024-07. Segments
 * are the supported replacement and bring the whole native filter set:
 * tags, lifetime spend, order count, location, RFM group, products
 * purchased.
 *
 * Creating a segment lives behind a button that opens
 * CreateSegmentModal, not inline here. See that file's header for why.
 *
 * TWO DISABLED PROPS, and they are not interchangeable. `disabled` gates
 * the picker and the two segment-management buttons — none of which can
 * double-submit anything — and must therefore only ever be fed stable
 * server truth. `buildDisabled` gates the one button that CAN be
 * double-clicked and is the only one allowed to see the transient
 * post-submit lock. Collapsing the two back into one prop reintroduces a
 * bug where all three controls blinked disabled/enabled once per poll for
 * the whole duration of a build; see _hooks.js's settle-lock comment.
 *
 * VISUAL NOTE, inherited from AudienceForm.jsx and still true: Shopify's
 * web components encapsulate their own styling and silently ignore
 * decorative style overrides. Anything needing a specific look is built
 * from plain HTML with inline styles.
 */

import { CREATE_SEGMENT_MODAL_ID } from "./CreateSegmentModal";

/** Monospaced block for a ShopifyQL query. Wraps rather than truncates —
 *  a half-shown filter condition is worse than a tall box. */
function QueryBlock({ query }) {
    if (!query) return null;

    return (
        <div
            style={{
                marginTop: "10px",
                padding: "10px 12px",
                background: "#FAFBFB",
                border: "1px solid #E1E3E5",
                borderRadius: "8px",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "12px",
                lineHeight: "1.5",
                color: "#42474C",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
            }}
        >
            {query}
        </div>
    );
}

export function SegmentSelector({
    segments,
    segmentsError,
    selectedSegmentId,
    onSelectSegment,
    onRefreshSegments,
    isRefreshing,
    liveCount,
    countError,
    countPaused,
    disabled,
    buildDisabled,
    isNavigating,
    canBuild,
    onBuild,
    isBuilding,
}) {
    const selected = segments?.find((s) => s.id === selectedSegmentId) ?? null;
    const hasSegments = segments?.length > 0;

    return (
        <s-section heading="Audience">
            {/* "Couldn't load" and "there are none" used to render the same,
                because segments() swallowed its failures into an empty
                array. A merchant with twenty segments was being told they
                had none, and the suggested fix — go make one — was the
                worst possible advice for a transient API error. */}
            {segmentsError ? (
                <s-banner tone="critical">
                    <s-paragraph>
                        <strong>Couldn't load your segments.</strong> {segmentsError}
                    </s-paragraph>
                    <s-box paddingBlockStart="small">
                        <s-paragraph tone="subdued">
                            Your existing segments are still there — this page just couldn't read them this time.
                        </s-paragraph>
                    </s-box>
                    <s-box paddingBlockStart="small">
                        <s-button
                            variant="secondary"
                            size="small"
                            disabled={isRefreshing}
                            loading={isRefreshing || undefined}
                            onClick={onRefreshSegments}
                        >
                            {isRefreshing ? "Retrying…" : "Retry"}
                        </s-button>
                    </s-box>
                </s-banner>
            ) : hasSegments ? (
                <s-paragraph tone="subdued">
                    Choose a customer segment. Every customer in it will be included — build or edit segments in
                    Shopify admin under <strong>Customers &rarr; Segments</strong>.
                </s-paragraph>
            ) : (
                <s-paragraph tone="subdued">
                    This store has no customer segments yet. Add one below, or build a more detailed one in Shopify
                    admin under <strong>Customers &rarr; Segments</strong>.
                </s-paragraph>
            )}

            {hasSegments && (
                <s-box paddingBlockStart="base">
                    <s-select
                        label="Segment"
                        value={selectedSegmentId ?? ""}
                        disabled={disabled || isNavigating}
                        onChange={(e) => onSelectSegment(e.target.value || null)}
                    >
                        <s-option value="">Choose a segment…</s-option>
                        {segments.map((segment) => (
                            <s-option key={segment.id} value={segment.id}>
                                {segment.name}
                            </s-option>
                        ))}
                    </s-select>
                </s-box>
            )}

            {/* Refresh, because the segment list comes from a loader that
                only re-runs on navigation. A merchant who builds a segment
                in another Shopify admin tab and switches back would
                otherwise have to reload the whole page to see it — and
                would have no way of knowing that's what was needed. */}
            <s-box paddingBlockStart="small">
                <s-stack direction="inline" gap="base" alignItems="center">
                    <s-button
                        variant="secondary"
                        size="small"
                        disabled={disabled || isRefreshing}
                        loading={isRefreshing || undefined}
                        onClick={onRefreshSegments}
                    >
                        {isRefreshing ? "Refreshing…" : "Refresh segments"}
                    </s-button>
                    <s-button
                        variant="secondary"
                        size="small"
                        disabled={disabled}
                        commandFor={CREATE_SEGMENT_MODAL_ID}
                        command="--show"
                    >
                        Add new segment
                    </s-button>
                </s-stack>
            </s-box>

            {selected && (
                <s-box paddingBlockStart="base">
                    {countError ? (
                        <s-banner tone="critical">
                            <s-paragraph>
                                Couldn't count this segment: {countError} Pick another segment, or try again in a
                                moment.
                            </s-paragraph>
                            <s-box paddingBlockStart="small">
                                <s-button
                                    variant="secondary"
                                    size="small"
                                    disabled={isRefreshing}
                                    loading={isRefreshing || undefined}
                                    onClick={onRefreshSegments}
                                >
                                    {isRefreshing ? "Retrying…" : "Retry count"}
                                </s-button>
                            </s-box>
                        </s-banner>
                    ) : countPaused ? (
                        // The live count is skipped while a job is running so
                        // polling doesn't fire a Shopify call every three
                        // seconds for a number nobody is reading. Say so
                        // rather than showing a stale figure as if it were live.
                        <s-text tone="subdued">Member count pauses while work is running.</s-text>
                    ) : liveCount != null ? (
                        <s-text>
                            <strong>{liveCount.toLocaleString()}</strong> customer{liveCount === 1 ? "" : "s"} in this
                            segment right now.
                        </s-text>
                    ) : null}

                    <QueryBlock query={selected.query} />
                </s-box>
            )}

            <s-box paddingBlockStart="base">
                <s-paragraph tone="subdued">
                    Building a preview freezes this list of customers and works out what each one would earn. Nothing
                    is awarded until you review it and start the run.
                </s-paragraph>
            </s-box>

            <s-box paddingBlockStart="base">
                <s-button
                    variant="primary"
                    disabled={!canBuild || buildDisabled || isBuilding}
                    loading={isBuilding || undefined}
                    onClick={onBuild}
                >
                    {isBuilding ? "Building preview…" : "Build preview"}
                </s-button>

                {/* Conditioned on the two things that are actually true for
                    as long as the message claims they are, rather than on
                    `canBuild`. canBuild also goes false during the moment a
                    submit is settling, and the branch below would then
                    announce "a run is already in progress" to someone who
                    had merely pressed the button — a wrong sentence, but
                    one that reads plausibly enough to be believed. */}
                {!isBuilding && (!selectedSegmentId || disabled) && (
                    <s-box paddingBlockStart="small">
                        <s-text tone="subdued">
                            {!selectedSegmentId ? "Choose a segment first." : "A run is already in progress for this rule."}
                        </s-text>
                    </s-box>
                )}
            </s-box>
        </s-section>
    );
}
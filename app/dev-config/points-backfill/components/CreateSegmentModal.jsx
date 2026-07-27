/**
 * @file dev-config/points-backfill/components/CreateSegmentModal.jsx
 * @description Create a Shopify customer segment from a list of tags,
 * without leaving the page.
 *
 * Lives in a modal rather than inline on the page for two reasons. The
 * page is already a four-step sequence (rule -> segment -> preview ->
 * run) and a permanently-visible create form sitting in the middle of it
 * competes with the step the merchant is actually on. And a modal simply
 * has the width the tag inputs need — inline, squeezed into a section
 * beside everything else, they render uselessly narrow.
 *
 * Scope is deliberately one case: "customers who have at least one of
 * these tags". That's the overwhelmingly common backfill audience.
 * Anything past it belongs in Shopify's own segment editor, which has
 * autocomplete and live counts — a segment made here is an ordinary
 * segment and can be opened and extended there.
 *
 * VISUAL NOTE: Shopify's web components encapsulate their own styling and
 * silently ignore decorative style overrides (background, border,
 * radius). The tag rows below use a plain flex div rather than s-stack +
 * s-box for exactly this reason — the previous version wrapped the input
 * in `<s-box style={{ flexGrow: 1 }}>`, which did nothing, and the field
 * collapsed to its intrinsic width.
 */

export const CREATE_SEGMENT_MODAL_ID = "points-backfill-create-segment-modal";

export function CreateSegmentModal({
    segmentName, setSegmentName,
    segmentTags, addSegmentTagRow, updateSegmentTagRow, removeSegmentTagRow,
    cleanSegmentTags, isCreatingSegment, onCreate,
}) {
    const previewQuery = cleanSegmentTags.map((tag) => `customer_tags CONTAINS '${tag}'`).join(" OR ");
    const canCreate = !!segmentName.trim() && cleanSegmentTags.length > 0 && !isCreatingSegment;

    return (
        <s-modal
            id={CREATE_SEGMENT_MODAL_ID}
            heading="Create a segment from tags"
            accessibilityLabel="Create a segment from tags"
        >
            <s-stack direction="block" gap="base">
                <s-paragraph tone="subdued">
                    Matches customers who have <strong>at least one</strong> of these tags. It's saved to Shopify like
                    any other segment, so you can open and edit it later under Customers &rarr; Segments.
                </s-paragraph>

                <s-text-field
                    label="Segment name"
                    placeholder="e.g. Tier one and two members"
                    value={segmentName}
                    disabled={isCreatingSegment}
                    onInput={(e) => setSegmentName(e.target.value)}
                />

                <s-box>
                    <s-text variant="headingSm">Tags</s-text>

                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                        {segmentTags.map((value, index) => (
                            <div key={index}>
                                {index > 0 && (
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "4px 0" }}>
                                        <div style={{ flexGrow: 1, height: "1px", background: "#E1E3E5" }} />
                                        <span
                                            style={{
                                                fontSize: "11px", fontWeight: 700, letterSpacing: "0.02em",
                                                color: "#6D7175", background: "#F1F2F4",
                                                padding: "2px 10px", borderRadius: "999px", whiteSpace: "nowrap",
                                            }}
                                        >
                                            OR
                                        </span>
                                        <div style={{ flexGrow: 1, height: "1px", background: "#E1E3E5" }} />
                                    </div>
                                )}

                                {/* Plain flex, not s-stack — see the file header. The
                                    input needs `minWidth: 0` or it refuses to shrink
                                    below its intrinsic size inside a flex row. */}
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                                        <s-text-field
                                            placeholder="e.g. member:tier_one"
                                            value={value}
                                            disabled={isCreatingSegment}
                                            onInput={(e) => updateSegmentTagRow(index, e.target.value)}
                                        />
                                    </div>
                                    <div style={{ flex: "0 0 auto" }}>
                                        <s-button
                                            variant="plain"
                                            size="small"
                                            disabled={isCreatingSegment || segmentTags.length === 1}
                                            onClick={() => removeSegmentTagRow(index)}
                                            accessibilityLabel={`Remove tag ${index + 1}`}
                                        >
                                            Remove
                                        </s-button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <s-box paddingBlockStart="small">
                        <s-button
                            variant="plain"
                            size="small"
                            disabled={isCreatingSegment}
                            onClick={() => addSegmentTagRow()}
                        >
                            + Add another tag
                        </s-button>
                    </s-box>
                </s-box>

                {previewQuery && (
                    <s-box>
                        <s-text tone="subdued" variant="bodySm">This creates the segment:</s-text>
                        <div
                            style={{
                                marginTop: "8px",
                                padding: "10px 12px",
                                background: "#FAFBFB",
                                border: "1px solid #E1E3E5",
                                borderRadius: "8px",
                                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                                fontSize: "12px",
                                lineHeight: "1.5",
                                color: "#6D7175",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                            }}
                        >
                            {previewQuery}
                        </div>
                    </s-box>
                )}
            </s-stack>

            {/* Does NOT close the modal itself (no command="--hide"). The
                segment might be rejected by Shopify — an invalid tag, a
                duplicate name — and closing on click would hide the form
                holding the input that needs correcting. _hooks.js closes it
                on success instead. */}
            <s-button
                slot="primary-action"
                variant="primary"
                disabled={!canCreate}
                loading={isCreatingSegment || undefined}
                onClick={onCreate}
            >
                {isCreatingSegment ? "Creating…" : "Create segment"}
            </s-button>
            <s-button
                slot="secondary-actions"
                variant="secondary"
                disabled={isCreatingSegment}
                commandFor={CREATE_SEGMENT_MODAL_ID}
                command="--hide"
            >
                Cancel
            </s-button>
        </s-modal>
    );
}

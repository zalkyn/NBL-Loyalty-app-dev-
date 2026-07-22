/**
 * @file dev-config/version-tracking/components/AnnounceVersionSection.jsx
 * @description Form to publish a new ConfigUpdateVersion, plus a read-only
 * badge showing the shop's current "off/banner/auto" update method (the
 * real, editable setting lives on the Customize page — see cssVarsConfig.js's
 * "resync" WIDGET_CONFIG_SECTIONS entry for why).
 */

import { MODAL_ID } from "../_hooks";

export function AnnounceVersionSection({
    updateMode, fetcher, busy,
    title, setTitle, description, setDescription,
    requestPublish,
}) {
    return (
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
                Use this when you've changed something about the loyalty
                program (rewards, rules, points, styling) and want customers'
                widgets to pick up the change. Publishing a new version marks
                every customer who hasn't caught up yet as "needs update".
            </s-paragraph>
            <s-paragraph tone="subdued">
                What each customer then sees depends on the Update method
                shown above (you set it on the Customize page, not here):
                Off means nothing happens; Banner (manual) shows them a small
                "update available" bar with an Update button; Auto-sync
                quietly refreshes their widget in the background on their next
                visit, with no bar and no click needed.
            </s-paragraph>
            <s-paragraph tone="subdued">
                The title and description you type below are only for you —
                they show up in the history table lower down so you can
                remember what each version was about. Customers never see
                them anywhere, not even in the page source. In Banner mode,
                the message customers actually read is one fixed, generic line
                you set once under Customize &gt; Labels &amp; Text ("Update
                banner — Title/Description") — it stays the same for every
                version you publish here. Nothing is ever deleted: every
                version you publish is kept below as a permanent record.
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
    );
}

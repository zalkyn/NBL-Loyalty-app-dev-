/**
 * @file dev-config/version-tracking/components/VersionHistoryTable.jsx
 * @description Every announced version, newest activity first, with each
 * one's rollout progress (how many of the shop's customers have synced
 * to it). Append-only — see createConfigUpdateVersion.js; nothing here
 * ever deletes a row.
 */

export function VersionHistoryTable({ versions, totalCustomers }) {
    return (
        <s-section heading="History & rollout progress">
            {versions.length === 0 ? (
                <s-paragraph tone="subdued">No version has been announced yet.</s-paragraph>
            ) : (
                <>
                    <s-paragraph tone="subdued">
                        Every version you've published, newest first. "Active"
                        is the one customers are currently being asked to sync
                        to; "Superseded" ones are older versions kept only for
                        your reference. "Synced customers" shows how many have
                        already caught up to that version — for the Active row
                        it climbs over time as customers visit and their
                        widgets refresh, so it's a rough rollout progress bar,
                        not something you need to act on.
                    </s-paragraph>
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
                </>
            )}
        </s-section>
    );
}

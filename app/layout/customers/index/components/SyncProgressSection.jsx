/**
 * @file layout/customers/index/components/SyncProgressSection.jsx
 * @description Live banner for a running customer sync.
 *
 * A sync used to announce itself with a single word — the header button
 * reading "Syncing…" — for a job that can run twenty minutes. From where
 * the merchant sits that is indistinguishable from a stuck button, and
 * the natural response is to reload, wonder, and eventually click it
 * again.
 *
 * The bar is only drawn once the run has a real denominator; see
 * components/ProgressBar.jsx. Until then the running tally still appears,
 * which is the honest half of the same information.
 */

import { ProgressBar } from "@app/components/ProgressBar";

export function SyncProgressSection({ status, progress }) {
    const isFailed = status === "FAILED";

    if (isFailed) {
        return (
            <s-box paddingBlockEnd="base">
                <s-banner tone="critical">
                    <s-paragraph>
                        <strong>The last sync stopped before it finished.</strong>
                    </s-paragraph>
                    <s-box paddingBlockStart="small">
                        <s-paragraph tone="subdued">
                            Customers already brought across are saved and correct — a sync updates records one at a
                            time, so an interrupted one leaves partial progress rather than a broken state. Running it
                            again picks up the rest.
                        </s-paragraph>
                    </s-box>
                </s-banner>
            </s-box>
        );
    }

    const processed = progress?.processed ?? 0;
    const total = progress?.total ?? null;
    const isEstimate = progress?.totalIsEstimate === true;
    const failed = progress?.failed ?? 0;

    const percent = total ? Math.min(100, Math.round((processed / total) * 100)) : null;

    return (
        <s-box paddingBlockEnd="base">
            <s-banner tone="info">
                <s-stack direction="block" gap="base">
                    <s-stack direction="inline" gap="small" alignItems="center">
                        <s-spinner size="small" accessibilityLabel="Sync running" />
                        <s-text>
                            <strong>
                                Syncing customers from Shopify
                                {percent != null ? ` — ${isEstimate ? "about " : ""}${percent}% done` : ""}.
                            </strong>
                        </s-text>
                    </s-stack>

                    <ProgressBar processed={processed} total={total} label="Customer sync progress" />

                    {/* Three different sentences for three different states,
                        because they are three different amounts of
                        knowledge. Shopify's customersCount stops at 10,000,
                        so a large shop's denominator is either an estimate
                        from the local table or nothing at all — and the one
                        thing this line must never do is present either as a
                        confident total. */}
                    <s-text tone="subdued">
                        {total
                            ? isEstimate
                                ? `${processed.toLocaleString()} customers processed, of roughly ${total.toLocaleString()} expected.`
                                : `${processed.toLocaleString()} of ${total.toLocaleString()} customers processed.`
                            : processed > 0
                              ? `${processed.toLocaleString()} customers processed so far.`
                              : "Counting the shop's customers…"}{" "}
                        This runs in the background — you can leave this page and come back.
                    </s-text>

                    {/* Surfaced during the run rather than saved for the end.
                        A handful of failures among 80,000 is noise; a
                        failure count climbing alongside the processed count
                        is something the merchant may want to stop and look
                        at rather than discover twenty minutes later. */}
                    {failed > 0 && (
                        <s-text tone="subdued">
                            {failed.toLocaleString()} {failed === 1 ? "customer" : "customers"} couldn't be
                            synced so far — the rest are unaffected, and the reasons are in the server logs.
                        </s-text>
                    )}
                </s-stack>
            </s-banner>
        </s-box>
    );
}
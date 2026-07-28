import { useLocation } from "react-router";

/**
 * Shadow rule picker for the Points Backfill page. Only ACTIVE rules are
 * selectable — an inactive rule can't be run at all (see
 * pointsBackfillJob.js's own isActive re-check every cycle), so offering
 * one here would just fail immediately after starting. Inactive rules are
 * still listed (greyed, disabled) so it's clear why they're missing
 * rather than silently absent.
 *
 * ── This picker is NOT locked while work is running ──────────────────────
 * It used to be, on the reasoning that switching rules mid-build leaves
 * you looking at a different rule's idle state, which reads exactly like
 * the build died. That was true when it was written, and ActiveWorkBanner
 * was subsequently built to solve precisely that — read its header, which
 * describes the same scenario. The lock outlived its own justification
 * and did nothing afterwards except strand a merchant on one rule's page
 * for the length of a run.
 *
 * So: don't put hasActiveRun or a snapshot status back into `disabled`.
 * Changing rule is navigation, not an action — it writes a search param
 * and re-runs a loader. Only genuinely in-flight submits belong in that
 * prop, and only because a fetcher's toast landing after a rule change
 * would announce a result on a page that has nothing to do with it.
 */
export function RuleSelector({ rules, selectedRule, onSelect, activeRuleIds = [], disabled }) {
    // This route.jsx is registered at both /app/dev-config/points-backfill
    // and /app/points-backfill (see routes.js) — the "manage rules" link
    // below needs to point at whichever sibling path matches where we
    // actually are, not always the dev-config one.
    const { pathname } = useLocation();
    const backfillRulesHref = pathname.startsWith("/app/dev-config") ? "/app/dev-config/points-backfill-rules" : "/app/points-backfill-rules";

    if (!rules?.length) {
        return (
            <s-section heading="Points Backfill Rule">
                <s-paragraph tone="subdued">
                    No points backfill rules exist yet. Create one on the{" "}
                    <s-link href={backfillRulesHref}>Points Backfill Rules</s-link> page first.
                </s-paragraph>
            </s-section>
        );
    }

    return (
        <s-section heading="Points Backfill Rule">
            <s-paragraph tone="subdued">
                Choose which rate rule to run. Manage rules on the{" "}
                <s-link href={backfillRulesHref}>Points Backfill Rules</s-link> page.
            </s-paragraph>
            <s-box paddingBlockStart="small" />
            <s-select
                label="Rule"
                value={selectedRule?.id ? String(selectedRule.id) : ""}
                disabled={disabled}
                onChange={(e) => onSelect(e.target.value ? Number(e.target.value) : null)}
            >
                <s-option value="">Select a rule</s-option>
                {/* The running marker exists because this picker is now
                    usable during a run: without it the list is just names,
                    and there's no way to tell which one has work going.
                    ActiveWorkBanner covers most of that gap but stands
                    down when the only running work belongs to the rule
                    already selected — which is exactly when someone
                    opening this dropdown would otherwise see nothing.

                    Costs no query: activeWork.ruleIds is already in loader
                    data, and it's server truth, so the label follows the
                    real state on each poll rather than flickering with a
                    client flag. */}
                {rules.map((r) => (
                    <s-option key={r.id} value={String(r.id)} disabled={!r.isActive}>
                        {r.name}
                        {!r.isActive
                            ? " — Inactive"
                            : activeRuleIds.includes(r.id)
                                ? " — running"
                                : ""}
                    </s-option>
                ))}
            </s-select>

            {selectedRule && (
                <s-box paddingBlockStart="base">
                    <s-paragraph tone="subdued">
                        {selectedRule.rateType === "FIXED"
                            ? `Flat ${Number(selectedRule.fixedPoints ?? 0).toLocaleString()} pts per matched customer.`
                            : `${Number(selectedRule.pointsPerUnit ?? 0).toLocaleString()} pt(s) per ${Number(selectedRule.perAmount ?? 0).toLocaleString()} ${selectedRule.currencyCode ?? ""} spent.`}
                    </s-paragraph>
                </s-box>
            )}
        </s-section>
    );
}
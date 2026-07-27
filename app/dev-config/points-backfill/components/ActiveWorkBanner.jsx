/**
 * @file dev-config/points-backfill/components/ActiveWorkBanner.jsx
 * @description Shop-wide "something is running" notice, shown regardless
 * of which rule is currently selected.
 *
 * Every other status panel on this page is scoped to the selected rule,
 * which is the right default — but it leaves a real gap. Someone starts a
 * build, navigates away while it runs, then comes back through the nav
 * menu with no `ruleId` in the URL, and lands on a page that looks
 * completely idle while a job is very much still going. They'd have no
 * reason to think anything was happening, and might well start a second
 * one.
 *
 * This reads from the Job table rather than snapshot statuses (see
 * getActiveBackfillWork), so a run whose snapshot has already been
 * CONSUMED still shows up — the job is the thing that's actually running.
 */

export function ActiveWorkBanner({ activeWork, rules, selectedRuleId, onSelectRule }) {
    const { snapshotJobs = 0, backfillJobs = 0, ruleIds = [] } = activeWork ?? {};

    if (snapshotJobs === 0 && backfillJobs === 0) return null;

    // If the running work is for the rule already on screen, the panels
    // below are already saying so in more detail. Staying quiet avoids
    // telling someone twice.
    const isOnlyForSelectedRule =
        ruleIds.length === 1 && selectedRuleId != null && ruleIds[0] === selectedRuleId;

    if (isOnlyForSelectedRule) return null;

    const parts = [];
    if (snapshotJobs > 0) parts.push(`${snapshotJobs} preview${snapshotJobs === 1 ? "" : "s"} building`);
    if (backfillJobs > 0) parts.push(`${backfillJobs} backfill run${backfillJobs === 1 ? "" : "s"} in progress`);

    const otherRules = ruleIds
        .filter((id) => id !== selectedRuleId)
        .map((id) => ({ id, name: rules?.find((r) => r.id === id)?.name }))
        .filter((r) => r.name);

    return (
        <s-box paddingBlockEnd="base">
            <s-banner tone="info">
                <s-paragraph>
                    <strong>{parts.join(" and ")}.</strong> This keeps going whether or not you stay on this page —
                    come back any time to check.
                </s-paragraph>

                {otherRules.length > 0 && (
                    <s-box paddingBlockStart="small">
                        <s-stack direction="inline" gap="small" alignItems="center">
                            <s-text tone="subdued">Jump to:</s-text>
                            {otherRules.map((rule) => (
                                <s-button
                                    key={rule.id}
                                    variant="plain"
                                    size="small"
                                    onClick={() => onSelectRule(rule.id)}
                                >
                                    {rule.name}
                                </s-button>
                            ))}
                        </s-stack>
                    </s-box>
                )}
            </s-banner>
        </s-box>
    );
}

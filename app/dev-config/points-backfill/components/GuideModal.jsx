/**
 * @file dev-config/points-backfill/components/GuideModal.jsx
 * @description "How does this work?" reference modal — opened from the
 * page header. Purely informational, no form state, so it's a plain
 * commandFor/command toggle with its own fixed id, same as every other
 * modal in this codebase.
 *
 * Rewritten alongside the move from tag filters to segments. The old
 * version documented two tag lists and a cutoff date, none of which
 * exist any more.
 *
 * THE THROUGHPUT FIGURES ARE DERIVED, NOT DECORATIVE. "~1,500 a minute"
 * is snapshotBuildJob's PAGE_SIZE (250) against its production cron
 * (every 10s); "~500 a minute" is pointsBackfillJob's BATCH_SIZE (250)
 * against its own (every 30s). Change either cadence or batch size in
 * jobConfig.js and these numbers become wrong. They earn their place
 * because the previous version claimed "under a minute for a few
 * thousand customers" — off by a factor of two at that size, and by a
 * factor of thirty on a 40,000-customer segment, which is long enough
 * that a merchant reasonably concludes the thing is broken.
 */

import { useLocation } from "react-router";

export const GUIDE_MODAL_ID = "points-backfill-guide-modal";

export function GuideModal() {
    // Same reasoning as RuleSelector.jsx — this route.jsx is registered at
    // both /app/dev-config/points-backfill and /app/points-backfill, so
    // the rules link has to match whichever one we're actually on.
    const { pathname } = useLocation();
    const backfillRulesHref = pathname.startsWith("/app/dev-config")
        ? "/app/dev-config/points-backfill-rules"
        : "/app/points-backfill-rules";

    return (
        <s-modal id={GUIDE_MODAL_ID} heading="How Points Backfill works" accessibilityLabel="How Points Backfill works">
            <s-stack direction="block" gap="base">
                <s-paragraph>
                    Points Backfill is a <strong>one-time</strong> way to award real, retroactive loyalty points to
                    customers who already existed before this app started tracking their orders — based on how much
                    they've already spent on Shopify (their lifetime <strong>amount spent</strong>). Without it, a
                    long-time customer who joined the day before you installed this app would show 0 points forever,
                    same as someone who ordered yesterday.
                </s-paragraph>

                <s-divider />

                <s-heading>1. Create a Points Backfill Rule</s-heading>
                <s-paragraph tone="subdued">
                    On the <s-link href={backfillRulesHref}>Points Backfill Rules</s-link> page, define how spend
                    converts to points:
                </s-paragraph>
                <s-ordered-list>
                    <s-list-item>
                        <strong>Fixed</strong> — every customer gets the same flat number of points, regardless of how
                        much they've spent.
                    </s-list-item>
                    <s-list-item>
                        <strong>Per amount spent</strong> — points scale with lifetime spend (e.g. 1 point per $10),
                        rounded down. An optional max caps how much any single customer can get.
                    </s-list-item>
                </s-ordered-list>
                <s-paragraph tone="subdued">
                    A points backfill rule is completely separate from your normal Points Earning Rules — it's never
                    shown to customers and never used for real order-based earning. Your shop's currency is detected
                    automatically and can't be changed by hand, so a "per amount spent" rule can never accidentally
                    misprice everyone by comparing against the wrong currency.
                </s-paragraph>
                <s-paragraph tone="subdued">
                    A rule must be switched <strong>Active</strong> before it can be used here — a deliberate extra
                    confirmation step, since running it awards real points.
                </s-paragraph>

                <s-divider />

                <s-heading>2. Choose a customer segment</s-heading>
                <s-paragraph tone="subdued">
                    Who gets backfilled is decided by a Shopify <strong>customer segment</strong>, built in your
                    Shopify admin under <strong>Customers &rarr; Segments</strong>. Anything Shopify can segment on
                    works here: tags, lifetime spend, number of orders, location, products purchased, email
                    subscription status, and more.
                </s-paragraph>
                <s-paragraph tone="subdued">
                    A common backfill segment is simply "customers added before the date I installed this app" —
                    everyone who joined after that is already earning points normally and doesn't need this.
                </s-paragraph>
                <s-paragraph tone="subdued">
                    Once you pick a segment, this page shows how many customers are in it right now.
                </s-paragraph>

                <s-divider />

                <s-heading>3. Build a preview and check it</s-heading>
                <s-paragraph tone="subdued">
                    <strong>Build preview</strong> takes a frozen copy of that segment's members and works out what
                    each one would earn under your chosen rule. It runs in the background, working through roughly
                    <strong> 1,500 customers a minute</strong> — so a few thousand takes a couple of minutes, and a
                    40,000-customer segment takes around half an hour. The page shows a live count while it goes.
                </s-paragraph>
                <s-paragraph tone="subdued">
                    When it's ready you'll see three numbers: how many customers will be awarded points, how many
                    points that is in total, and how many will be skipped. Customers get skipped for one of three
                    reasons — no email address on file, spend that works out to zero points under the rule, or (on a
                    "per amount spent" rule) spend recorded in a different currency than the rule uses. The preview
                    tells you which, per customer.
                </s-paragraph>
                <s-paragraph tone="subdued">
                    <strong>Download the CSV</strong> and check it before going further. It lists every customer, what
                    they'd earn, and any reason they'd be skipped.
                </s-paragraph>
                <s-paragraph tone="subdued">
                    If a build fails, nothing has happened to anyone — a preview only reads. The page shows why, and
                    you can build a new one once the cause is dealt with.
                </s-paragraph>

                <s-divider />

                <s-heading>4. Run it</s-heading>
                <s-paragraph tone="subdued">
                    Starting the run awards points to <strong>exactly the customers in the preview</strong> — the list
                    you just checked, not a fresh reading of the segment. Anyone who joins the segment after the
                    preview was built is not included, which is what makes the CSV a reliable record of what happened.
                </s-paragraph>
                <s-paragraph tone="subdued">
                    Progress appears live on this page. A run works through roughly <strong>500 customers a
                        minute</strong>, so a 40,000-customer run takes well over an hour. Each customer's outcome is
                    recorded permanently, so you can always answer "why did this person get exactly N points" later.
                </s-paragraph>
                <s-paragraph tone="subdued">
                    You don't have to sit here. The run is a background job — closing this page, switching rules, or
                    shutting the browser changes nothing about it. After about half an hour this page stops watching
                    for updates and says so; that's only this page going quiet, never the run. "Check again" picks
                    the live view back up.
                </s-paragraph>
                <s-paragraph tone="subdued">
                    A preview can only be used once. To run the same rule again later, build a fresh preview — segment
                    membership will have moved, and you should be approving what's true then rather than re-approving
                    an old list.
                </s-paragraph>

                <s-divider />

                <s-heading>Reading the numbers on this page</s-heading>
                <s-paragraph tone="subdued">
                    Two different things are being counted here, and they don't mean the same thing:
                </s-paragraph>
                <s-unordered-list>
                    <s-list-item>
                        The <strong>progress bar</strong> is about the run happening right now — how many of its
                        customers are done, out of how many it has.
                    </s-list-item>
                    <s-list-item>
                        The <strong>Awarded / Skipped / Failed</strong> cards below it are cumulative:{" "}
                        <strong>every run this rule has ever had</strong>, added together. Run the same rule three
                        times and those figures cover all three.
                    </s-list-item>
                </s-unordered-list>
                <s-paragraph tone="subdued">
                    <strong>Skipped is not a problem.</strong> It means the rule correctly gave that customer nothing
                    — zero qualifying spend, no email on file, or a currency that doesn't match. Expected, and there's
                    nothing to fix.
                </s-paragraph>
                <s-paragraph tone="subdued">
                    <strong>Failed is a problem.</strong> Something broke while awarding that customer, and the reason
                    is in the server logs for that job. Failed customers are never retried automatically — they keep
                    whatever balance they had and simply didn't receive this backfill.
                </s-paragraph>

                <s-divider />

                <s-heading>Things worth knowing</s-heading>
                <s-unordered-list>
                    <s-list-item>
                        <strong>There's no undo.</strong> Points land in real balances. Reversing one means adjusting
                        that customer's balance by hand, one at a time.
                    </s-list-item>
                    <s-list-item>
                        <strong>Nobody is paid twice.</strong> A customer can only ever receive one backfill award per
                        rule, even if a run is interrupted and resumed, or the same rule is run again later.
                    </s-list-item>
                    <s-list-item>
                        <strong>You can stop a run.</strong> Switching the rule to Inactive halts it at the end of its
                        current batch. Customers already awarded keep their points.
                    </s-list-item>
                    <s-list-item>
                        <strong>Editing the rule mid-flight changes the payout.</strong> If you change a rule between
                        building a preview and starting the run, customers are awarded under the new rule, not the
                        previewed figures. Rebuild the preview if you edit a rule.
                    </s-list-item>
                    <s-list-item>
                        <strong>Different rules can run at the same time.</strong> The same rule can't have two runs
                        at once, but separate rules are free to run side by side. A rule with work in progress is
                        marked in the rule picker, and you can switch to any other rule while one runs — looking at a
                        rule never starts or stops anything.
                    </s-list-item>
                    <s-list-item>
                        <strong>"Entries left unresolved" is not points owed to anyone.</strong> If a run is
                        interrupted at exactly the wrong moment it can leave a few records without a final verdict
                        written. Nobody is waiting on them and no balance is short. Running the rule again is safe —
                        those customers are skipped rather than paid twice.
                    </s-list-item>
                </s-unordered-list>
            </s-stack>

            <s-button slot="primary-action" variant="primary" commandFor={GUIDE_MODAL_ID} command="--hide">
                Got it
            </s-button>
        </s-modal>
    );
}
import { timeAgo } from "../_format.js";

/**
 * Referrals where the friend used the discount but the referrer was never paid.
 * Nothing else in the app lists these, so without this table the merchant is told
 * to fix something with no way to find who it is. The fix is a manual point
 * adjustment on the referrer, so each row links straight to that customer.
 */
export function StuckReferrals({ stuck, total, onHandled, busy }) {
    if (!stuck.length) return null;
    return (
        <s-section id="stuck-referrals" heading="Referral rewards that were not paid">
            <s-stack direction="block" gap="base">
                <s-text color="subdued">
                    {total > stuck.length ? `Showing ${stuck.length} of ${total}. ` : ""}
                    The friend used the referral code, but the referrer did not receive points. For each row: (1) press Open
                    referrer, (2) use Adjust Points to give them the referral points from your referral rule, (3) come back and
                    press Mark as handled. The discount itself worked for the friend.
                </s-text>
                <s-text color="subdued">
                    Press Mark as handled only after you added the points, or if you decided this person should not be paid. It
                    does not add any points by itself.
                </s-text>
                <s-table>
                    <s-table-header-row>
                        <s-table-header>Referrer (should be paid)</s-table-header>
                        <s-table-header>Friend who used the code</s-table-header>
                        <s-table-header>Code</s-table-header>
                        <s-table-header>When</s-table-header>
                        <s-table-header>Step 1</s-table-header>
                        <s-table-header>Step 2, after adding the points</s-table-header>
                    </s-table-header-row>
                    <s-table-body>
                        {stuck.map((row) => (
                            <s-table-row key={row.id}>
                                <s-table-cell>{row.referrer}</s-table-cell>
                                <s-table-cell>{row.friend}</s-table-cell>
                                <s-table-cell>{row.code}</s-table-cell>
                                <s-table-cell>{timeAgo(row.at)}</s-table-cell>
                                <s-table-cell><s-link href={`/app/customers/${row.referrerId}`}>Open referrer</s-link></s-table-cell>
                                <s-table-cell>
                                    <s-button variant="secondary" loading={busy("markReferralHandled", row.id) || undefined} onClick={() => onHandled(row.id)}>
                                        Mark as handled
                                    </s-button>
                                </s-table-cell>
                            </s-table-row>
                        ))}
                    </s-table-body>
                </s-table>
            </s-stack>
        </s-section>
    );
}

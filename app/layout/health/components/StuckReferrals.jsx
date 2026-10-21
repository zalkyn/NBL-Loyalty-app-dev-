import { timeAgo } from "../_format.js";

/**
 * Referrals where the friend used the discount but the referrer was never paid.
 * Nothing else in the app lists these, so without this table the merchant is told
 * to fix something with no way to find who it is. The fix is a manual point
 * adjustment on the referrer, so each row links straight to that customer.
 */
export function StuckReferrals({ stuck, total }) {
    if (!stuck.length) return null;
    return (
        <s-section heading="Referral rewards that were not paid">
            <s-stack direction="block" gap="base">
                <s-text color="subdued">
                    {total > stuck.length ? `Showing ${stuck.length} of ${total}. ` : ""}
                    The friend used the referral code, but the referrer did not receive points. Open the referrer and use
                    Adjust Points to give them what they earned. The discount itself worked for the friend.
                </s-text>
                <s-table>
                    <s-table-header-row>
                        <s-table-header>Referrer (should be paid)</s-table-header>
                        <s-table-header>Friend who used the code</s-table-header>
                        <s-table-header>Code</s-table-header>
                        <s-table-header>When</s-table-header>
                        <s-table-header>Fix</s-table-header>
                    </s-table-header-row>
                    <s-table-body>
                        {stuck.map((row) => (
                            <s-table-row key={row.id}>
                                <s-table-cell>{row.referrer}</s-table-cell>
                                <s-table-cell>{row.friend}</s-table-cell>
                                <s-table-cell>{row.code}</s-table-cell>
                                <s-table-cell>{timeAgo(row.at)}</s-table-cell>
                                <s-table-cell><s-link href={`/app/customers/${row.referrerId}`}>Open referrer</s-link></s-table-cell>
                            </s-table-row>
                        ))}
                    </s-table-body>
                </s-table>
            </s-stack>
        </s-section>
    );
}

import { timeAgo } from "../_format.js";

// `number` is Shopify's order ID (not the "#1001" name), so say that, and link to the order.
function OrderCell({ shop, number }) {
    if (!number) return <s-text>—</s-text>;
    return (
        <s-stack direction="block" gap="small-500">
            {shop && <s-link href={`https://${shop}/admin/orders/${number}`} target="_blank">View order</s-link>}
            <s-text color="subdued">ID {number}</s-text>
        </s-stack>
    );
}

/**
 * The orders that could not be processed, newest first, with the reason in
 * plain words. The raw message sits underneath in small text so it can be
 * quoted to support.
 */
export function FailedOrdersTable({ failed, total, shop, retrying, onRetry }) {
    if (!failed.length) return null;

    return (
        <s-section heading="Orders that could not be processed">
            <s-stack direction="block" gap="base">
                <s-stack direction="inline" gap="base" justifyContent="space-between" alignItems="center">
                    <s-text color="subdued">{total > failed.length ? `Showing the newest ${failed.length} of ${total} from the last 30 days. ` : "Last 30 days, newest first. "}Trying again is safe: nothing is paid twice. If an order keeps failing, send support its ID and the note under "Why".</s-text>
                    <s-button variant="primary" loading={retrying || undefined} disabled={retrying} onClick={onRetry}>Retry failed orders</s-button>
                </s-stack>
                <s-table>
                    <s-table-header-row>
                        <s-table-header>Order</s-table-header>
                        <s-table-header>What failed</s-table-header>
                        <s-table-header>Why</s-table-header>
                        <s-table-header>Tries</s-table-header>
                        <s-table-header>When</s-table-header>
                    </s-table-header-row>
                    <s-table-body>
                        {failed.map((row) => (
                            <s-table-row key={row.id}>
                                <s-table-cell><OrderCell shop={shop} number={row.orderNumber} /></s-table-cell>
                                <s-table-cell>{row.kind}</s-table-cell>
                                <s-table-cell>
                                    <s-stack direction="block" gap="small-500">
                                        <s-text>{row.reason}</s-text>
                                        {row.technical && <s-text color="subdued">Note for support: {row.technical}</s-text>}
                                    </s-stack>
                                </s-table-cell>
                                <s-table-cell>{row.attempts}</s-table-cell>
                                <s-table-cell>{timeAgo(row.at)}</s-table-cell>
                            </s-table-row>
                        ))}
                    </s-table-body>
                </s-table>
            </s-stack>
        </s-section>
    );
}

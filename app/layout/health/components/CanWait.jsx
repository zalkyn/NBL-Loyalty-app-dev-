/**
 * Everyday jobs that are waiting for the merchant but are not faults and don't
 * need to be done today. Kept apart from the red/yellow notices so they never
 * make the program look broken. Renders nothing when there is nothing waiting.
 */
export function CanWait({ details }) {
    const rows = [
        details.subscriptions.needsAction > 0 && {
            key: "cancel",
            title: `${details.subscriptions.needsAction} subscription cancellation${details.subscriptions.needsAction === 1 ? "" : "s"} to look at`,
            text: "A subscriber cancelled in Appstle and their points were not reset automatically. Open each one, read the reason, and reset the points or leave it.",
            label: "Open Subscription Cancellations",
            href: "/app/subscription-cancellations",
        },
        details.prizes.pending > 0 && {
            key: "prizes",
            title: `${details.prizes.pending} prize request${details.prizes.pending === 1 ? "" : "s"} to handle`,
            text: "Customers claimed a physical prize with their points. Move each request from Pending to Fulfilled when you have sent it.",
            label: "Open Physical Prize Claims",
            href: "/app/physical-prizes-claims-manage",
        },
        details.customers.negativeBalances > 0 && {
            key: "negative",
            title: `${details.customers.negativeBalances} customer${details.customers.negativeBalances === 1 ? "" : "s"} with points below zero`,
            text: "Points were taken back after a refund or cancellation, but the customer had already spent them. You can leave this: their next orders earn the balance back to zero.",
            label: "Open Customers",
            href: "/app/customers",
        },
    ].filter(Boolean);

    if (!rows.length) return null;
    return (
        <s-section heading="Can wait — no rush">
            <s-stack direction="block" gap="base">
                <s-text color="subdued">
                    These are normal day-to-day jobs, not faults. Nothing here affects the program status, and nothing is lost if you
                    do them later.
                </s-text>
                {rows.map((r) => (
                    <s-stack key={r.key} direction="block" gap="small-500">
                        <s-text type="strong">{r.title}</s-text>
                        <s-text color="subdued">{r.text}</s-text>
                        <s-link href={r.href}>{r.label}</s-link>
                    </s-stack>
                ))}
            </s-stack>
        </s-section>
    );
}

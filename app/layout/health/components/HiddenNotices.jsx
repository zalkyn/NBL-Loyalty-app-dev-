import { SNOOZE_DAYS } from "../_attention.js";

const fmt = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * Notices the merchant hid for a week, so nothing is ever lost: they can read
 * them again and bring them back with one press. Renders nothing when empty.
 */
export function HiddenNotices({ hidden, onShow, busy }) {
    if (!hidden.length) return null;
    return (
        <s-section heading="Hidden for now">
            <s-stack direction="block" gap="base">
                <s-text color="subdued">
                    {`You hid these for ${SNOOZE_DAYS} days. They are not counted in the status above. Each one comes back by itself on the date shown, or sooner if the problem gets bigger.`}
                </s-text>
                {hidden.map((item) => (
                    <s-stack key={item.key} direction="inline" gap="base" justifyContent="space-between" alignItems="center">
                        <s-stack direction="block" gap="small-500">
                            <s-text type="strong">{item.heading}</s-text>
                            <s-text color="subdued">Hidden until {fmt(item.until)}</s-text>
                        </s-stack>
                        <s-button variant="secondary" loading={busy("unsnoozeItem", item.key) || undefined} onClick={() => onShow(item)}>
                            Show again
                        </s-button>
                    </s-stack>
                ))}
            </s-stack>
        </s-section>
    );
}

/**
 * @file layout/customers/index/components/ConfirmSyncModal.jsx
 * @description Confirmation step in front of Sync Customers.
 *
 * The button used to fire on the first click. That was survivable when a
 * sync was a quick refresh; on a shop with 80,000 customers it commits
 * the merchant to twenty-odd minutes of background work, thousands of
 * database writes and a Shopify API budget, all from a mis-click on a
 * button that sits in the page header next to nothing else.
 *
 * The counts are the point of this modal, not decoration. "Sync 80,278
 * customers?" is a question someone can actually answer; "Sync
 * customers?" is one they can only shrug at. Showing the local figure
 * beside it turns it into the more useful question again — whether this
 * is a first import, a top-up of a few hundred new arrivals, or a
 * no-op someone is about to run for the third time today.
 *
 * The Shopify figure is fetched when the modal opens rather than carried
 * in loader data; see handleCustomerCount in _action.server.js for why.
 */

export const SYNC_MODAL_ID = "customers-sync-confirm-modal";

/** One figure in the comparison row. Plain block HTML rather than two
 *  inline <s-text> siblings, which render on one line and run together. */
function CountStat({ label, value, hint }) {
    return (
        <div style={{ minWidth: "150px" }}>
            <div
                style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    letterSpacing: "0.02em",
                    color: "#6D7175",
                    textTransform: "uppercase",
                }}
            >
                {label}
            </div>
            <div style={{ fontSize: "22px", fontWeight: 650, color: "#202223", marginTop: "2px" }}>
                {value}
            </div>
            {hint ? (
                <div style={{ fontSize: "12px", color: "#6D7175", marginTop: "2px" }}>{hint}</div>
            ) : null}
        </div>
    );
}

export function ConfirmSyncModal({
    shopifyCount,
    shopifyCountPrecision,
    localCount,
    isCounting,
    onConfirm,
}) {
    // AT_LEAST means the shop sits above Shopify's aggregation ceiling
    // (10,000) and the figure is a floor, not a total. Everything derived
    // from it is therefore worthless, and the first version of this modal
    // derived plenty: it read "≥ 10,000" against a local 80,278, concluded
    // 0 new customers, announced that every Shopify customer was already
    // here, and labelled its own button "Sync 10,000 customers" for a job
    // that would process eight times that. A capped number is not a small
    // number — it is a different kind of thing, and it gets used for
    // nothing but saying so.
    const isCapped = shopifyCountPrecision === "AT_LEAST";
    const hasUsableShopifyCount = typeof shopifyCount === "number" && !isCapped;

    const newArrivals =
        hasUsableShopifyCount && typeof localCount === "number"
            ? Math.max(0, shopifyCount - localCount)
            : null;

    // Sized off the local table when Shopify's answer is capped — that
    // table is the result of the last sync, so it is the better guide to
    // how long this one takes.
    const looksLarge = hasUsableShopifyCount ? shopifyCount > 5000 : (localCount ?? 0) > 5000 || isCapped;

    return (
        <s-modal id={SYNC_MODAL_ID} heading="Sync customers from Shopify" accessibilityLabel="Sync customers from Shopify">
            <s-stack direction="block" gap="base">
                <s-box>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "28px" }}>
                        <CountStat
                            label="In Shopify"
                            value={
                                isCounting
                                    ? "Counting…"
                                    : isCapped
                                      ? "10,000+"
                                      : hasUsableShopifyCount
                                        ? shopifyCount.toLocaleString()
                                        : "Unavailable"
                            }
                            hint={isCapped ? "Shopify won't report an exact figure this high" : undefined}
                        />
                        <CountStat
                            label="Already here"
                            value={typeof localCount === "number" ? localCount.toLocaleString() : "—"}
                            hint="Enrolled in this app"
                        />
                    </div>
                </s-box>

                {/* Only shown when it's a number worth acting on. "0 new
                    customers" is a fine thing to learn, but it belongs in
                    the paragraph below rather than as a headline figure
                    formatted like something that needs attention. */}
                {newArrivals != null && newArrivals > 0 && (
                    <s-text>
                        Roughly <strong>{newArrivals.toLocaleString()}</strong> customers in Shopify aren't in this
                        app yet.
                    </s-text>
                )}

                {newArrivals === 0 && (
                    <s-text tone="subdued">
                        Every Shopify customer already has a record here. A sync will refresh their details rather
                        than add anyone.
                    </s-text>
                )}

                <s-divider />

                <s-paragraph tone="subdued">
                    Syncing pulls every customer from Shopify and updates this app's copy of them — names, emails,
                    phone numbers, order counts and lifetime spend.
                </s-paragraph>

                {/* The reassurance that actually matters. Anyone hesitating
                    over this button is hesitating over whether it can
                    destroy something, and the answer is no. */}
                <s-paragraph tone="subdued">
                    <strong>Nothing is deleted and no points change.</strong> Customers already here keep their
                    balances, rewards and history. A customer removed in Shopify keeps their record here too.
                </s-paragraph>

                {!isCounting && (
                    <s-paragraph tone="subdued">
                        {looksLarge
                            ? "This will take a while at this size — it runs in the background, so you can close this page and come back."
                            : "This runs in the background — you can close this page and come back."}
                    </s-paragraph>
                )}
            </s-stack>

            <s-button
                slot="primary-action"
                variant="primary"
                commandFor={SYNC_MODAL_ID}
                command="--hide"
                onClick={onConfirm}
            >
                {hasUsableShopifyCount ? `Sync ${shopifyCount.toLocaleString()} customers` : "Start sync"}
            </s-button>
            <s-button slot="secondary-actions" variant="secondary" commandFor={SYNC_MODAL_ID} command="--hide">
                Cancel
            </s-button>
        </s-modal>
    );
}
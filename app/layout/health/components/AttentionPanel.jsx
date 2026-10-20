import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useShopCurrency } from "@app/hooks/useShopCurrency.jsx";
import { buildAttentionItems } from "../_attention.js";

const INTRO_KEY = "nbl_dashboard_intro_dismissed_v1";

function readDismissed() {
    try {
        return window.localStorage.getItem(INTRO_KEY) === "1";
    } catch {
        return false;
    }
}

function writeDismissed() {
    try {
        window.localStorage.setItem(INTRO_KEY, "1");
    } catch { /* storage blocked — the banner just comes back next visit */ }
}

/**
 * "Needs your attention" — everything the merchant should look at, one banner
 * each, with the tone matching how urgent it is:
 *   critical → money/points are not flowing (failed order jobs, rewards that
 *              never recorded), warning → a decision or check is waiting,
 *   success  → all clear, info → a dismissible explanation of the new features.
 * Renders from numbers the loader already computed; nothing here fetches.
 */
export function AttentionPanel({ health, retrying, onRetry }) {
    const navigate = useNavigate();
    const { code: shopCurrency } = useShopCurrency();
    // Start dismissed so the info banner never flashes in for someone who
    // already closed it; the real value is read after mount.
    const [introDismissed, setIntroDismissed] = useState(true);
    useEffect(() => setIntroDismissed(readDismissed()), []);

    // Polaris web components emit a native "dismiss" event; React 18 doesn't wire
    // custom-element events through props, so attach it directly.
    const introRef = useRef(null);
    useEffect(() => {
        const el = introRef.current;
        if (!el) return undefined;
        const onDismiss = () => { writeDismissed(); setIntroDismissed(true); };
        el.addEventListener("dismiss", onDismiss);
        return () => el.removeEventListener("dismiss", onDismiss);
    }, [introDismissed]);

    const items = buildAttentionItems(health, shopCurrency);

    const allClear = items.length === 0;

    // Page-wide banners: direct children of <s-page> in its supplemental-start
    // slot (outside any section), next steps as secondary-actions, one message
    // per banner. Only banners the merchant doesn't have to act on can be closed.
    return (
        <>
            {items.map((item) => (
                <s-banner key={item.key} slot="supplemental-start" tone={item.tone} heading={item.heading}>
                    <s-text>{item.text}</s-text>
                    {item.retry && (
                        <s-button slot="secondary-actions" variant="secondary" loading={retrying || undefined} disabled={retrying} onClick={onRetry}>
                            Retry failed orders
                        </s-button>
                    )}
                    {item.action && (
                        <s-button slot="secondary-actions" variant="secondary" onClick={() => navigate(item.action.href)}>
                            {item.action.label}
                        </s-button>
                    )}
                </s-banner>
            ))}

            {allClear && (
                <s-banner slot="supplemental-start" tone="success" heading="Everything looks healthy" dismissible>
                    <s-text>Orders are processing, no referral rewards are waiting, and your rules match your store currency.</s-text>
                </s-banner>
            )}

            {!introDismissed && (
                <s-banner
                    ref={introRef}
                    slot="supplemental-start"
                    tone="info"
                    heading="New: referral protection and store currency"
                    dismissible
                >
                    <s-text>
                        Referral rewards are now checked before they are paid: accounts that look like the same person are held for your approval
                        (see Referral Reviews). Customers are told when a reward is held, rejected or skipped. Amounts and symbols now follow your
                        store currency everywhere.
                    </s-text>
                    <s-button slot="secondary-actions" variant="secondary" onClick={() => navigate("/app/referral-reviews")}>
                        Open Referral Reviews
                    </s-button>
                </s-banner>
            )}
        </>
    );
}

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { SNOOZE_DAYS, SNOOZE_KEYS } from "../_attention.js";

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

/** Smooth-scroll to a section of this page (the id sits on a real box inside it: <s-section> itself has none to scroll to). */
function scrollToSection(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

/**
 * "Needs your attention" — everything the merchant should look at, one banner
 * each, with the tone matching how urgent it is:
 *   critical → money/points are not flowing (failed order jobs, rewards that
 *              never recorded), warning → a decision or check is waiting,
 *   info     → a dismissible explanation of the new features. (All clear is shown by StatusHero.)
 * Each banner says what happened, lists the steps to fix it, and has one button
 * that goes straight to the place to do it. "Hide for 7 days" is for things the
 * merchant cannot deal with today (see _attention.js).
 * Renders from numbers the loader already computed; nothing here fetches.
 */
export function AttentionPanel({ items, retrying, onRetry, onHide, busy }) {
    const navigate = useNavigate();
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

    // Page-wide banners: direct children of <s-page> in its supplemental-start
    // slot (outside any section), next steps as secondary-actions, one message
    // per banner. Only banners the merchant doesn't have to act on can be closed.
    return (
        <>
            {items.map((item) => (
                <s-banner key={item.key} slot="supplemental-start" tone={item.tone} heading={item.heading}>
                    <s-stack direction="block" gap="small-300">
                        <s-text>{item.text}</s-text>
                        {item.steps?.length > 0 && (
                            <>
                                <strong>What to do</strong>
                                <s-ordered-list>
                                    {item.steps.map((step) => <s-list-item key={step}>{step}</s-list-item>)}
                                </s-ordered-list>
                            </>
                        )}
                        {SNOOZE_KEYS.includes(item.key) && (
                            <s-stack direction="inline" gap="small" alignItems="center">
                                <s-button
                                    variant="secondary"
                                    loading={busy("snoozeItem", item.key) || undefined}
                                    onClick={() => onHide(item)}
                                >
                                    {`Hide for ${SNOOZE_DAYS} days`}
                                </s-button>
                                <s-text color="subdued">{"Can't deal with this today? It comes back after a week, or sooner if it gets worse."}</s-text>
                            </s-stack>
                        )}
                    </s-stack>
                    {item.retry && (
                        <s-button slot="secondary-actions" variant="secondary" loading={retrying || undefined} disabled={retrying} onClick={onRetry}>
                            Retry failed orders
                        </s-button>
                    )}
                    {item.anchor && (
                        <s-button slot="secondary-actions" variant="secondary" onClick={() => scrollToSection(item.anchor.id)}>
                            {item.anchor.label}
                        </s-button>
                    )}
                    {item.action && (
                        <s-button slot="secondary-actions" variant="secondary" onClick={() => navigate(item.action.href)}>
                            {item.action.label}
                        </s-button>
                    )}
                </s-banner>
            ))}

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

import { useEffect, useRef, useState } from "react";
import { useActionData, useNavigate, useNavigation, useSubmit } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useShopCurrency } from "@app/hooks/useShopCurrency.jsx";

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
export function AttentionPanel({ health }) {
    const navigate = useNavigate();
    const submit = useSubmit();
    const navigation = useNavigation();
    const shopify = useAppBridge();
    const actionData = useActionData();
    const retrying = navigation.state === "submitting" && navigation.formData?.get("submitType") === "retryFailedOrders";

    // Every outcome of the retry button gets a toast, so the click never feels ignored.
    useEffect(() => {
        if (actionData?.submitType !== "retryFailedOrders") return;
        shopify.toast.show(actionData.message, { isError: actionData.status === "error" });
    }, [actionData, shopify]);

    const retryFailedOrders = () => {
        const fd = new FormData();
        fd.set("submitType", "retryFailedOrders");
        submit(fd, { method: "post" });
    };
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

    const { referral, jobs, ruleCurrencies } = health;
    const mismatchedCurrencies = shopCurrency
        ? (ruleCurrencies ?? []).filter((c) => c !== shopCurrency)
        : [];

    const items = [];

    if (jobs.failed > 0) {
        items.push({
            key: "failed-jobs", tone: "critical",
            heading: "Some orders could not be processed",
            text: `${jobs.failed.toLocaleString()} order${jobs.failed > 1 ? "s" : ""} could not be processed in the last 30 days, so ${jobs.failed > 1 ? "their" : "its"} points or reversals were not applied. Try again now — it is safe, nothing is paid twice. If ${jobs.failed > 1 ? "they fail" : "it fails"} again, contact support${jobs.failedOrders?.length ? ` and quote ${jobs.failedOrders.length > 1 ? "these order IDs" : "this order ID"}: ${jobs.failedOrders.join(", ")}` : ""}.`,
            retry: true,
        });
    }
    if (referral.stuck > 0) {
        items.push({
            key: "stuck-referrals", tone: "critical",
            heading: "Referral rewards that were never recorded",
            text: `${referral.stuck.toLocaleString()} referred customer${referral.stuck > 1 ? "s" : ""} used the referral discount, but the referrer didn't receive points. You can add the points manually from the customer's page (Adjust points).`,
            action: { label: "Open Referral Reviews", href: "/app/referral-reviews" },
        });
    }
    if (referral.held > 0) {
        items.push({
            key: "held-referrals", tone: "warning",
            heading: "Referral rewards are waiting for your decision",
            text: `${referral.held.toLocaleString()} referral reward${referral.held > 1 ? "s were" : " was"} held because the two accounts look like the same person or household. Approve to award the points, or reject.`,
            action: { label: "Review", href: "/app/referral-reviews" },
        });
    }
    if (mismatchedCurrencies.length) {
        items.push({
            key: "currency", tone: "warning",
            heading: "A points backfill rule is in a different currency",
            text: `Your store currency is ${shopCurrency}, but a backfill rule is saved in ${mismatchedCurrencies.join(", ")}. Customers whose spend is in ${shopCurrency} would be skipped. Open the rule and save it again to switch it, or create a new one if it has already been used.`,
            action: { label: "Open backfill rules", href: "/app/points-backfill-rules" },
        });
    }
    if (referral.ruleActive === false) {
        items.push({
            key: "rule-off", tone: "warning",
            heading: "Referral rewards are switched off",
            text: "The referral rule is inactive, so referred customers' orders earn nobody points. Customers are told when this happens.",
            action: { label: "Open referral rule", href: "/app/points-rules/referral" },
        });
    }
    if (jobs.waiting > 0) {
        items.push({
            key: "waiting", tone: "info",
            heading: "Some orders are being retried",
            text: `${jobs.waiting.toLocaleString()} order${jobs.waiting > 1 ? "s are" : " is"} being retried — usually because subscription details from Appstle hadn't arrived yet, or you just pressed Retry. You don't need to do anything; this notice disappears when they finish.`,
        });
    }

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
                        <s-button slot="secondary-actions" variant="secondary" loading={retrying || undefined} disabled={retrying} onClick={retryFailedOrders}>
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

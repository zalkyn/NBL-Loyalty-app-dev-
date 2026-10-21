/**
 * @file settings/route.jsx
 * @description Settings overview — one list of every setting, where it lives,
 * and what it is set to now. Read-only on purpose: each setting stays on the
 * page of the feature it belongs to (so its explanation sits beside it), and
 * this page just says where to go.
 *
 *   _settings.server.js -> read-only lookups
 */

import { useLoaderData } from "react-router";
import { authenticate } from "shopify-server";

import { loadSettingsOverview } from "./_settings.server";
import { useShopCurrency } from "@app/hooks/useShopCurrency.jsx";
import { GuideButton } from "@app/layout/guide/components/GuideButton.jsx";

export const loader = async ({ request }) => {
    const { session, admin } = await authenticate.admin(request);
    return loadSettingsOverview(session, admin);
};

const TRIGGERS = { oneTime: "one-time orders only", subscription: "subscription orders only", both: "all orders" };

const on = (text) => ({ tone: "success", text });
const off = (text) => ({ tone: "warning", text });
const info = (text) => ({ tone: "neutral", text });

function buildGroups(d) {
    return [
        {
            title: "Earning points",
            rows: [
                { name: "Orders", what: "How many points a paid order earns, and which orders count.", status: d.orderActive ? on("On") : off("Off"), href: "/app/points-rules/order", cta: "Open order rule" },
                {
                    name: "Referrals", what: "Points for the referrer, the friend's discount, and which orders qualify.",
                    status: d.referralActive ? on(`On${d.referralTrigger && TRIGGERS[d.referralTrigger] ? ` — ${TRIGGERS[d.referralTrigger]}` : ""}`) : off("Off"),
                    href: "/app/points-rules/referral", cta: "Open referral rule",
                },
                { name: "Reviews (Loox)", what: "Points for text, photo and video reviews.", status: d.reviewActive ? on("On") : off("Off"), href: "/app/points-rules/review", cta: "Open review rule" },
                { name: "Review connection", what: "The private link that tells this app about new Loox reviews.", status: d.looxConnected ? on("Link created") : off("Not set up"), href: "/app/loox-setup", cta: "Open review setup" },
                { name: "Points Backfill", what: "One-time points for customers who bought before the app.", status: info(d.backfillCount == null ? "—" : `${d.backfillCount} rule${d.backfillCount === 1 ? "" : "s"}`), href: "/app/points-backfill-rules", cta: "Open backfill rules" },
            ],
        },
        {
            title: "Spending points",
            rows: [
                { name: "Rewards", what: "What customers can redeem points for.", status: info(d.rewardCount == null ? "—" : `${d.rewardCount} active`), href: "/app/rewards-rules", cta: "Open reward rules" },
                { name: "Physical prizes", what: "Real products customers claim with points.", status: info(d.prizeCount == null ? "—" : `${d.prizeCount} active`), href: "/app/physical-prizes-rules", cta: "Open prize rules" },
            ],
        },
        {
            title: "Subscriptions",
            rows: [
                {
                    name: "Reset points when a subscription is cancelled",
                    what: "Whether points reset automatically, and whether that happens at once or when the paid period ends.",
                    status: !d.cancel ? info("—") : d.cancel.enabled
                        ? on(`On — ${d.cancel.resetTiming === "period_end" ? "when the paid period ends" : "immediately"}`)
                        : off("Off — you reset by hand"),
                    href: "/app/subscription-cancellations", cta: "Open cancellations",
                },
            ],
        },
        {
            title: "What customers see",
            rows: [
                { name: "Widget look and wording", what: "Labels, colours, which tabs show, and where the widget appears.", status: info("Customize"), href: "/app/customize", cta: "Open Widget Customize" },
                { name: "Pop-ups on page load", what: "Short messages about new points. Activity always lists everything.", status: d.toastsOn ? on("On") : off("Off"), href: "/app/customize", cta: "Open Widget Customize" },
                { name: "Widget in your theme", what: "Switch on the app embed and add the optional page and balance blocks.", status: info("Theme"), href: "/app/setup-guide", cta: "Open Setup Guide" },
            ],
        },
        {
            title: "Other",
            rows: [
                { name: "Points Events", what: "The kinds of action that can earn points. Usually left as they are.", status: info("Standard"), href: "/app/points-events", cta: "Open Points Events" },
            ],
        },
    ];
}

const SELLING_SHOWN = 8;

function StoreSection({ store }) {
    const { symbol } = useShopCurrency();
    if (!store) {
        return (
            <s-section heading="Your store">
                <s-banner tone="info">
                    <s-text>We couldn't read your store details from Shopify just now. Refresh the page to try again.</s-text>
                </s-banner>
            </s-section>
        );
    }
    const others = store.sellingCurrencies.filter((c) => c !== store.currencyCode);
    const rows = [
        { label: "Store", value: store.name, note: store.domain },
        store.primaryDomain && { label: "Web address", value: store.primaryDomain.replace(/^https?:\/\//, ""), note: "The address customers see." },
        {
            label: "Currency",
            value: store.currencyCode ? `${store.currencyCode}${symbol ? ` (${symbol})` : ""}` : "—",
            note: "Read from Shopify. Reward amounts, \"points per amount spent\" and the referral discount all use it. There is nothing to set in this app; change it in Shopify and the app follows.",
        },
        others.length > 0 && {
            label: "Also sold in",
            value: others.slice(0, SELLING_SHOWN).join(", ") + (others.length > SELLING_SHOWN ? ` and ${others.length - SELLING_SHOWN} more` : ""),
            note: "Customers may pay in these. Points are still worked out in your store currency.",
        },
        store.timezone && { label: "Time zone", value: store.timezone, note: "For reference. It's the time zone set in your Shopify store." },
    ].filter(Boolean);

    return (
        <s-section heading="Your store">
            <s-stack direction="block" gap="base">
                {rows.map((row) => (
                    <s-stack key={row.label} direction="block" gap="small-500">
                        <s-stack direction="inline" gap="small" alignItems="center">
                            <s-text type="strong">{row.label}</s-text>
                            <s-badge>{row.value}</s-badge>
                        </s-stack>
                        {row.note && <s-text color="subdued">{row.note}</s-text>}
                    </s-stack>
                ))}
                <s-text color="subdued">These come from Shopify and are shown for reference. To change them, use your Shopify admin → Settings.</s-text>
            </s-stack>
        </s-section>
    );
}

export default function SettingsPage() {
    const data = useLoaderData();
    const groups = buildGroups(data);

    return (
        <s-page heading="Settings" inlineSize="base">
            <GuideButton topic="settings" />

            <s-section>
                <s-paragraph>
                    Every setting of the programme in one place: what it controls and what it is set to now. To change one,
                    open it. Each setting lives beside the feature it belongs to, with its explanation next to it.
                </s-paragraph>
            </s-section>

            <StoreSection store={data.store} />

            {groups.map((group) => (
                <s-section key={group.title} heading={group.title}>
                    <s-stack direction="block" gap="base">
                        {group.rows.map((row) => (
                            <s-stack key={row.name} direction="inline" gap="base" justifyContent="space-between" alignItems="center">
                                <s-stack direction="block" gap="small-500">
                                    <s-stack direction="inline" gap="small" alignItems="center">
                                        <s-text type="strong">{row.name}</s-text>
                                        <s-badge tone={row.status.tone}>{row.status.text}</s-badge>
                                    </s-stack>
                                    <s-text color="subdued">{row.what}</s-text>
                                </s-stack>
                                <s-button href={row.href}>{row.cta}</s-button>
                            </s-stack>
                        ))}
                    </s-stack>
                </s-section>
            ))}
        </s-page>
    );
}

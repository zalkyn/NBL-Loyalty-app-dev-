/**
 * @file health/route.jsx
 * @description Program Health — one place that says whether the loyalty program
 * is working: what needs the merchant's attention (with the action to take),
 * and a plain-language explanation of how each feature works with live numbers.
 * Moved off the dashboard so the dashboard stays about the charts.
 *
 *   _health.server.js  -> base numbers (also used by the dashboard) + the "retry failed orders" write
 *   _details.server.js -> extra numbers only this page shows (failed-order list, checklist, vouchers, prizes…)
 *   _useRetry.js       -> the retry button's submit + toast, shared by the banner and the table
 *   _attention.js     -> pure list of attention items (shared with the dashboard summary)
 *   _snooze.server.js  -> "Hide for 7 days" and "Mark as handled" (remember only; never touch points)
 *   _useActions.js     -> their submit + toast
 *   components/        -> AttentionPanel (banners), StatusHero, StuckReferrals, FailedOrdersTable, CanWait, SetupChecklist, FeatureHealth (cards), HiddenNotices
 */

import { useLoaderData } from "react-router";
import { authenticate } from "shopify-server";

import { loadHealthData, retryFailedOrderJobs } from "./_health.server";
import { loadHealthDetails } from "./_details.server";
import { snoozeItem, unsnoozeItem, markReferralHandled } from "./_snooze.server";
import { buildAttentionItems, buildHiddenItems } from "./_attention.js";
import { useRetryFailedOrders } from "./_useRetry.js";
import { useHealthActions } from "./_useActions.js";
import { useShopCurrency } from "@app/hooks/useShopCurrency.jsx";
import { AttentionPanel } from "./components/AttentionPanel";
import { FeatureHealth } from "./components/FeatureHealth";
import { StatusHero } from "./components/StatusHero";
import { SetupChecklist } from "./components/SetupChecklist";
import { FailedOrdersTable } from "./components/FailedOrdersTable";
import { StuckReferrals } from "./components/StuckReferrals";
import { HiddenNotices } from "./components/HiddenNotices";
import { CanWait } from "./components/CanWait";
import { GuideButton } from "@app/layout/guide/components/GuideButton.jsx";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const [health, details] = await Promise.all([loadHealthData(session), loadHealthDetails(session)]);
    return { health, details, checkedAt: new Date().toISOString() };
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const submitType = formData.get("submitType");

    if (submitType === "retryFailedOrders") {
        try {
            const count = await retryFailedOrderJobs(session);
            return count > 0
                ? { status: "success", submitType, count, message: `Retrying ${count} order${count > 1 ? "s" : ""}. This can take a few minutes — this warning goes away if they succeed.` }
                : { status: "success", submitType, count: 0, message: "There are no failed orders to retry." };
        } catch {
            return { status: "error", submitType, message: "Could not retry the orders. Nothing was changed — please try again." };
        }
    }

    try {
        if (submitType === "snoozeItem") {
            const ok = await snoozeItem(session, String(formData.get("key")), formData.get("count"));
            return ok
                ? { status: "success", submitType, message: "Hidden for 7 days. It comes back sooner if the problem gets bigger. You can show it again at the bottom of this page." }
                : { status: "error", submitType, message: "That notice can't be hidden." };
        }
        if (submitType === "unsnoozeItem") {
            const ok = await unsnoozeItem(session, String(formData.get("key")));
            return ok
                ? { status: "success", submitType, message: "Shown again." }
                : { status: "error", submitType, message: "Could not change that notice." };
        }
        if (submitType === "markReferralHandled") {
            const ok = await markReferralHandled(session, formData.get("referralId"));
            return ok
                ? { status: "success", submitType, message: "Marked as handled. It no longer appears in this list." }
                : { status: "error", submitType, message: "Nothing was changed. This referral was already handled — refresh the page." };
        }
    } catch {
        return { status: "error", submitType, message: "Something went wrong and nothing was changed. Please try again." };
    }

    return { status: "error", submitType, message: "Invalid action." };
};

export default function ProgramHealthPage() {
    const { health, details, checkedAt } = useLoaderData();
    const { code: shopCurrency } = useShopCurrency();
    const { retrying, retry } = useRetryFailedOrders();
    const actions = useHealthActions();
    const items = buildAttentionItems(health, shopCurrency);
    const hidden = buildHiddenItems(health, shopCurrency);

    return (
        <s-page heading="Program Health">
            <GuideButton topic="health" />
            <AttentionPanel items={items} retrying={retrying} onRetry={retry} onHide={actions.hide} busy={actions.busy} />

            <StatusHero items={items} checkedAt={checkedAt} details={details} unavailable={Boolean(health.unavailable)} />
            {details && <StuckReferrals stuck={details.stuck} total={health.referral.stuck} onHandled={actions.markHandled} busy={actions.busy} />}
            {details && <FailedOrdersTable failed={details.failed} total={details.failedTotal} shop={details.shop} retrying={retrying} onRetry={retry} />}
            {details && <CanWait details={details} />}
            {details && <SetupChecklist checklist={details.checklist} />}
            <s-section heading="How each feature is doing">
                <s-text color="subdued">What each part of the program does, in plain words, with live numbers.</s-text>
            </s-section>
            <FeatureHealth health={health} details={details} />
            <HiddenNotices hidden={hidden} onShow={actions.show} busy={actions.busy} />
        </s-page>
    );
}

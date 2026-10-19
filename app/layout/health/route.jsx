/**
 * @file health/route.jsx
 * @description Program Health — one place that says whether the loyalty program
 * is working: what needs the merchant's attention (with the action to take),
 * and a plain-language explanation of how each feature works with live numbers.
 * Moved off the dashboard so the dashboard stays about the charts.
 *
 *   _health.server.js -> read-only queries + the "retry failed orders" write
 *   _attention.js     -> pure list of attention items (shared with the dashboard summary)
 *   components/       -> AttentionPanel (banners), FeatureHealth (cards)
 */

import { useLoaderData } from "react-router";
import { authenticate } from "shopify-server";

import { loadHealthData, retryFailedOrderJobs } from "./_health.server";
import { AttentionPanel } from "./components/AttentionPanel";
import { FeatureHealth } from "./components/FeatureHealth";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    return { health: await loadHealthData(session) };
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

    return { status: "error", submitType, message: "Invalid action." };
};

export default function ProgramHealthPage() {
    const { health } = useLoaderData();

    return (
        <s-page heading="Program Health">
            <AttentionPanel health={health} />
            <FeatureHealth health={health} />
        </s-page>
    );
}

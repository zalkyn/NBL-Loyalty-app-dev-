/**
 * @file dev-config/index/route.jsx
 * @description Landing page for the dev-config tool group — reachable via
 * the short /app/dev-config URL instead of needing to already know one of
 * the specific sub-page paths. Lists the available tools with a one-line
 * description of each and a link, plus the shared DevConfigNav at the top
 * (same nav every dev-config page shows).
 *
 * Also the single place to toggle the maintenance-tool flags (see
 * maintenanceToolFlags.js) — the three destructive buttons on the Customer
 * Sync page each only render when its flag is ON here. All default OFF; a
 * developer turns the one they need ON, uses it, and turns it back OFF.
 *
 * Deliberately NOT linked from the main app navigation (see AppNav.jsx) —
 * developer-only. This page's whole purpose is just being an easy,
 * memorable entry point once you're already typing a URL by hand.
 */

import { useState } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "shopify-server";
import { getMaintenanceToolFlags, updateMaintenanceToolFlags } from "@controller/appSettings/maintenanceToolFlags";
import { DevConfigNav } from "../components/DevConfigNav";

// ─── Loader ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    // Shown here so a developer can see and change, in one place, whether
    // the maintenance tools on Customer Sync are enabled for this shop —
    // see maintenanceToolFlags.js.
    const toolFlags = await getMaintenanceToolFlags(session.shop);
    return { toolFlags };
};

// ─── Action ─────────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent")?.toString() || "";

    if (intent === "saveMaintenanceToolFlags") {
        const flags = await updateMaintenanceToolFlags({
            shop: session.shop,
            sessionId: session.id,
            showResetSyncButton: formData.get("showResetSyncButton") === "true",
            showEmptyConfigButton: formData.get("showEmptyConfigButton") === "true",
            showDeleteCustomerButton: formData.get("showDeleteCustomerButton") === "true",
        });
        return { ok: true, message: "Maintenance tool flags saved.", toolFlags: flags };
    }

    return { ok: false, message: "Unknown action." };
};

// ─── Tool directory ─────────────────────────────────────────────────────────────

const TOOLS = [
    {
        key: "version-tracking",
        title: "Version Tracking",
        href: "/app/dev-config/version-tracking",
        description:
            "Announce a new app-config version (drives the widget's \"update available\" banner/auto-sync), " +
            "and see rollout progress.",
    },
    {
        key: "customer-sync",
        title: "Customer Sync",
        href: "/app/dev-config/customer-sync",
        description:
            "Manually sync/re-sync individual or all customers' app metafields (points, rewards, transactions, " +
            "prize claims) from the database — plus the reset/empty-config/delete-record maintenance tools.",
    },
    {
        key: "queue-jobs",
        title: "Background Jobs",
        href: "/app/dev-config/queue-jobs",
        description:
            "View and manually cancel/retry/force-reset/delete background Job rows (order-paid processing, " +
            "customer resync batches, bulk config sync, etc.) — filter by status, single/bulk/group actions.",
    },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DevConfigIndexPage() {
    const { toolFlags } = useLoaderData();
    const settingsFetcher = useFetcher();

    const [showResetSyncButton, setShowResetSyncButton] = useState(toolFlags.showResetSyncButton);
    const [showEmptyConfigButton, setShowEmptyConfigButton] = useState(toolFlags.showEmptyConfigButton);
    const [showDeleteCustomerButton, setShowDeleteCustomerButton] = useState(toolFlags.showDeleteCustomerButton);

    function handleSaveFlags() {
        settingsFetcher.submit(
            {
                intent: "saveMaintenanceToolFlags",
                showResetSyncButton: String(showResetSyncButton),
                showEmptyConfigButton: String(showEmptyConfigButton),
                showDeleteCustomerButton: String(showDeleteCustomerButton),
            },
            { method: "post" }
        );
    }

    return (
        <s-page heading="Dev Config">
            <DevConfigNav active="index" />

            <s-section heading="Tools">
                <s-paragraph tone="subdued">
                    Developer-only pages for managing the loyalty app behind
                    the scenes. They aren't linked in the app's normal menu —
                    bookmark this page (/app/dev-config) to get back here. Open
                    one to see what it does.
                </s-paragraph>
                <s-box paddingBlockStart="base">
                <s-stack direction="block" gap="base">
                    {TOOLS.map((tool) => (
                        <s-box key={tool.key} padding="base" border="base" borderRadius="base">
                            <s-link href={tool.href}>
                                <s-text fontWeight="bold">{tool.title}</s-text>
                            </s-link>
                            <s-box paddingBlockStart="small">
                                <s-paragraph tone="subdued">{tool.description}</s-paragraph>
                            </s-box>
                        </s-box>
                    ))}
                </s-stack>
                </s-box>
            </s-section>

            <s-section heading="Maintenance tools (this shop)">
                <s-paragraph tone="subdued">
                    These are developer tools for fixing or testing customer
                    data. They live on the Customer Sync page, but each one is
                    hidden until you turn its toggle on here. That's the safety
                    switch: two of them permanently delete real data with no
                    undo, so they stay off until you deliberately enable the
                    one you need.
                </s-paragraph>
                <s-paragraph tone="subdued">
                    How to use: turn a toggle on, click Save, go to the
                    Customer Sync page and use the button that now appears,
                    then come back here and turn it off again. All three are
                    off by default, and behave exactly the same on every shop
                    — there's no separate "test mode".
                </s-paragraph>

                <s-box paddingBlockStart="base">
                    <s-stack direction="block" gap="extra-small">
                        <s-checkbox
                            label="Reset all customers' sync status — makes the app think no one has synced yet, so the update banner / sync flow can be tried again from scratch. Safe: touches only the app's own tracking, never Shopify or any real points/rewards."
                            checked={showResetSyncButton}
                            onChange={() => setShowResetSyncButton((prev) => !prev)}
                        ></s-checkbox>
                        <s-checkbox
                            label="Empty already-synced customers' config — DELETES real Shopify data (points, rewards, transactions, prize claims) for customers who are currently synced. Used to test how the widget recovers from missing data. Cannot be undone except by syncing again."
                            checked={showEmptyConfigButton}
                            onChange={() => setShowEmptyConfigButton((prev) => !prev)}
                        ></s-checkbox>
                        <s-checkbox
                            label="Delete customer record entirely — the most destructive: removes both the Shopify data AND the app's own record for a customer (points, rewards, transactions, prize claims, referral history — everything). Used to test the 'Join our Program' step as a brand-new customer. Cannot be undone."
                            checked={showDeleteCustomerButton}
                            onChange={() => setShowDeleteCustomerButton((prev) => !prev)}
                        ></s-checkbox>
                    </s-stack>
                </s-box>

                {settingsFetcher.data?.message && (
                    <s-box paddingBlockStart="base">
                        <s-paragraph tone={settingsFetcher.data.ok ? "success" : "critical"}>
                            {settingsFetcher.data.message}
                        </s-paragraph>
                    </s-box>
                )}

                <s-box paddingBlockStart="base">
                    <s-button
                        variant="secondary"
                        loading={settingsFetcher.state !== "idle" ? true : undefined}
                        onClick={handleSaveFlags}
                    >
                        Save
                    </s-button>
                </s-box>
            </s-section>
        </s-page>
    );
}

/**
 * @file loox-setup/route.jsx
 * @description Merchant-facing setup guide for connecting Loox product
 * review submissions to this app's points system via a Shopify Flow
 * workflow. Written for a non-technical merchant — every step names the
 * exact button/label they'll see on screen.
 *
 * The page's core job is showing the shop's unique webhook URL (embeds a
 * per-shop token — see ensureLooxFlowToken.js) for the merchant to paste
 * into their own Flow workflow's "Send HTTP request" action.
 *
 *   route.jsx        -> loader, action, page composition
 *   components/
 *     SetupSteps.jsx        -> the click-by-click instructions
 *     CopyField.jsx         -> read-only value + Copy button
 *     RegenerateUrlCard.jsx -> "Generate a new URL" danger-zone action
 */

import { useEffect } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "shopify-server";

import ensureLooxFlowToken from "@controller/appSettings/ensureLooxFlowToken.js";
import { SetupSteps } from "./components/SetupSteps.jsx";
import { RegenerateUrlCard } from "./components/RegenerateUrlCard.jsx";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Builds the full public webhook URL a merchant pastes into their Flow
 * workflow's "Send HTTP request" action.
 *
 * @param {string} token
 * @returns {string}
 */
function buildWebhookUrl(token) {
    const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
    return `${appUrl}/api/loox-new-review-trigger/${token}`;
}

// ─── Loader ─────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const token = await ensureLooxFlowToken(session);
    return { webhookUrl: buildWebhookUrl(token) };
};

// ─── Action — regenerate only ──────────────────────────────────────────────

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const token = await ensureLooxFlowToken(session, /* force */ true);
    return { webhookUrl: buildWebhookUrl(token), regenerated: true };
};

// ─── Page ───────────────────────────────────────────────────────────────────

export default function LooxSetupPage() {
    const { webhookUrl: initialUrl } = useLoaderData();
    const fetcher = useFetcher();

    // Prefer the freshly-regenerated URL once the action responds; fall
    // back to the loader's URL otherwise.
    const webhookUrl = fetcher.data?.webhookUrl || initialUrl;
    const busy = fetcher.state !== "idle";

    // Confirm before firing — regenerating breaks the merchant's existing
    // Flow workflow until they come back and paste the new URL in.
    function handleRegenerate() {
        const confirmed = window.confirm(
            "This will stop your current Loox review workflow from working until you " +
            "paste the new URL into Shopify Flow. Continue?"
        );
        if (!confirmed) return;
        fetcher.submit({}, { method: "post" });
    }

    useEffect(() => {
        if (fetcher.data?.regenerated) {
            // eslint-disable-next-line no-console
            console.info("[NBL] Loox Flow URL regenerated");
        }
    }, [fetcher.data]);

    return (
        <s-page heading="Loox Review Points Setup" inlineSize="base">
            <SetupSteps webhookUrl={webhookUrl} />
            <RegenerateUrlCard busy={busy} onRegenerate={handleRegenerate} />
        </s-page>
    );
}

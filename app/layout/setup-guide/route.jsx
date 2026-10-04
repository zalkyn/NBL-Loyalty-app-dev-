/* eslint-env node */
/**
 * @file setup-guide/route.jsx
 * @description Merchant-facing Setup Guide: how to put the loyalty widget on
 * the storefront and use every storefront-side option — the app embed, the
 * Loyalty page block and its Text size, the custom font, custom CSS, and
 * showing a member's points anywhere (app block, Liquid snippet, JS API).
 *
 * Read-only: no action. Every claim here mirrors real behaviour — keep it in
 * step with:
 *   - extensions/theme-extension/blocks/loyalty.liquid        (app embed, font)
 *   - extensions/theme-extension/blocks/loyalty-page.liquid   (page block, Text size)
 *   - extensions/theme-extension/blocks/loyalty-points.liquid (points block — the
 *     snippet below is the same Liquid)
 *   - app/widget-ui/ui/hooks/usePublishPoints.js              (live points / JS API)
 *   - app/widget-ui/ui/hooks/useCustomCss.js                  (custom CSS scope)
 *
 * Deep links follow Shopify's documented theme app extension formats
 * (shopify.dev → Configure theme app extensions → Deep linking):
 *   app embed: /admin/themes/current/editor?context=apps&activateAppId={api_key}/{handle}
 *   app block: /admin/themes/current/editor?template=...&addAppBlockId={api_key}/{handle}&target=newAppsSection
 * {api_key} is SHOPIFY_API_KEY (the app's client_id), so dev and production
 * builds each link to their own app.
 */

import { useLoaderData } from "react-router";
import { authenticate } from "shopify-server";

import { CopyField } from "@app/layout/loox-setup/components/CopyField.jsx";

// ─── Loader ─────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    return { shop: session.shop, apiKey: process.env.SHOPIFY_API_KEY || "" };
};

// ─── Content ────────────────────────────────────────────────────────────────

const POINTS_SNIPPET = `{%- liquid
  assign nbl_core = customer.metafields.app.nbl_customer_core_v1.value
  assign nbl_legacy = customer.metafields.app.nbl_customer_v1.value

  assign nbl_is_member = false
  if customer
    if nbl_core.id != blank or nbl_legacy.id != blank
      assign nbl_is_member = true
    endif
  endif

  assign nbl_points = nbl_core.points | default: nbl_legacy.points | default: 0
-%}

{%- if nbl_is_member -%}
  <div class="members-card">
    <span data-nbl-points>{{ nbl_points }}</span> pts
    <a href="/pages/loyalty-rewards">View rewards</a>
  </div>
{%- elsif customer -%}
  {%- comment -%} Logged in, not a loyalty member yet {%- endcomment -%}
{%- else -%}
  {%- comment -%} Logged out {%- endcomment -%}
{%- endif -%}`;

const JS_SNIPPET = `// Current values (set once the widget has loaded)
window.NBL_v1.points      // number, e.g. 5180
window.NBL_v1.isMember    // true / false
window.NBL_v1.isLoggedIn  // true / false

// Fires on load and whenever points or membership change
document.addEventListener("nbl:points-updated", function (event) {
  console.log(event.detail.points, event.detail.isMember, event.detail.isLoggedIn);
});`;

const CSS_EXAMPLE = `.nbl-header__title { font-size: 22px; }
.nbl-nav__item { font-size: 15px; }`;

function Step({ number, title, children }) {
    return (
        <s-section>
            <s-stack direction="block" gap="base">
                <s-heading>{number}. {title}</s-heading>
                {children}
            </s-stack>
        </s-section>
    );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SetupGuidePage() {
    const { shop, apiKey } = useLoaderData();

    const editor = `https://${shop}/admin/themes/current/editor`;
    const embedLink = `${editor}?context=apps&activateAppId=${apiKey}/loyalty`;
    const pageBlockLink = `${editor}?template=page&addAppBlockId=${apiKey}/loyalty-page&target=newAppsSection`;
    const pointsBlockLink = `${editor}?template=page&addAppBlockId=${apiKey}/loyalty-points&target=newAppsSection`;

    return (
        <s-page heading="Setup Guide" inlineSize="base">
            <s-section>
                <s-paragraph>
                    Everything needed to show the loyalty program on your store, in order. Step 1 is required; the
                    rest are optional. Theme editor links open in a new tab — review the change there, then click
                    <strong> Save</strong>.
                </s-paragraph>
            </s-section>

            <Step number={1} title="Turn on the loyalty widget (required)">
                <s-paragraph>
                    In the theme editor, open <strong>App embeds</strong> and switch on <strong>NB Loyalty</strong>.
                    This adds the floating widget to every page and is needed by every other step below.
                </s-paragraph>
                <s-button variant="primary" href={embedLink} target="_blank">Open App embeds</s-button>
            </Step>

            <Step number={2} title="Add a Loyalty & Rewards page (optional)">
                <s-paragraph>
                    Shows the full widget inside one of your own pages, with room for videos, FAQs and terms around it.
                </s-paragraph>
                <s-unordered-list>
                    <s-list-item>Create the page in <strong>Online Store → Pages</strong> (for example &quot;Loyalty &amp; Rewards&quot;).</s-list-item>
                    <s-list-item>
                        Add the <strong>Loyalty &amp; Rewards</strong> block to that page. The button below opens your default
                        page template; if the page uses a different template, switch to it in the theme editor first.
                    </s-list-item>
                    <s-list-item>
                        In <s-link href="/app/customize">Widget Customize</s-link> → <strong>Widget Config</strong> →{" "}
                        <strong>Display &amp; Placement</strong>, set <strong>Expand button opens</strong> to{" "}
                        <strong>Loyalty page</strong> and enter the page&apos;s path as the <strong>Loyalty page URL</strong>{" "}
                        (for example <code>/pages/loyalty-rewards</code>).
                    </s-list-item>
                </s-unordered-list>
                <s-button href={pageBlockLink} target="_blank">Add the Loyalty &amp; Rewards block</s-button>
            </Step>

            <Step number={3} title="Make the page text bigger or smaller (optional)">
                <s-paragraph>
                    Select the <strong>Loyalty &amp; Rewards</strong> block in the theme editor and use{" "}
                    <strong>Text size</strong> (80–150%). Desktop and mobile each have their own setting. Text, spacing
                    and buttons scale together; the block&apos;s width and height stay as you set them. This only
                    affects the page block, not the floating widget.
                </s-paragraph>
            </Step>

            <Step number={4} title="Use a different font (optional)">
                <s-paragraph>
                    By default the widget uses your theme&apos;s font. To change it, open <strong>App embeds</strong> →{" "}
                    <strong>NB Loyalty</strong>, turn on <strong>Use a custom font</strong> and pick a font. It applies
                    to both the floating widget and the Loyalty &amp; Rewards page.
                </s-paragraph>
                <s-button href={embedLink} target="_blank">Open App embeds</s-button>
            </Step>

            <Step number={5} title="Add your own CSS (optional)">
                <s-paragraph>
                    In <s-link href="/app/customize">Widget Customize</s-link> → <strong>Advanced</strong>, use{" "}
                    <strong>Custom CSS (page &amp; full screen)</strong>. It applies only to the Loyalty &amp; Rewards
                    page and the full-screen widget — never to the small floating widget — and you don&apos;t need any
                    prefix. Example:
                </s-paragraph>
                <CopyField value={CSS_EXAMPLE} multiline />
            </Step>

            <Step number={6} title="Show a member's points anywhere (optional)">
                <s-paragraph>
                    <strong>Easiest — the Loyalty points block.</strong> Add it to any section that accepts app blocks.
                    It shows the logged-in member&apos;s balance, with optional text before and after it, a link, and
                    separate optional text for non-members and logged-out visitors.
                </s-paragraph>
                <s-button href={pointsBlockLink} target="_blank">Add the Loyalty points block</s-button>

                <s-paragraph>
                    <strong>For your own theme code — Liquid.</strong> Paste this into a <strong>Custom Liquid</strong>{" "}
                    section or your theme files, then style the markup however you like:
                </s-paragraph>
                <CopyField value={POINTS_SNIPPET} multiline />

                <s-paragraph>
                    <strong>For your own JavaScript.</strong> Available on any page where the widget is shown:
                </s-paragraph>
                <CopyField value={JS_SNIPPET} multiline />

                <s-banner tone="info">
                    The number updates live after a customer claims a reward — anything with the{" "}
                    <code>data-nbl-points</code> attribute is updated automatically, on pages where the widget is
                    shown. A customer counts as a member once they&apos;re enrolled in the loyalty program.
                </s-banner>
            </Step>
        </s-page>
    );
}

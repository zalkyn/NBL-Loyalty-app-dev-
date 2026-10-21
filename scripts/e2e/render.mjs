/**
 * Renders the new/changed admin pages on the server with real data from the
 * e2e database (run e2e.mjs with --keep first) and checks the HTML for the
 * things that would be wrong on screen: crashes, "undefined"/"NaN"/"[object",
 * a stray hardcoded "$", missing sections. Not a browser: it proves the pages
 * render with real data; it can't prove how they look.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import React from "react";
import { renderToString } from "react-dom/server";
import { suite, check, report } from "../test/lib/assert.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url) || !/e2e$/.test(url.split("?")[0])) { console.error("Refusing: needs the e2e database."); process.exit(1); }

const app = (p) => path.join(root, "app", p);
const vite = await createServer({
    root, configFile: false, logLevel: "silent", appType: "custom",
    server: { middlewareMode: true }, esbuild: { jsx: "automatic" },
    resolve: {
        alias: [
            { find: "shopify-server", replacement: path.join(root, "scripts/e2e/stub-shopify.mjs") },
            { find: "@shopify/app-bridge-react", replacement: path.join(root, "scripts/e2e/appbridge-stub.js") },
            { find: "db-server", replacement: app("db.server.js") },
            { find: /^@app\//, replacement: app("") + "/" },
            { find: /^app\//, replacement: app("") + "/" },
            { find: /^@controller\//, replacement: app("controller/") },
            { find: /^@utils\//, replacement: app("utils/") },
            { find: /^@graphql\//, replacement: app("graphql/") },
            { find: /^@atoms\//, replacement: app("atoms/") },
            { find: /^@components\//, replacement: app("components/") },
            { find: /^@shared-utils\//, replacement: app("layout/points-rules/shared-utils/") },
        ],
    },
    ssr: { noExternal: ["react-router"] },
});
const load = (p) => vite.ssrLoadModule(app(p));
// Same copy of react-router the pages use, or hooks cannot find the router context.
const { createStaticHandler, createStaticRouter, StaticRouterProvider } = await vite.ssrLoadModule("react-router");

globalThis.__fakeAdmin = { graphql: async (query) => ({ json: async () => ({ data: /ShopDetails/.test(query) ? { shop: { name: "E2E Shop", myshopifyDomain: "e2e-shop.myshopify.com", primaryDomain: { url: "https://e2e.example.com" }, currencyCode: "AUD", ianaTimezone: "Australia/Sydney", enabledPresentmentCurrencies: ["AUD"] } } : {} }) }) };
const { default: prisma } = await load("db.server.js");
const session = await prisma.session.findFirst();
if (!session) { console.error("No data: run e2e.mjs --keep first."); process.exit(1); }
const { ShopCurrencyProvider } = await load("hooks/useShopCurrency.jsx");

async function render(Component, data, path = "/page") {
    const routes = [{ path, Component, loader: () => data }];
    const handler = createStaticHandler(routes);
    const context = await handler.query(new Request(`http://localhost${path}`));
    const router = createStaticRouter(handler.dataRoutes, context);
    return renderToString(
        React.createElement(ShopCurrencyProvider, { code: "AUD" }, React.createElement(StaticRouterProvider, { router, context, hydrate: false }))
    );
}

const clean = (html) => html.replace(/<style[\s\S]*?<\/style>/g, "");
const sane = (name, html) => check(`${name}: no undefined / NaN / [object / null text`, () => !/>[^<]*(undefined|NaN|\[object|\bnull\b)[^<]*</.test(clean(html)));
const noDollar = (name, html) => check(`${name}: no hardcoded "$"`, () => !/>[^<]*\$[0-9{]?[^<]*</.test(clean(html).replace(/A\$/g, "")));
const has = (name, html, text) => check(`${name}: shows "${text}"`, () => html.includes(text));

// ── Settings ──────────────────────────────────────────────────────────────
const fakeAdmin = { graphql: async () => ({ json: async () => ({ data: { shop: { name: "E2E Shop", myshopifyDomain: "e2e-shop.myshopify.com", primaryDomain: { url: "https://e2e.example.com" }, currencyCode: "AUD", ianaTimezone: "Australia/Sydney", enabledPresentmentCurrencies: ["AUD", "USD", "GBP"] } } }) }) };
await suite("Settings page", async () => {
    const { loadSettingsOverview } = await load("layout/settings/_settings.server.js");
    const { default: Page } = await load("layout/settings/route.jsx");
    const html = await render(Page, await loadSettingsOverview(session, fakeAdmin));
    sane("settings", html); noDollar("settings", html);
    for (const t of ["Your store", "E2E Shop", "AUD (A$)", "USD, GBP", "Australia/Sydney", "Earning points", "Subscriptions", "Off — you reset by hand", "Open Widget Customize"]) has("settings", html, t);
});

// ── Program Health ────────────────────────────────────────────────────────
await suite("Program Health page", async () => {
    const { loadHealthData } = await load("layout/health/_health.server.js");
    const { loadHealthDetails } = await load("layout/health/_details.server.js");
    const { default: Page } = await load("layout/health/route.jsx");
    const health = await loadHealthData(session);
    const details = await loadHealthDetails(session);
    const html = await render(Page, { health, details, checkedAt: new Date().toISOString() });
    sane("health", html); noDollar("health", html);
    for (const t of ["Program status", "Setup checklist", "How each feature is doing", "Order processing", "Referrals", "Rewards and vouchers", "Physical prizes", "Subscription cancellations", "Customer balances", "Check again"]) has("health", html, t);
    // empty state when there is nothing wrong and details failed
    const html2 = await render(Page, { health: { referral: { ruleActive: true, trigger: "both", held: 0, skipped30d: 0, flagged30d: 0, stuck: 0 }, jobs: { failed: 0, failedOrders: [], waiting: 0 }, ruleCurrencies: [] }, details: null, checkedAt: new Date().toISOString() });
    sane("health (details unavailable)", html2); has("health (details unavailable)", html2, "Healthy");
});

// ── Feature Guide: every topic ────────────────────────────────────────────
await suite("Feature Guide", async () => {
    const { GUIDE_TOPICS } = await load("layout/guide/_content.js");
    const { default: Page } = await load("layout/guide/route.jsx");
    for (const t of GUIDE_TOPICS) {
        const html = await render(Page, { topic: t.key }, "/guide");
        sane(`guide/${t.key}`, html);
        check(`guide/${t.key}: has How it works, an example and What your customers see`, () => html.includes("How it works") && /Example/.test(html) && html.includes("What your customers see"));
        check(`guide/${t.key}: every step and example line rendered`, () => [...t.steps, ...t.examples.flatMap((e) => e.lines)].every((s) => html.includes(s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))));
    }
    check("guide: 16 topics", () => GUIDE_TOPICS.length === 16);
});

// ── Referral Reviews ──────────────────────────────────────────────────────
await suite("Referral Reviews page", async () => {
    const { loadReviews } = await load("layout/referral-reviews/_data.server.js");
    const { default: Page } = await load("layout/referral-reviews/route.jsx");
    for (const tab of ["waiting", "flagged", "rejected"]) {
        const data = await loadReviews(session, new URLSearchParams(`tab=${tab}`));
        const html = await render(Page, data, "/reviews");
        sane(`reviews/${tab}`, html); noDollar(`reviews/${tab}`, html);
        has(`reviews/${tab}`, html, "Referral Reviews");
        if (data.rows.length) check(`reviews/${tab}: ${data.rows.length} row(s) shown`, () => data.rows.every((r) => html.includes(r.referrer.email)));
    }
});


// ── Sweep: every admin page, with its REAL loader and the fake Shopify ────
if (!(await prisma.event.findFirst({ where: { sessionId: session.id, type: "REVIEW" } }))) await prisma.event.create({ data: { shop: session.shop, sessionId: session.id, type: "REVIEW", name: "Loox Review Written" } });
const customerWith = async (where) => (await prisma.customer.findFirst({ where }))?.id;
const heldCustomer = await prisma.referral.findFirst({ where: { status: "REJECTED" } });
const cases = [
    ["Dashboard", "layout/dashboard/route.jsx", "/app/dashboard"],
    ["Customers list", "layout/customers/index/route.jsx", "/app/customers"],
    ["Customer: rewarded referrer", "layout/customers/$id/route.jsx", `/app/customers/${await customerWith({ points: { gt: 0 }, referralsSent: { some: { status: "USED" } } })}`, { id: String(await customerWith({ points: { gt: 0 }, referralsSent: { some: { status: "USED" } } })) }],
    ["Customer: rejected referrer", "layout/customers/$id/route.jsx", "/c", { id: String(heldCustomer?.referrerId) }],
    ["Customer: negative balance", "layout/customers/$id/route.jsx", "/c", { id: String(await customerWith({ points: { lt: 0 } })) }],
    ["Customer: scheduled reset", "layout/customers/$id/route.jsx", "/c", { id: String(await customerWith({ subscriptionCancelEvents: { some: { skipReason: "RESUBSCRIBED" } } })) }],
    ["Subscription cancellations", "layout/subscription-cancellations/route.jsx", "/app/subscription-cancellations"],
    ["Subscription cancellations (needs action)", "layout/subscription-cancellations/route.jsx", "/app/subscription-cancellations?status=NEEDS_ACTION"],
    ["Points rules", "layout/points-rules/index/route.jsx", "/app/points-rules"],
    ["Order rule", "layout/points-rules/order/route.jsx", "/app/points-rules/order"],
    ["Referral rule", "layout/points-rules/referral/route.jsx", "/app/points-rules/referral"],
    ["Review rule", "layout/points-rules/review/route.jsx", "/app/points-rules/review"],
    ["Reward rules", "layout/rewards-rules/route.jsx", "/app/rewards-rules"],
    ["Physical prize rules", "layout/physical-prizes-rules/route.jsx", "/app/physical-prizes-rules"],
    ["Prize claims", "layout/physical-prizes-claims-manage/route.jsx", "/app/physical-prizes-claims-manage"],
    ["Points events", "layout/points-events/route.jsx", "/app/points-events"],
    ["Review setup", "layout/loox-setup/route.jsx", "/app/loox-setup"],
    ["Setup guide", "layout/setup-guide/route.jsx", "/app/setup-guide"],
    ["Backfill rules", "dev-config/shadow-rules/route.jsx", "/app/points-backfill-rules"],
    ["Backfill", "dev-config/points-backfill/route.jsx", "/app/points-backfill"],
];
await suite("Every admin page renders with its real loader", async () => {
    for (const [name, file, urlPath, params = {}] of cases) {
        try {
            const mod = await load(file);
            const request = new Request(`http://localhost${urlPath.startsWith("/c") ? "/page" : urlPath}`);
            const data = await mod.loader({ request, params, context: {} });
            const payload = data instanceof Response ? await data.json() : data;
            const html = await render(mod.default, payload, new URL(request.url).pathname);
            check(`${name}: renders`, () => html.length > 200);
            sane(name, html);
            check(`${name}: no hardcoded "$"`, () => !/>[^<]*[^A\w]\$[0-9]/.test(clean(html)) && !/>\$</.test(clean(html)));
        } catch (err) {
            const detail = err instanceof Response ? `Response ${err.status}` : (err?.stack ?? err?.message ?? String(err)).split("\n").slice(0, 3).join(" | ");
            check(`${name}: renders — ${detail}`, () => false);
        }
    }
});

await vite.close();
await prisma.$disconnect();
process.exit(report() ? 0 : 1);

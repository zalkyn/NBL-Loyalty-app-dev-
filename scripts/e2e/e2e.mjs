/**
 * End-to-end run of the real background jobs and admin server functions against
 * a THROWAWAY database, with a fake Shopify. Nothing is mocked inside the app:
 * the real runOrderPaidJob / runSubscriptionCancelledJob / runOrderReversalJob
 * pick real Job rows, run the real handlers and write real rows; only the
 * Shopify GraphQL client is replaced (scripts/e2e/hooks.mjs, stub-shopify.mjs).
 *
 *   DATABASE_URL=postgresql://postgres@localhost:5432/nbl-e2e \
 *     node --import ./scripts/e2e/register.mjs scripts/e2e/e2e.mjs
 *
 * Refuses to run unless the database name ends in "e2e".
 */
import { suite, check, checkEqual, report } from "../test/lib/assert.js";

// boolean assertion on top of the harness's function-based check()
const ok = (name, cond) => check(name, () => Boolean(cond));

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url) || !/e2e$/.test(url.split("?")[0])) {
    console.error("Refusing to run: DATABASE_URL must be a local database whose name ends in 'e2e'.");
    process.exit(1);
}

const { default: prisma } = await import("../../app/db.server.js");
const { runOrderPaidJob } = await import("../../server/jobs/orderPaidJob.js");
const { runOrderReversalJob } = await import("../../server/jobs/orderReversalJob.js");
const { runSubscriptionCancelledJob } = await import("../../server/jobs/subscriptionCancelledJob.js");
const { updateSubscriptionCancelResetSettings } = await import("../../app/controller/appSettings/subscriptionCancelResetSettings.js");
const { handleDecide } = await import("../../app/layout/referral-reviews/_data.server.js");
const { loadReviews } = await import("../../app/layout/referral-reviews/_data.server.js");
const { loadHealthData, retryFailedOrderJobs } = await import("../../app/layout/health/_health.server.js");
const { loadHealthDetails } = await import("../../app/layout/health/_details.server.js");
const { handleAdjustPoints } = await import("../../app/layout/customers/$id/_action.server.js");
const { handleResetPoints, handleRestorePoints } = await import("../../app/layout/subscription-cancellations/_data.server.js");
const { loadSettingsOverview } = await import("../../app/layout/settings/_settings.server.js");

const SHOP = "e2e-shop.myshopify.com";
const GID = (type, id) => `gid://shopify/${type}/${id}`;
let seq = 1000;

// ── Fake Shopify ───────────────────────────────────────────────────────────
const world = { orders: {}, addresses: {}, refunds: {} };
const reply = (data) => ({ json: async () => ({ data }) });
globalThis.__fakeAdmin = {
    graphql: async (query, opts) => {
        const v = opts?.variables ?? {};
        if (/GetOrderWithAppstle/.test(query)) return reply({ order: world.orders[v.id] ?? null });
        if (/ReferralAddresses/.test(query)) {
            const a = (id) => ({ defaultAddress: world.addresses[id] ?? null });
            const o = world.orders[v.order];
            return reply({ referrer: a(v.referrer), referred: a(v.referred), order: { billingAddress: o?.billing ?? null, shippingAddress: o?.shipping ?? null } });
        }
        if (/RefundInShopCurrency/.test(query)) return reply({ refund: world.refunds[v.id] ?? null });
        if (/ShopDetails/.test(query)) {
            return reply({ shop: { name: "E2E Shop", myshopifyDomain: SHOP, primaryDomain: { url: "https://e2e.example.com" }, currencyCode: "AUD", ianaTimezone: "Australia/Sydney", enabledPresentmentCurrencies: ["AUD", "USD"] } });
        }
        return reply({}); // metafield syncs etc.: accepted, nothing to return
    },
};

// ── Data helpers ───────────────────────────────────────────────────────────
const addr = (street, zip = "2000") => ({ address1: street, address2: null, city: "Sydney", zip, countryCodeV2: "AU" });

async function newCustomer(first, last, extra = {}) {
    const n = ++seq;
    return prisma.customer.create({
        data: {
            shopifyId: GID("Customer", n), firstName: first, lastName: last, name: `${first} ${last}`,
            email: `c${n}@e2e.test`, referralCode: `E2E${n}`, sessionId: session.id, orders: 0, ...extra,
        },
    });
}

function addOrder({ customer, items, codes = [], metafield = null, billing = null, sellingPlan = false }) {
    const id = GID("Order", ++seq);
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    world.orders[id] = {
        id, name: `#${seq}`, orderNumber: seq, discountCodes: codes, cancelledAt: null,
        currentTotalPriceSet: { shopMoney: { amount: String(total) } },
        lineItems: { edges: items.map((i) => ({ node: { quantity: i.qty, originalUnitPriceSet: { shopMoney: { amount: String(i.price) } }, product: { id: GID("Product", i.product ?? 1) }, sellingPlan: sellingPlan ? { sellingPlanId: "1" } : null } })) },
        appstle_subscription: metafield ? { value: metafield } : null,
        billing, shipping: billing,
    };
    return { id, customerGid: customer.shopifyId, total };
}

const enqueuePaid = (o, key = `paid:${o.id}`) =>
    prisma.job.create({ data: { type: "ORDER_PAID", shop: SHOP, status: "PENDING", idempotencyKey: key, payload: { orderId: o.id, customerId: o.customerGid } } });

const points = async (c) => (await prisma.customer.findUnique({ where: { id: c.id } })).points;
const txs = (c, where = {}) => prisma.transaction.findMany({ where: { customerId: c.id, ...where }, orderBy: { id: "asc" } });
const notices = (c, notice) => prisma.transaction.findMany({ where: { customerId: c.id, metadata: { path: ["notice"], equals: notice } } });

// ── Setup ──────────────────────────────────────────────────────────────────
const wipe = async () => {
    await prisma.job.deleteMany({});
    await prisma.subscriptionCancelEvent.deleteMany({});
    await prisma.customer.deleteMany({});
    await prisma.session.deleteMany({});
};
await wipe();
const session = await prisma.session.create({ data: { id: "e2e-session", shop: SHOP, state: "x", accessToken: "x", isOnline: false } });
const orderEvent = await prisma.event.create({ data: { shop: SHOP, sessionId: session.id, type: "ORDER", name: "Direct Purchase" } });
const refEvent = await prisma.event.create({ data: { shop: SHOP, sessionId: session.id, type: "REFERRAL", name: "Refer a Friend" } });
const orderRule = await prisma.pointsRule.create({
    data: { sessionId: session.id, eventId: orderEvent.id, name: "Order", isActive: true, conditions: { order: { trigger: "all", type: "incremental", rate: { amount: 1, points: 20 }, groups: [], excludedProducts: [], intervals: [] } } },
});
const referralConditions = (trigger) => ({
    referral: {
        trigger,
        referrer: { points: 2500, allowRenewalReward: true, renewalPoints: 200 },
        referred: { points: 1000, allowRenewalReward: true, renewalPoints: 100, discountType: "fixed", discountValue: 20 },
        groups: [], intervals: [],
    },
});
const refRule = await prisma.pointsRule.create({ data: { sessionId: session.id, eventId: refEvent.id, name: "Referral", isActive: true, conditions: referralConditions("both") } });

const runPaid = async () => { await runOrderPaidJob(); };

// ═══════════════════════════════════════════════════════════════════════════
await suite("Order points", async () => {
    const c = await newCustomer("Mia", "Lee");
    const o = addOrder({ customer: c, items: [{ price: 12.5, qty: 2 }] });
    await enqueuePaid(o);
    await runPaid();
    await checkEqual("$25 order at 20 pts/$1 earns 500", await points(c), 500);
    const job = await prisma.job.findFirst({ where: { idempotencyKey: `paid:${o.id}` } });
    checkEqual("job completed", job.status, "COMPLETED");
    const earn = (await txs(c, { type: "EARN" }))[0];
    checkEqual("earn records the order total", earn?.metadata?.orderTotal, "25");

    // Same order delivered again under a different key (webhook redelivery / manual retry)
    await enqueuePaid(o, `paid-again:${o.id}`);
    await runPaid();
    await checkEqual("replaying the same order does not pay twice", await points(c), 500);
    checkEqual("only one earn exists", (await txs(c, { type: "EARN" })).length, 1);

    // Partial refund in store currency: $12.50 of $25 → half of the points
    const refundId = ++seq;
    await prisma.job.create({ data: { type: "ORDER_REVERSED", shop: SHOP, status: "PENDING", idempotencyKey: `refund:${refundId}`, payload: { orderId: o.id, reversalType: "REFUND", refundId, refundAmount: 12.5, refundCurrency: null } } });
    await runOrderReversalJob();
    await checkEqual("half refund takes back 250", await points(c), 250);

    // Full cancel afterwards takes only what is left
    await prisma.job.create({ data: { type: "ORDER_REVERSED", shop: SHOP, status: "PENDING", idempotencyKey: `cancel:${o.id}`, payload: { orderId: o.id, reversalType: "CANCEL" } } });
    await runOrderReversalJob();
    await checkEqual("cancel takes the remainder, never twice", await points(c), 0);
});

await suite("Refund in another currency", async () => {
    const c = await newCustomer("Cur", "Rency");
    const o = addOrder({ customer: c, items: [{ price: 50, qty: 2 }] }); // $100 → 2000 pts
    await enqueuePaid(o); await runPaid();
    await checkEqual("earned 2000", await points(c), 2000);
    const refundId = ++seq;
    // Customer paid in USD: webhook says 15.00 USD, Shopify says that is 25.00 AUD of a 100 AUD order.
    world.refunds[GID("Refund", refundId)] = { totalRefundedSet: { shopMoney: { amount: "25.0", currencyCode: "AUD" } }, order: { currencyCode: "AUD" } };
    await prisma.job.create({ data: { type: "ORDER_REVERSED", shop: SHOP, status: "PENDING", idempotencyKey: `refund:${refundId}`, payload: { orderId: o.id, reversalType: "REFUND", refundId, refundAmount: 15, refundCurrency: "USD" } } });
    await runOrderReversalJob();
    await checkEqual("25% of the order in shop currency → 500 taken back (not 15%)", await points(c), 1500);
});

await suite("Subscription order before Appstle details arrive", async () => {
    const c = await newCustomer("Sub", "Early");
    const o = addOrder({ customer: c, items: [{ price: 40, qty: 1 }], sellingPlan: true });
    const job = await enqueuePaid(o);
    await runPaid();
    let j = await prisma.job.findUnique({ where: { id: job.id } });
    checkEqual("first attempt is retried, not completed", j.status, "PENDING");
    ok("with the Appstle reason recorded", /APPSTLE_METAFIELD_PENDING/.test(j.lastError ?? ""));
    await checkEqual("no points yet", await points(c), 0);
    checkEqual("order count not incremented by the failed attempt", (await prisma.customer.findUnique({ where: { id: c.id } })).orders, 0);

    // Appstle attaches its details, job retried
    world.orders[o.id].appstle_subscription = { value: { subscriptionContract: { id: "C1", sellingPlanIds: [], subscriptionLineItemList: [] } } };
    await prisma.job.update({ where: { id: job.id }, data: { runAt: new Date() } });
    await runPaid();
    j = await prisma.job.findUnique({ where: { id: job.id } });
    checkEqual("completes once details are there", j.status, "COMPLETED");
    await checkEqual("$40 → 800 points", await points(c), 800);
    checkEqual("order counted once", (await prisma.customer.findUnique({ where: { id: c.id } })).orders, 1);
    ok("earn is tagged as a subscription order", (await txs(c, { type: "EARN" }))[0]?.metadata?.subscription === true);

    // Last attempt with details still missing falls back (other subscription apps)
    const c2 = await newCustomer("Sub", "Late");
    const o2 = addOrder({ customer: c2, items: [{ price: 10, qty: 1 }], sellingPlan: true });
    const j2 = await enqueuePaid(o2);
    await prisma.job.update({ where: { id: j2.id }, data: { attempts: 2, maxAttempts: 3 } });
    await runPaid();
    checkEqual("last attempt is processed, not stuck", (await prisma.job.findUnique({ where: { id: j2.id } })).status, "COMPLETED");
    await checkEqual("and earns as a one-time order", await points(c2), 200);
});

// ── Referrals ──────────────────────────────────────────────────────────────
async function referralPair(refFirst, refLast, friendFirst, friendLast, { referrerAddr, friendAddr }) {
    const referrer = await newCustomer(refFirst, refLast);
    const friend = await newCustomer(friendFirst, friendLast);
    world.addresses[referrer.shopifyId] = referrerAddr;
    const code = `REF${++seq}`;
    const referral = await prisma.referral.create({ data: { referrerId: referrer.id, referredId: friend.id, discountCode: code, status: "ACTIVE" } });
    await prisma.reward.create({ data: { customerId: friend.id, event: "REFERRAL", type: "FIRST", title: "Referral discount", code, status: "ACTIVE", rewardKey: `k${seq}` } });
    const o = addOrder({ customer: friend, items: [{ price: 50, qty: 1 }], codes: [code], billing: friendAddr });
    return { referrer, friend, referral, order: o, code };
}

await suite("Referral: different people are paid straight away", async () => {
    const p = await referralPair("Sam", "Rivera", "Alex", "Chen", { referrerAddr: addr("1 George St"), friendAddr: addr("99 Pitt St", "2001") });
    await enqueuePaid(p.order); await runPaid();
    const r = await prisma.referral.findUnique({ where: { id: p.referral.id } });
    checkEqual("referral used and rewarded", [r.status, r.rewardGiven], ["USED", true]);
    await checkEqual("referrer gets 2,500", (await points(p.referrer)), 2500);
    await checkEqual("friend gets their 1,000 bonus", await points(p.friend), 1000);
    const reward = await prisma.reward.findFirst({ where: { code: p.code } });
    checkEqual("friend's voucher marked used", [reward.status, reward.discountUsed], ["USED", true]);
    await enqueuePaid(p.order, `again:${p.order.id}`); await runPaid();
    await checkEqual("redelivery pays nothing extra to referrer", await points(p.referrer), 2500);
});

await suite("Referral: held → approve", async () => {
    const p = await referralPair("Noah", "Young", "Young", "Noah", { referrerAddr: addr("5 Oak Ave"), friendAddr: addr("5 Oak Avenue") });
    await enqueuePaid(p.order); await runPaid();
    const held = await prisma.referral.findUnique({ where: { id: p.referral.id } });
    checkEqual("same name reversed + same address → HELD", held.status, "HELD");
    await checkEqual("referrer has no referral points yet", await points(p.referrer), 0);
    checkEqual("referrer is told it is being reviewed", (await notices(p.referrer, "HELD_REFERRER")).length, 1);
    checkEqual("friend is told too", (await notices(p.friend, "HELD_REFERRED")).length, 1);
    ok("hold reason recorded", Boolean(held.metadata?.hold?.reason));

    const list = await loadReviews(session, new URLSearchParams("tab=waiting"));
    checkEqual("shows on the Waiting tab", list.rows.some((x) => x.id === p.referral.id), true);

    const fd = new FormData(); fd.set("referralIds", String(p.referral.id));
    const res = await handleDecide({ formData: fd, session, admin: globalThis.__fakeAdmin }, "approve");
    checkEqual("approve succeeds", res.status, "success");
    await checkEqual("referrer is paid 2,500", await points(p.referrer), 2500);
    const after = await prisma.referral.findUnique({ where: { id: p.referral.id } });
    checkEqual("status USED, reward given", [after.status, after.rewardGiven], ["USED", true]);
    ok("approval recorded", Boolean(after.metadata?.approval));
    const res2 = await handleDecide({ formData: fd, session, admin: globalThis.__fakeAdmin }, "approve");
    checkEqual("a second approve does nothing", res2.status, "error");
    await checkEqual("and pays nothing more", await points(p.referrer), 2500);

    // Renewal keeps the approval record
    const list2 = await loadReviews(session, new URLSearchParams("tab=flagged"));
    checkEqual("approved referral listed under Rewarded, flagged", list2.rows.some((x) => x.id === p.referral.id), true);
});

await suite("Referral: held → reject", async () => {
    const p = await referralPair("Kim", "Park", "Park", "Kim", { referrerAddr: addr("7 Elm Rd"), friendAddr: addr("7 Elm Road") });
    await enqueuePaid(p.order); await runPaid();
    const fd = new FormData(); fd.set("referralIds", String(p.referral.id));
    const res = await handleDecide({ formData: fd, session, admin: globalThis.__fakeAdmin }, "reject");
    checkEqual("reject succeeds", res.status, "success");
    const r = await prisma.referral.findUnique({ where: { id: p.referral.id } });
    checkEqual("status REJECTED", r.status, "REJECTED");
    await checkEqual("referrer earns nothing", await points(p.referrer), 0);
    ok("referrer told it was not approved", (await notices(p.referrer, "REJECTED")).length === 1);
});

await suite("Referral: same name alone is paid and flagged; surname alone is clear", async () => {
    const p = await referralPair("Jo", "Park", "Jo", "Park", { referrerAddr: addr("1 A St"), friendAddr: addr("50 Totally Different Rd", "3000") });
    await enqueuePaid(p.order); await runPaid();
    const r = await prisma.referral.findUnique({ where: { id: p.referral.id } });
    checkEqual("paid", [r.status, r.rewardGiven], ["USED", true]);
    ok("flag recorded", Boolean(r.metadata?.reviewFlag));
    await checkEqual("referrer paid", await points(p.referrer), 2500);

    const q = await referralPair("Jo", "Park", "Lee", "Park", { referrerAddr: addr("1 A St"), friendAddr: addr("50 Totally Different Rd", "3000") });
    await enqueuePaid(q.order); await runPaid();
    const rq = await prisma.referral.findUnique({ where: { id: q.referral.id } });
    checkEqual("surname alone: paid, not held", [rq.status, rq.rewardGiven], ["USED", true]);
    ok("surname alone: no flag", !rq.metadata?.reviewFlag);
});

await suite("Referral: rule does not fit the order", async () => {
    await prisma.pointsRule.update({ where: { id: refRule.id }, data: { conditions: referralConditions("subscription") } });
    const p = await referralPair("Tess", "Hall", "Rob", "Moss", { referrerAddr: addr("1 B St"), friendAddr: addr("2 C St", "3000") });
    await enqueuePaid(p.order); await runPaid();
    const r = await prisma.referral.findUnique({ where: { id: p.referral.id } });
    checkEqual("closed, no reward", [r.status, r.rewardGiven], ["USED", false]);
    ok("reason kept", Boolean(r.metadata?.skipped?.reason));
    checkEqual("referrer told why", (await notices(p.referrer, "SKIPPED_SUBSCRIPTION_ONLY")).length, 1);
    await checkEqual("referrer earns nothing", await points(p.referrer), 0);
    await prisma.pointsRule.update({ where: { id: refRule.id }, data: { conditions: referralConditions("both") } });
});

await suite("Referral: renewal pays once and keeps the approval record", async () => {
    const p = await referralPair("Ann", "Dunn", "Ben", "Dunn", { referrerAddr: addr("3 D St"), friendAddr: addr("3 D Street") });
    await enqueuePaid(p.order); await runPaid();
    const fd = new FormData(); fd.set("referralIds", String(p.referral.id));
    await handleDecide({ formData: fd, session, admin: globalThis.__fakeAdmin }, "approve");
    await prisma.referral.update({ where: { id: p.referral.id }, data: { subscriptionContractId: "C99" } });
    const contract = { id: "C99", currentCycle: 2, sellingPlanIds: [], subscriptionLineItemList: [] };
    const renewal = addOrder({ customer: p.friend, items: [{ price: 30, qty: 1 }], metafield: { subscriptionContract: contract } });
    const before = await points(p.referrer);
    await enqueuePaid(renewal); await runPaid();
    await checkEqual("referrer earns 200 for the renewal", (await points(p.referrer)) - before, 200);
    await enqueuePaid(renewal, `again:${renewal.id}`); await runPaid();
    await checkEqual("repeat delivery adds nothing", (await points(p.referrer)) - before, 200);
    const r = await prisma.referral.findUnique({ where: { id: p.referral.id } });
    ok("approval record survived the renewal", Boolean(r.metadata?.approval));
});

// ── Subscription cancellations ────────────────────────────────────────────
const cancelPayload = (customer, { nextBillingDate, svix = `svix-${++seq}` }) => ({
    svixId: svix,
    raw: { data: { id: GID("SubscriptionContract", ++seq), status: "CANCELLED", customer: { id: customer.shopifyId, email: customer.email, displayName: customer.name }, nextBillingDate, updatedAt: new Date().toISOString() } },
});
const runCancel = async () => { await runSubscriptionCancelledJob(); };
const enqueueCancel = (payload) => prisma.job.create({ data: { type: "SUBSCRIPTION_CANCELLED", shop: SHOP, status: "PENDING", idempotencyKey: payload.svixId, payload } });
const cancelEvent = (svixId) => prisma.subscriptionCancelEvent.findUnique({ where: { svixId } });
const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();

await suite("Subscription cancel: immediate", async () => {
    await updateSubscriptionCancelResetSettings({ shop: SHOP, sessionId: session.id, enabled: true, manualResetMode: "FULL_BALANCE", resetTiming: "immediate" });
    const c = await newCustomer("Imm", "Ediate", { points: 4000, lifetimePoints: 4000 });
    const pl = cancelPayload(c, { nextBillingDate: inDays(300) });
    await enqueueCancel(pl); await runCancel();
    await checkEqual("balance reset to 0 at once", await points(c), 0);
    const cu = await prisma.customer.findUnique({ where: { id: c.id } });
    checkEqual("lifetime untouched", cu.lifetimePoints, 4000);
    checkEqual("event marked reset", (await cancelEvent(pl.svixId)).resetApplied, true);
});

await suite("Subscription cancel: when the paid period ends", async () => {
    await updateSubscriptionCancelResetSettings({ shop: SHOP, sessionId: session.id, enabled: true, manualResetMode: "FULL_BALANCE", resetTiming: "period_end" });

    // A: simply waits, then resets on the date
    const a = await newCustomer("Yearly", "Member", { points: 4000, lifetimePoints: 4000 });
    const pa = cancelPayload(a, { nextBillingDate: inDays(330) });
    await enqueueCancel(pa); await runCancel();
    await checkEqual("points kept after cancelling", await points(a), 4000);
    let ev = await cancelEvent(pa.svixId);
    checkEqual("event scheduled", [ev.resetApplied, ev.skipReason], [false, "WAITING_PERIOD_END"]);
    const due = await prisma.job.findFirst({ where: { idempotencyKey: `SUBSCRIPTION_RESET_DUE:${pa.svixId}` } });
    ok("a delayed job exists for the billing date", due && due.runAt.getTime() > Date.now() + 300 * 86400000);
    ok("customer told the date", (await notices(a, "RESET_SCHEDULED")).length === 1);
    await runCancel();
    await checkEqual("not reset before its date", await points(a), 4000);
    await prisma.job.update({ where: { id: due.id }, data: { runAt: new Date() } });
    await runCancel();
    await checkEqual("reset when the date arrives", await points(a), 0);
    ev = await cancelEvent(pa.svixId);
    checkEqual("event now reset", [ev.resetApplied, ev.skipReason], [true, null]);
    await prisma.job.create({ data: { type: "SUBSCRIPTION_CANCELLED", shop: SHOP, status: "PENDING", idempotencyKey: `dup-${seq++}`, payload: due.payload } });
    await runCancel();
    ok("running it again does not reset twice", (await prisma.transaction.count({ where: { customerId: a.id, type: "SUBSCRIPTION_CANCEL_RESET" } })) === 1);

    // B: re-subscribes (pays a subscription order that earns points) before the date
    const b = await newCustomer("Back", "Again", { points: 3000, lifetimePoints: 3000 });
    const pb = cancelPayload(b, { nextBillingDate: inDays(20) });
    await enqueueCancel(pb); await runCancel();
    const o = addOrder({ customer: b, items: [{ price: 10, qty: 1 }], sellingPlan: true, metafield: { subscriptionContract: { id: "C5", sellingPlanIds: [], subscriptionLineItemList: [] } } });
    await new Promise((r) => setTimeout(r, 20));
    await enqueuePaid(o); await runPaid();
    const dueB = await prisma.job.findFirst({ where: { idempotencyKey: `SUBSCRIPTION_RESET_DUE:${pb.svixId}` } });
    await prisma.job.update({ where: { id: dueB.id }, data: { runAt: new Date() } });
    await runCancel();
    await checkEqual("points kept for a customer who came back", await points(b), 3200);
    checkEqual("shown as RESUBSCRIBED", (await cancelEvent(pb.svixId)).skipReason, "RESUBSCRIBED");

    // C: billing date missing → reset straight away (old behaviour)
    const c = await newCustomer("No", "Date", { points: 500, lifetimePoints: 500 });
    const pc = cancelPayload(c, { nextBillingDate: null });
    await enqueueCancel(pc); await runCancel();
    await checkEqual("no billing date → reset now", await points(c), 0);

    // D: debt is never forgiven
    const d = await newCustomer("In", "Debt", { points: -200, lifetimePoints: 0 });
    const pd = cancelPayload(d, { nextBillingDate: inDays(10) });
    await enqueueCancel(pd); await runCancel();
    await checkEqual("negative balance untouched", await points(d), -200);
    checkEqual("recorded as NEGATIVE_BALANCE", (await cancelEvent(pd.svixId)).skipReason, "NEGATIVE_BALANCE");
});

await suite("Subscription cancel: switched off", async () => {
    await updateSubscriptionCancelResetSettings({ shop: SHOP, sessionId: session.id, enabled: false, manualResetMode: "FULL_BALANCE", resetTiming: "immediate" });
    const c = await newCustomer("Off", "Switch", { points: 900, lifetimePoints: 900 });
    const p = cancelPayload(c, { nextBillingDate: inDays(5) });
    await enqueueCancel(p); await runCancel();
    await checkEqual("nothing reset", await points(c), 900);
    checkEqual("recorded as FEATURE_DISABLED", (await cancelEvent(p.svixId)).skipReason, "FEATURE_DISABLED");
});

// ── Admin pages' server functions ─────────────────────────────────────────
await suite("Program Health, retry and Settings overview", async () => {
    const stuckCustomer = await newCustomer("Fail", "Order");
    const o = addOrder({ customer: stuckCustomer, items: [{ price: 5, qty: 1 }] });
    const failed = await prisma.job.create({ data: { type: "ORDER_PAID", shop: SHOP, status: "FAILED", idempotencyKey: `failed:${o.id}`, attempts: 3, lastError: "fetch failed: ECONNRESET", failedAt: new Date(), payload: { orderId: o.id, customerId: stuckCustomer.shopifyId } } });

    const health = await loadHealthData(session);
    checkEqual("failed order counted", health.jobs.failed, 1);
    const details = await loadHealthDetails(session);
    ok("details loaded", details !== null);
    checkEqual("failed list explains the reason", details.failed[0]?.reason, "A network problem interrupted it.");
    checkEqual("failed list has the order number", details.failed[0]?.orderNumber, o.id.split("/").pop());
    ok("orders processed counted", details.orders.processed30d >= 5);
    checkEqual("held referrals counted", typeof details.referralsHeld, "number");
    ok("negative balance customer counted", details.customers.negativeBalances >= 1);
    ok("scheduled/reset subscription counts present", details.subscriptions.reset30d >= 1);

    const n = await retryFailedOrderJobs(session);
    checkEqual("retry re-queues the failed order", n, 1);
    await runPaid();
    await checkEqual("and it is paid, once", await points(stuckCustomer), 100);
    checkEqual("job completed", (await prisma.job.findUnique({ where: { id: failed.id } })).status, "COMPLETED");
    checkEqual("nothing left to retry", await retryFailedOrderJobs(session), 0);

    // A referral whose friend used the code but whose referrer was never paid
    const sRef = await newCustomer("Stuck", "Referrer");
    const sFriend = await newCustomer("Stuck", "Friend");
    await prisma.referral.create({ data: { referrerId: sRef.id, referredId: sFriend.id, discountCode: "STUCK-CODE", status: "ACTIVE", discountUsed: false } });
    await prisma.reward.create({ data: { customerId: sFriend.id, event: "REFERRAL", type: "FIRST", title: "Referral discount", code: "STUCK-CODE", status: "USED", rewardKey: `stuck${Date.now()}` } });
    const d2 = await loadHealthDetails(session);
    checkEqual("stuck referral listed with both people", [d2.stuck[0]?.referrer, d2.stuck[0]?.friend], ["Stuck Referrer", "Stuck Friend"]);
    checkEqual("stuck list matches the banner count", d2.stuck.length, (await loadHealthData(session)).referral.stuck);
    checkEqual("failed total present", typeof d2.failedTotal, "number");

    // A referral rule that is switched off must read "off", not "missing"
    await prisma.pointsRule.update({ where: { id: refRule.id }, data: { isActive: false } });
    checkEqual("switched-off referral rule is reported as off", (await loadHealthData(session)).referral.ruleActive, false);
    checkEqual("checklist says off", (await loadHealthDetails(session)).checklist.referralRule, "off");
    await prisma.pointsRule.update({ where: { id: refRule.id }, data: { isActive: true } });
    checkEqual("and on again", (await loadHealthData(session)).referral.ruleActive, true);
    await prisma.referral.deleteMany({ where: { discountCode: "STUCK-CODE" } });

    const settings = await loadSettingsOverview(session, globalThis.__fakeAdmin);
    checkEqual("order rule on", settings.orderActive, true);
    checkEqual("referral rule on", settings.referralActive, true);
    checkEqual("store details read", settings.store?.currencyCode, "AUD");
    checkEqual("cancellation setting read", settings.cancel?.enabled, false);
});

await suite("Admin actions: Adjust Points, Reset Now, Restore Points", async () => {
    const run = (fn, fields) => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.set(k, String(v)); return fn({ formData: fd, session, admin: globalThis.__fakeAdmin }); };
    const c = await newCustomer("Adj", "Ust", { points: 1000, lifetimePoints: 1000 });
    let res = await run(handleAdjustPoints, { customerId: c.id, shopifyId: c.shopifyId, mode: "add", amount: 500, reason: "Goodwill gesture" });
    checkEqual("add 500 succeeds", [res.status, res.balanceAfter], ["success", 1500]);
    res = await run(handleAdjustPoints, { customerId: c.id, shopifyId: c.shopifyId, mode: "remove", amount: 300 });
    checkEqual("remove 300 succeeds", [res.status, res.balanceAfter], ["success", 1200]);
    res = await run(handleAdjustPoints, { customerId: c.id, shopifyId: c.shopifyId, mode: "add", amount: 0 });
    checkEqual("zero is refused", res.status, "error");
    const tx = (await txs(c, { type: "ADJUST" }));
    checkEqual("history records both with the reason", [tx.length, tx[0].reason], [2, "Goodwill gesture"]);

    // The earlier "switched off" cancellation left a row waiting for the merchant
    const waiting = await prisma.subscriptionCancelEvent.findFirst({ where: { skipReason: "FEATURE_DISABLED" } });
    const who = await prisma.customer.findUnique({ where: { id: waiting.customerId } });
    res = await run(handleResetPoints, { eventId: waiting.id });
    checkEqual("Reset Now succeeds", res.status, "success");
    await checkEqual("balance is 0", await points(who), 0);
    res = await run(handleRestorePoints, { eventId: waiting.id, amount: 400 });
    checkEqual("Restore 400 succeeds", res.status, "success");
    await checkEqual("balance is 400", await points(who), 400);
    res = await run(handleRestorePoints, { eventId: waiting.id, amount: 900 });
    checkEqual("cannot restore more than was removed", res.status, "error");
    await checkEqual("balance unchanged", await points(who), 400);
    res = await run(handleResetPoints, { eventId: waiting.id });
    checkEqual("a second Reset Now on the same row is refused", res.status, "error");
});

if (!process.argv.includes("--keep")) await wipe();
await prisma.$disconnect();
process.exit(report() ? 0 : 1);

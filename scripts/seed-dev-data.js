#!/usr/bin/env node
/**
 * @file scripts/seed-dev-data.js
 * @description Adds ~30 days of realistic test data to the LOCAL dev database
 * so every dashboard card, banner, chart and the Referral Reviews page has
 * something to show.
 *
 * Usage:
 *   node scripts/seed-dev-data.js           add the data (safe to re-run: cleans its own rows first)
 *   node scripts/seed-dev-data.js --clean   remove only the rows this script added
 *
 * Safety:
 *   - Reads DATABASE_URL from .env ONLY and refuses to run unless the host is
 *     localhost / 127.0.0.1. .env.production is never read.
 *   - Everything it creates is tagged (customer emails @seed.test, ids/keys
 *     starting SEED, job keys SEED:) so --clean removes exactly that and
 *     nothing else. Existing rows are never modified except that the seeded
 *     customers' own balances are set.
 *
 * What you get (all dated within the last 30 days):
 *   - 60 customers, ~400 transactions (earn / redeem / adjust / backfill /
 *     reversal) and 15 redeemed vouchers  → dashboard charts and stat cards
 *   - Referrals in every state → Referral Reviews page + dashboard banners:
 *       rewarded, rewarded+flagged, approved after hold, skipped by rule,
 *       HELD (2), REJECTED, "discount used but reward never recorded" (2),
 *       and unused ACTIVE ones
 *   - Failed / retrying ORDER_PAID jobs → critical and info banners
 *   - A backfill rule in EUR → currency-mismatch warning (while the shop is not EUR)
 *   - Unseen 0-point referral notices and earn rows → widget toasts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { PrismaClient } = createRequire(path.join(root, "package.json"))("@prisma/client");

const env = fs.readFileSync(path.join(root, ".env"), "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!url || !/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    console.error("Refusing to run: .env DATABASE_URL is not a localhost database.");
    process.exit(1);
}
const prisma = new PrismaClient({ datasourceUrl: url });

const TAG = "SEED";
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

// Deterministic pseudo-random so re-runs look the same.
let seed = 20261019;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const int = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (list) => list[int(0, list.length - 1)];
const daysAgo = (d, hour = int(8, 21)) => new Date(now - d * DAY + (hour - 12) * 3600 * 1000);

const FIRST = ["Ava", "Noah", "Mia", "Liam", "Zoe", "Ethan", "Ivy", "Lucas", "Ruby", "Jack", "Chloe", "Leo", "Grace", "Oscar", "Ella", "Henry", "Isla", "Max", "Lily", "Sam"];
const LAST = ["Nguyen", "Smith", "Patel", "Brown", "Kim", "Taylor", "Lopez", "Wilson", "Clarke", "Murphy", "Singh", "Walker", "Young", "King", "Scott"];

async function clean() {
    const customers = await prisma.customer.findMany({ where: { email: { endsWith: "@seed.test" } }, select: { id: true } });
    const ids = customers.map((c) => c.id);
    // Referrals/transactions/rewards cascade from Customer; jobs and the rule are separate.
    await prisma.customer.deleteMany({ where: { id: { in: ids } } });
    await prisma.job.deleteMany({ where: { idempotencyKey: { startsWith: `${TAG}:` } } });
    await prisma.shadowRule.deleteMany({ where: { name: { startsWith: `${TAG} ` } } });
    console.log(`Removed ${ids.length} seeded customers (and their transactions, rewards, referrals) plus seeded jobs/rules.`);
}

async function main() {
    await clean();
    if (process.argv.includes("--clean")) return;

    const session = await prisma.session.findFirst({ select: { id: true, shop: true } });
    if (!session) throw new Error("No Session row — install/open the app against this DB first.");
    const [orderRule, referralRule, rewardRules, events] = await Promise.all([
        prisma.pointsRule.findFirst({ where: { event: { type: "ORDER" } }, select: { id: true, eventId: true } }),
        prisma.pointsRule.findFirst({ where: { event: { type: "REFERRAL" } }, select: { id: true, eventId: true } }),
        prisma.rewardRule.findMany({ select: { id: true, rewardValue: true, pointsCost: true } }),
        prisma.event.findMany({ select: { id: true, type: true } }),
    ]);
    const orderEventId = orderRule?.eventId ?? events.find((e) => e.type === "ORDER")?.id ?? null;
    const referralEventId = referralRule?.eventId ?? events.find((e) => e.type === "REFERRAL")?.id ?? null;

    // ── Customers ─────────────────────────────────────────────────────────────
    const customers = [];
    for (let i = 0; i < 60; i++) {
        const firstName = FIRST[i % FIRST.length];
        const lastName = LAST[(i * 7) % LAST.length];
        // Two seeded pairs share/reverse a name so the review rows look like the real case.
        const swapped = i === 41; // referred side of pair 21 ↔ 41 is the reverse of 21
        const c = {
            firstName: swapped ? customers[21].lastName : firstName,
            lastName: swapped ? customers[21].firstName : lastName,
        };
        const created = await prisma.customer.create({
            data: {
                shopifyId: `gid://shopify/Customer/9${String(100000 + i)}`,
                firstName: c.firstName,
                lastName: c.lastName,
                name: `${c.firstName} ${c.lastName}`,
                email: `seed.customer${i}@seed.test`,
                referralCode: `${TAG}${String(1000 + i)}`,
                sessionId: session.id,
                createdAt: daysAgo(int(20, 29)),
                enrolledAt: daysAgo(int(20, 29)),
                orders: int(1, 6),
            },
        });
        customers.push({ ...created, balance: 0, lifetime: 0 });
    }

    // ── Transactions ──────────────────────────────────────────────────────────
    let txCount = 0;
    const addTx = async (c, { type, points, daysBack, reason, activity, metadata, eventId, pointsRuleId, referralId, rewardId, status = "COMPLETED", notified = true }) => {
        const delta = type === "REDEEM" ? -Math.abs(points) : points;
        c.balance = Math.max(0, c.balance + delta);
        if (delta > 0 && ["EARN", "BACKFILL", "ADJUST"].includes(type)) c.lifetime += delta;
        const createdAt = daysAgo(daysBack);
        await prisma.transaction.create({
            data: {
                customerId: c.id, type, points: delta, balanceAfter: c.balance, status, reason, activity,
                eventId: eventId ?? null, pointsRuleId: pointsRuleId ?? null,
                referralId: referralId ?? null, rewardId: rewardId ?? null,
                metadata: { seed: true, ...(metadata ?? {}) },
                createdAt, notifiedAt: notified ? createdAt : null,
            },
        });
        txCount++;
    };

    for (const c of customers) {
        const orders = int(2, 6);
        for (let o = 0; o < orders; o++) {
            const total = int(25, 180);
            const daysBack = int(1, 29);
            await addTx(c, {
                type: "EARN", points: total * 20, daysBack, eventId: orderEventId, pointsRuleId: orderRule?.id,
                reason: `Points earned for order #SEED${int(1000, 9999)}`, activity: `+${total * 20} points for order`,
                metadata: { orderId: `gid://shopify/Order/seed${int(100000, 999999)}`, orderTotal: String(total) },
                // The newest few stay unseen so the widget shows toasts.
                notified: daysBack > 2,
            });
        }
        if (rand() < 0.25) await addTx(c, { type: "ADJUST", points: pick([200, 500, -150]), daysBack: int(1, 25), reason: "Manual adjustment by admin", activity: "Points adjusted by the store" });
        if (rand() < 0.15) await addTx(c, { type: "BACKFILL", points: int(300, 1200), daysBack: int(10, 28), reason: "Points backfill", activity: "Points added for past purchases" });
        if (rand() < 0.1) await addTx(c, { type: "REVERSAL", points: -int(100, 600), daysBack: int(1, 20), reason: "Order refunded", activity: "Points removed for a refunded order" });
    }

    // ── Redeemed vouchers ─────────────────────────────────────────────────────
    const redeemers = customers.slice(0, 15);
    let rewardCount = 0;
    for (const [i, c] of redeemers.entries()) {
        const rule = rewardRules[i % rewardRules.length];
        if (!rule) break;
        const daysBack = int(1, 26);
        const used = i % 3 === 0;
        const reward = await prisma.reward.create({
            data: {
                customerId: c.id, rewardRuleId: rule.id, rewardKey: `${TAG}:REDEEM:${c.id}:${i}`,
                event: "MANUAL", type: "DEFAULT", title: `Voucher ${rule.rewardValue}`, code: `${TAG}VCH${String(100 + i)}`,
                status: used ? "USED" : "ACTIVE", discountUsed: used, usedAt: used ? daysAgo(Math.max(0, daysBack - 1)) : null,
                pointsCost: rule.pointsCost, createdAt: daysAgo(daysBack), metadata: { seed: true },
            },
        });
        await addTx(c, {
            type: "REDEEM", points: rule.pointsCost, daysBack, rewardId: reward.id,
            reason: `${rule.pointsCost} points redeemed for a voucher`, activity: `-${rule.pointsCost} points for a voucher`,
        });
        rewardCount++;
    }

    // ── Referrals (every state) ───────────────────────────────────────────────
    // referrer = customers[i], referred = customers[i + 20]  (unique per referral)
    const referralSpecs = [
        { i: 0, state: "REWARDED", days: 24 }, { i: 1, state: "REWARDED", days: 21 }, { i: 2, state: "REWARDED", days: 18 },
        { i: 3, state: "REWARDED", days: 14 }, { i: 4, state: "REWARDED", days: 9 }, { i: 5, state: "REWARDED", days: 5 },
        { i: 6, state: "FLAGGED", days: 12 }, { i: 7, state: "FLAGGED", days: 4 },
        { i: 8, state: "APPROVED", days: 16 },
        { i: 9, state: "SKIPPED", days: 8 },
        { i: 10, state: "HELD", days: 3 }, { i: 11, state: "HELD", days: 1 },
        { i: 12, state: "REJECTED", days: 11 },
        { i: 13, state: "STUCK", days: 7 }, { i: 14, state: "STUCK", days: 2 },
        { i: 15, state: "UNUSED", days: 6 }, { i: 16, state: "UNUSED", days: 3 },
        // Pair 21 ↔ 41: reversed names — the real-world case, held.
        { i: 21, referred: 41, state: "HELD", days: 1 },
    ];

    const orderGid = (n) => `gid://shopify/Order/seedref${n}`;
    let refN = 0;
    for (const spec of referralSpecs) {
        refN++;
        const referrer = customers[spec.i];
        const referred = customers[spec.referred ?? spec.i + 20];
        const code = `${TAG}REF${String(refN).padStart(3, "0")}`;
        const gid = orderGid(refN);
        const orderLabel = `#SEED${5000 + refN}`;
        const used = !["UNUSED"].includes(spec.state);
        const when = spec.days;

        await prisma.reward.create({
            data: {
                customerId: referred.id, rewardKey: `${TAG}:REFCODE:${referred.id}:${refN}`, event: "REFERRAL", type: "DEFAULT",
                title: "Referral discount", code, status: used ? "USED" : "ACTIVE", discountUsed: used,
                usedAt: used ? daysAgo(when) : null, orderId: used ? gid : null, createdAt: daysAgo(when + 1), metadata: { seed: true },
            },
        });

        const hold = {
            heldAt: daysAgo(when).toISOString(), signals: ["same_name", "similar_address"],
            reason: "the two accounts have the same name (including reversed first/last name); the referred order's billing or shipping address is the same as, or very close to, the referrer's address",
            orderId: gid, orderLabel, orderTotal: "89.00", referrerPoints: 2500, referredPoints: 1000, subscriptionInterval: null,
        };
        const status = { REWARDED: "USED", FLAGGED: "USED", APPROVED: "USED", SKIPPED: "USED", HELD: "HELD", REJECTED: "REJECTED", STUCK: "ACTIVE", UNUSED: "ACTIVE" }[spec.state];
        const metadata = {
            seed: true,
            ...(spec.state === "FLAGGED" ? { reviewFlag: { signals: ["same_surname"], reason: "the two accounts share a surname", orderId: gid } } : {}),
            ...(spec.state === "APPROVED" ? { approval: { approvedAt: daysAgo(when).toISOString(), heldReason: hold.reason, signals: hold.signals } } : {}),
            ...(spec.state === "SKIPPED" ? { skipped: { reason: "rule is subscription orders only; order was one-time", at: daysAgo(when).toISOString(), orderId: gid } } : {}),
            ...(["HELD", "REJECTED"].includes(spec.state) ? { hold } : {}),
            ...(spec.state === "REJECTED" ? { rejection: { rejectedAt: daysAgo(when).toISOString() } } : {}),
        };

        const referral = await prisma.referral.create({
            data: {
                referrerId: referrer.id, referredId: referred.id, discountCode: code, status,
                discountUsed: ["REWARDED", "FLAGGED", "APPROVED", "SKIPPED", "HELD", "REJECTED"].includes(spec.state),
                rewardGiven: ["REWARDED", "FLAGGED", "APPROVED"].includes(spec.state),
                orderId: ["REWARDED", "FLAGGED", "APPROVED", "SKIPPED", "HELD", "REJECTED"].includes(spec.state) ? gid : null,
                createdAt: daysAgo(when + 1), metadata,
            },
        });

        const earned = ["REWARDED", "FLAGGED", "APPROVED"].includes(spec.state);
        if (earned) {
            await addTx(referrer, {
                type: "EARN", points: 2500, daysBack: when, eventId: referralEventId, referralId: referral.id,
                reason: `Referral reward — your friend placed their first order (${orderLabel})`, activity: "+2500 points for successful referral",
                metadata: { orderId: gid, orderTotal: "89.00" }, notified: when > 2,
            });
            await addTx(referred, {
                type: "EARN", points: 1000, daysBack: when, eventId: referralEventId, referralId: referral.id,
                reason: `Referral discount used on order ${orderLabel}`, activity: `+1000 points — referral discount applied on order ${orderLabel}`,
                metadata: { orderId: gid, orderTotal: "89.00" }, notified: when > 2,
            });
        }

        // Unseen 0-point notices (toasts) — same shape notifyReferralOutcome.js writes.
        const notice = async (c, key, reason, activity) =>
            addTx(c, { type: "EARN", points: 0, daysBack: Math.min(when, 2), referralId: referral.id, status: "PENDING", reason, activity, metadata: { notice: key, orderRef: gid }, notified: false });
        if (spec.state === "HELD") {
            await notice(referrer, "HELD_REFERRER", "Referral reward is being reviewed", "Your referral reward is being reviewed. We'll update you as soon as it's confirmed.");
            await notice(referred, "HELD_REFERRED", "Referral bonus is being reviewed", "Your referral discount was applied. Your referral bonus is being reviewed.");
        }
        if (spec.state === "REJECTED") await notice(referrer, "REJECTED", "Referral reward was not approved", "Your referral reward wasn't approved, so no points were added for this referral.");
        if (spec.state === "SKIPPED") await notice(referrer, "SKIPPED_SUBSCRIPTION_ONLY", "Referral reward doesn't apply to this order", "Your friend's first order wasn't a subscription order, so it doesn't qualify for the referral reward.");

    }

    // ── Jobs (banners) ────────────────────────────────────────────────────────
    const failedAt = new Date(now - 2 * DAY);
    for (const n of [1, 2]) {
        await prisma.job.create({
            data: {
                type: "ORDER_PAID", status: "FAILED", shop: session.shop, idempotencyKey: `${TAG}:failed:${n}`,
                payload: { orderId: `gid://shopify/Order/seedfail${n}`, customerId: customers[n].shopifyId },
                attempts: 3, maxAttempts: 3, lastError: "Referral points could not be recorded for customer 1 (referral 1)", failedAt,
            },
        });
    }
    await prisma.job.create({
        data: {
            type: "ORDER_PAID", status: "PENDING", shop: session.shop, idempotencyKey: `${TAG}:retry:1`,
            payload: { orderId: "gid://shopify/Order/seedretry1", customerId: customers[3].shopifyId },
            attempts: 1, maxAttempts: 3, lastError: "APPSTLE_METAFIELD_PENDING: order has a selling plan but Appstle details are not attached yet",
            runAt: new Date(now + 4 * 60 * 1000),
        },
    });

    // ── Backfill rule in a different currency ─────────────────────────────────
    await prisma.shadowRule.create({
        data: {
            name: `${TAG} backfill (EUR)`, description: "Seeded rule saved in EUR to show the currency-mismatch warning.",
            rateType: "PER_AMOUNT", perAmount: 1, pointsPerUnit: 10, currencyCode: "EUR", isActive: false, sessionId: session.id,
        },
    });

    // ── Final balances ────────────────────────────────────────────────────────
    for (const c of customers) {
        await prisma.customer.update({ where: { id: c.id }, data: { points: c.balance, lifetimePoints: c.lifetime } });
    }

    console.log(`Seeded: ${customers.length} customers, ${txCount} transactions, ${rewardCount} vouchers, ${referralSpecs.length} referrals, 3 jobs, 1 backfill rule.`);
    console.log("Remove it all later with:  node scripts/seed-dev-data.js --clean");
}

main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());

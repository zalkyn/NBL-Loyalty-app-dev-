#!/usr/bin/env node
/**
 * @file scripts/reports/past-points-review.mjs
 * @description READ-ONLY report for the client to review. Changes nothing.
 *
 * Lists two things that happened before points were counted on the amount
 * actually paid and referral rewards waited for the first full-price payment:
 *
 *   1. orders_paid_nothing.csv  — orders that cost A$0.00 but still earned points.
 *   2. referral_paid_on_promo.csv — referral rewards paid on a first order whose
 *      total was at or below a threshold (default 5), i.e. the A$1 promo order.
 *
 * Usage (set DATABASE_URL to the database you want to read):
 *   DATABASE_URL="postgresql://..." node scripts/reports/past-points-review.mjs [outDir] [--promo-max=5]
 *
 * Limits, so nobody over-reads it: an order's total is saved when the points
 * are earned, and it includes shipping and tax. So it finds orders that were
 * paid at exactly nothing, and promo-sized referral orders, but not an order
 * that was merely discounted (its list price was never saved).
 */

import fs from "node:fs";
import path from "node:path";

const { default: prisma } = await import("../../app/db.server.js");

const args = process.argv.slice(2);
const outDir = path.resolve(args.find((a) => !a.startsWith("--")) ?? "./past-points-review");
const promoMax = Number((args.find((a) => a.startsWith("--promo-max=")) ?? "--promo-max=5").split("=")[1]);
fs.mkdirSync(outDir, { recursive: true });

const csv = (rows, columns) =>
    [columns.join(","), ...rows.map((r) => columns.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");

const customerOf = { select: { name: true, email: true, shopifyId: true } };

// 1. Orders paid at nothing that still earned points (normal order earnings only)
const zero = await prisma.transaction.findMany({
    where: {
        type: "EARN",
        referralId: null,
        points: { gt: 0 },
        OR: ["0", "0.0", "0.00"].map((v) => ({ metadata: { path: ["orderTotal"], equals: v } })),
    },
    include: { customer: customerOf },
    orderBy: { createdAt: "asc" },
});
const zeroRows = zero.map((t) => ({
    date: t.createdAt.toISOString().slice(0, 10),
    order: t.metadata?.orderId ?? "",
    customer: t.customer?.name ?? "",
    email: t.customer?.email ?? "",
    order_total: t.metadata?.orderTotal ?? "",
    points_given: t.points,
    reason: t.reason ?? "",
}));
fs.writeFileSync(path.join(outDir, "orders_paid_nothing.csv"), csv(zeroRows, ["date", "order", "customer", "email", "order_total", "points_given", "reason"]));

// 2. Referral rewards paid on a first order (not renewals), small order total
const referral = await prisma.transaction.findMany({
    where: {
        type: "EARN",
        referralId: { not: null },
        points: { gt: 0 },
        OR: [
            { reason: { startsWith: "Referral reward — your friend placed their first order" } },
            { reason: { startsWith: "Referral discount used on order" } },
        ],
    },
    include: { customer: customerOf },
    orderBy: { createdAt: "asc" },
});
const promoRows = referral
    .filter((t) => Number(t.metadata?.orderTotal) <= promoMax)
    .map((t) => ({
        date: t.createdAt.toISOString().slice(0, 10),
        referral_id: t.referralId,
        order: t.metadata?.orderId ?? "",
        paid_to: t.customer?.name ?? "",
        email: t.customer?.email ?? "",
        order_total: t.metadata?.orderTotal ?? "",
        points_given: t.points,
    }));
fs.writeFileSync(path.join(outDir, "referral_paid_on_promo.csv"), csv(promoRows, ["date", "referral_id", "order", "paid_to", "email", "order_total", "points_given"]));

console.log(`orders paid nothing but earned points: ${zeroRows.length} (${zeroRows.reduce((n, r) => n + r.points_given, 0)} points)`);
console.log(`referral rewards paid on orders <= ${promoMax}: ${promoRows.length} (${promoRows.reduce((n, r) => n + r.points_given, 0)} points)`);
console.log(`files written to ${outDir}`);
await prisma.$disconnect();

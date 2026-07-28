/**
 * @file scripts/test/backfillIntegration.test.js
 * @description Integration test against a REAL database — creates a
 * throwaway test shop/session/customer/shadow rule, runs the exact same
 * pipeline pointsBackfillJob.js uses (normalizeSegmentMemberGid ->
 * computePoints ->
 * idempotent PointsBackfillEntry claim -> createTransaction), and verifies
 * the real DB constraints actually hold (the @@unique idempotency
 * guarantee, the Restrict FK on ShadowRule, createTransaction's silent-
 * null-on-FK-violation behavior) — not mocked, the genuine Postgres
 * behavior. Cleans up everything it creates, on both success and failure.
 *
 * SAFETY: refuses to run unless DATABASE_URL looks like a local database,
 * unless --allow-remote is explicitly passed. All test data is scoped
 * under a clearly-fake shop domain (TEST_SHOP below) so it can never
 * collide with real data even if this check is bypassed.
 */

import prisma from "../../app/db.server.js";
import createTransaction from "../../app/controller/transaction/createTransaction.js";
import { computePoints, currencyMatches } from "../../app/utils/backfill/computePoints.js";
import { normalizeSegmentMemberGid } from "../../app/utils/backfill/normalizeSegmentMemberGid.js";
import { suite, check, checkEqual } from "./lib/assert.js";

const TEST_SHOP = "test-shop-for-scripts.myshopify.com";
const TEST_SESSION_ID = "test-session-for-scripts";

function assertLocalDatabase() {
    const dbUrl = process.env.DATABASE_URL || "";
    const looksLocal = /localhost|127\.0\.0\.1|::1/.test(dbUrl);
    const allowRemote = process.argv.includes("--allow-remote");

    if (!looksLocal && !allowRemote) {
        console.error(
            "\n✘ Refusing to run — DATABASE_URL doesn't look like a local database.\n" +
            "  This test creates and deletes real rows. Pass --allow-remote if you really mean\n" +
            "  to run it against a remote DB (all data is scoped to a fake test shop and cleaned up).\n"
        );
        process.exit(1);
    }
}

/** Deletion order matters: Customer cascades to Transaction/PointsBackfillEntry,
 *  so it must go before ShadowRule (Restrict — would otherwise block on
 *  any leftover entries), which must go before Session (Restrict on Customer,
 *  but Customer is already gone by then). Job has no FK dependents here. */
async function cleanup() {
    await prisma.customer.deleteMany({ where: { session: { shop: TEST_SHOP } } });
    await prisma.shadowRule.deleteMany({ where: { session: { shop: TEST_SHOP } } });
    await prisma.job.deleteMany({ where: { shop: TEST_SHOP } });
    await prisma.session.deleteMany({ where: { shop: TEST_SHOP } });
}

export async function run() {
    assertLocalDatabase();

    // Clean slate first, in case a previous run crashed mid-way and left
    // test data behind.
    await cleanup();

    try {
        await suite("backfill integration (real local DB)", async () => {
            // ── Setup ──────────────────────────────────────────────────────
            const session = await prisma.session.create({
                data: {
                    id: TEST_SESSION_ID,
                    shop: TEST_SHOP,
                    state: "test",
                    isOnline: false,
                    accessToken: "test-token",
                },
            });

            const shadowRule = await prisma.shadowRule.create({
                data: {
                    name: "[TEST] Integration test rule",
                    rateType: "PER_AMOUNT",
                    perAmount: 10,
                    pointsPerUnit: 1,
                    currencyCode: "USD",
                    isActive: true,
                    sessionId: session.id,
                },
            });

            const job = await prisma.job.create({
                data: {
                    type: "POINTS_BACKFILL",
                    shop: TEST_SHOP,
                    status: "PROCESSING",
                    payload: { shadowRuleId: shadowRule.id, audience: {}, cursor: null, counts: { awarded: 0, skipped: 0, failed: 0 } },
                },
            });

            const customer = await prisma.customer.create({
                data: {
                    shopifyId: "gid://shopify/Customer/TEST_INTEGRATION",
                    email: "test-integration@example.com",
                    referralCode: `TESTCODE_${Date.now()}`,
                    sessionId: session.id,
                },
            });

            // ── The exact pipeline pointsBackfillJob.js's processOneCustomer uses ──
            // Audience selection is Shopify's job now (the segment), so the
            // step that used to be matchesAudience() is the GID rewrite that
            // turns a segment member into the customer this row is about.
            await checkEqual(
                "normalizeSegmentMemberGid maps a segment member to a Customer GID",
                normalizeSegmentMemberGid("gid://shopify/CustomerSegmentMember/TESTID".replace("TESTID", "8675309")),
                "gid://shopify/Customer/8675309"
            );

            const shopifyAmountSpent = { amount: "505", currencyCode: "USD" };
            await check("currencyMatches — same currency as the rule", () => currencyMatches(shadowRule, shopifyAmountSpent));

            const points = computePoints(shadowRule, shopifyAmountSpent.amount);
            await checkEqual("computePoints — $505 at 1pt per $10 -> 50", points, 50);

            const entry = await prisma.pointsBackfillEntry.create({
                data: {
                    jobId: job.id,
                    shadowRuleId: shadowRule.id,
                    customerId: customer.id,
                    amountSpent: Number(shopifyAmountSpent.amount),
                    pointsAwarded: 0,
                    status: "PENDING",
                },
            });

            const transaction = await createTransaction(
                {
                    customerId: customer.id,
                    type: "BACKFILL",
                    points,
                    activity: "Test backfill award",
                    status: "COMPLETED",
                    metadata: { source: "BACKFILL", shadowRuleId: shadowRule.id, jobId: job.id },
                },
                session
            );

            await check("createTransaction succeeded (didn't silently return null)", () => transaction !== null);
            await checkEqual("transaction.type is BACKFILL", transaction?.type, "BACKFILL");
            await checkEqual("transaction.points equals the computed points", transaction?.points, points);

            await prisma.pointsBackfillEntry.update({
                where: { id: entry.id },
                data: { status: "AWARDED", pointsAwarded: points, transactionId: transaction.id },
            });

            // ── Verify the customer's real balance actually moved ────────────
            const refreshed = await prisma.customer.findUnique({ where: { id: customer.id } });
            await checkEqual("customer.points updated to the awarded amount", refreshed.points, points);
            await checkEqual("customer.lifetimePoints updated to the awarded amount", refreshed.lifetimePoints, points);

            // ── Idempotency guarantee — @@unique([shadowRuleId, customerId]) ──
            await check("a second entry for the SAME rule+customer is rejected (idempotency)", async () => {
                try {
                    await prisma.pointsBackfillEntry.create({
                        data: {
                            jobId: job.id,
                            shadowRuleId: shadowRule.id,
                            customerId: customer.id,
                            amountSpent: 505,
                            pointsAwarded: 0,
                            status: "PENDING",
                        },
                    });
                    return false; // should never reach here
                } catch (err) {
                    return err.code === "P2002";
                }
            });

            // ── FK-mismatch safety — the exact bug this feature must never hit ──
            //
            // Deliberately uses -1, NOT shadowRule.id, as the invalid
            // pointsRuleId. Postgres auto-increment sequences never
            // produce negative numbers, so -1 is GUARANTEED not to exist
            // in PointsRule, making this check deterministic regardless
            // of what's already in the database.
            //
            // shadowRule.id would NOT be reliable here: PointsRule and
            // ShadowRule are separate tables with independent sequences,
            // so shadowRule.id can coincidentally equal a REAL PointsRule
            // id (e.g. both tables' first-ever row gets id=1) — in that
            // case the FK constraint is satisfied by accident, pointing
            // to the wrong rule instead of raising anything. This is
            // exactly what happened the first time this test ran against
            // a real database that already had points rules configured —
            // it's not a hypothetical, it reproduced immediately. The FK
            // constraint is therefore NOT a reliable safety net against
            // ever passing a ShadowRule id as pointsRuleId; the actual
            // protection is that pointsBackfillJob.js's own code simply
            // never does this (see createTransaction.js's BACKFILL
            // @example) — this check only verifies createTransaction's
            // own null-on-genuine-FK-violation behavior in isolation.
            const badTransaction = await createTransaction(
                {
                    customerId: customer.id,
                    type: "BACKFILL",
                    points: 10,
                    pointsRuleId: -1,
                    status: "COMPLETED",
                },
                session
            );
            await check(
                "a genuinely nonexistent pointsRuleId returns null, doesn't throw or corrupt data",
                () => badTransaction === null
            );

            // ── Restrict FK — a used ShadowRule must not be deletable ─────────
            await check("deleting a ShadowRule with existing entries is blocked (Restrict FK)", async () => {
                try {
                    await prisma.shadowRule.delete({ where: { id: shadowRule.id } });
                    return false;
                } catch (err) {
                    return err.code === "P2003";
                }
            });
        });
    } finally {
        await cleanup();
    }
}

// Allow running this file directly: node scripts/test/backfillIntegration.test.js
if (import.meta.url === `file://${process.argv[1]}`) {
    const { report } = await import("./lib/assert.js");
    await run();
    await prisma.$disconnect();
    process.exit(report() ? 0 : 1);
}

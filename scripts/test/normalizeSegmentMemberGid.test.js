/**
 * @file scripts/test/normalizeSegmentMemberGid.test.js
 * @description Unit tests for utils/backfill/normalizeSegmentMemberGid.js.
 * Pure function, no DB/network — safe to run anywhere, anytime.
 *
 * Replaces the old matchesAudience.test.js. Audience matching moved out of
 * application code entirely when this feature switched to Shopify customer
 * segments (see BackfillAudienceSnapshot in schema.prisma), and the GID
 * rewrite took its place as the one piece of pure logic in the backfill
 * path that decides WHICH CUSTOMER a row refers to — so it's the one that
 * most needs pinning down by test.
 *
 * Note what these tests can and can't cover. They prove the rewrite is
 * strict and idempotent. They can NOT prove that Shopify's
 * CustomerSegmentMember id really is the Customer id, because that's a
 * property of Shopify's live data rather than of this function — that
 * check lives in controller/backfillAudience/verifyMemberGidMapping.js and
 * runs against the real API on every snapshot build.
 */

import { normalizeSegmentMemberGid, segmentMemberNumericId } from "../../app/utils/backfill/normalizeSegmentMemberGid.js";
import { suite, checkEqual } from "./lib/assert.js";

export async function run() {
    await suite("normalizeSegmentMemberGid", async () => {
        await checkEqual(
            "rewrites a segment member GID to a Customer GID",
            normalizeSegmentMemberGid("gid://shopify/CustomerSegmentMember/8675309"),
            "gid://shopify/Customer/8675309"
        );
        await checkEqual(
            "idempotent — an already-normalised Customer GID passes through",
            normalizeSegmentMemberGid("gid://shopify/Customer/8675309"),
            "gid://shopify/Customer/8675309"
        );
        await checkEqual(
            "rejects a different resource type",
            normalizeSegmentMemberGid("gid://shopify/Order/8675309"),
            null
        );
        await checkEqual(
            "rejects a non-numeric suffix",
            normalizeSegmentMemberGid("gid://shopify/CustomerSegmentMember/abc"),
            null
        );
        await checkEqual(
            "rejects a query-string suffix rather than stripping it",
            normalizeSegmentMemberGid("gid://shopify/CustomerSegmentMember/123?key=abc"),
            null
        );
        await checkEqual("rejects an empty string", normalizeSegmentMemberGid(""), null);
        await checkEqual("rejects null", normalizeSegmentMemberGid(null), null);
        await checkEqual("rejects a non-string", normalizeSegmentMemberGid(12345), null);
        await checkEqual(
            "rejects a bare numeric id with no GID prefix",
            normalizeSegmentMemberGid("8675309"),
            null
        );
    });

    await suite("segmentMemberNumericId", async () => {
        await checkEqual(
            "extracts the numeric portion",
            segmentMemberNumericId("gid://shopify/CustomerSegmentMember/8675309"),
            "8675309"
        );
        await checkEqual(
            "extracts from an already-normalised Customer GID too",
            segmentMemberNumericId("gid://shopify/Customer/8675309"),
            "8675309"
        );
        await checkEqual(
            "returns null for anything the rewrite rejects",
            segmentMemberNumericId("gid://shopify/Order/1"),
            null
        );
    });
}

// Allow running this file directly: node scripts/test/normalizeSegmentMemberGid.test.js
if (import.meta.url === `file://${process.argv[1]}`) {
    const { report } = await import("./lib/assert.js");
    await run();
    process.exit(report() ? 0 : 1);
}

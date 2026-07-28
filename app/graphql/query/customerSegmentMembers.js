/**
 * @file graphql/query/customerSegmentMembers.js
 * @description Reads the members of a Shopify customer Segment — the data
 * source that replaces "fetch every customer in the shop, then filter
 * client-side" for POINTS_BACKFILL.
 *
 * Why this exists at all: the previous approach paged through the shop's
 * ENTIRE customer list because Shopify deprecated the Customer search
 * filters that would have narrowed it (see
 * utils/backfill/matchesAudience.js). On a 100k-customer shop that is
 * 100k/PAGE_SIZE poller cycles to reach an audience of maybe 2k people —
 * hours of work, ~98% of it spent fetching customers that are immediately
 * discarded. Segment membership is evaluated by Shopify, so this returns
 * only the audience, and `totalCount` gives its size in a single call
 * without paginating anything.
 *
 * ── Two things about this connection that shape the code below ───────────
 *
 * 1. IT RETURNS CustomerSegmentMember, NOT Customer. Different object,
 *    smaller field set — no `tags`, no `createdAt`, no `state`. That's
 *    fine here (filtering already happened server-side, so the fields
 *    those supported are no longer needed), but the `id` is the sharp
 *    edge: it comes back as `gid://shopify/CustomerSegmentMember/<n>`.
 *    See utils/backfill/normalizeSegmentMemberGid.js for the full story
 *    and why callers must verify, not just rewrite.
 *
 * 2. MAX PAGE SIZE IS 1000, not the usual 250. Documented on the
 *    connection itself. This module still defaults lower (see
 *    DEFAULT_PAGE_SIZE) — a 1000-node page of a query Shopify computes
 *    per-request is a large, slow, expensive call, and the caller here is
 *    a background job with no user waiting on any individual page.
 */

import { logger } from "../../utils/logger.js";
import { withRetry } from "../../utils/retry/withRetry.js";
import { callShopifyGraphql, shopifyGraphqlWithRetry, SHOPIFY_RETRYABLE_ERRORS } from "../../utils/shopifyGraphql.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "graphql/query/customerSegmentMembers";

/**
 * @constant {number} Nodes per page when walking a segment.
 *
 * Shopify allows up to 1000 here, and it's tempting to use it — 2k
 * members in 2 calls. Kept at 250 anyway: segment membership is computed
 * server-side per request rather than read from a static index, so page
 * size maps fairly directly onto how long Shopify spends on the call and
 * how much of the app's rate-limit bucket it costs. The snapshot build
 * this feeds is a background job advancing one page per poller cycle with
 * nobody waiting on any single page, so there is no user-visible benefit
 * to the larger page and a real reliability cost (a timed-out 1000-node
 * page loses the whole page; a timed-out 250-node page loses a quarter as
 * much and retries four times faster).
 */
const DEFAULT_PAGE_SIZE = 250;

// ─────────────────────────────────────────────────────────────────────────────
// Shared Fields
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every field the snapshot and its CSV need — chosen to line up with what
 * controller/customers/store.js already reads off a Shopify customer
 * (`defaultEmailAddress.emailAddress`, `firstName`, `lastName`, `id`), so
 * a segment member can be handed to getOrCreateCustomer() unchanged once
 * its GID is normalised. No mapping layer, no shape translation.
 *
 * `amountSpent` is the input to computePoints(). `displayName` and
 * `defaultPhoneNumber` are for the preview CSV only.
 */
const SEGMENT_MEMBER_FIELDS = `#graphql
    id
    firstName
    lastName
    displayName
    defaultEmailAddress {
        emailAddress
    }
    defaultPhoneNumber {
        phoneNumber
    }
    amountSpent {
        amount
        currencyCode
    }
    numberOfOrders
`;

// ─────────────────────────────────────────────────────────────────────────────
// Count
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How many customers are currently in a segment.
 *
 * `first: 1` is the minimum the connection accepts; the single returned
 * edge is discarded. `totalCount` is a property of the connection itself,
 * so this costs one small call no matter how large the segment is — which
 * is what makes a live "this segment has N customers" figure practical to
 * show the moment a merchant picks one from the dropdown, before
 * committing to building anything.
 *
 * Throws rather than returning 0 on failure. A 0 here would render as
 * "this segment is empty", which is a meaningful and actionable claim; a
 * failed API call is not, and must not be presented as one.
 *
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} segmentId - Full GID, e.g. "gid://shopify/Segment/123"
 * @returns {Promise<number>}
 * @throws {Error} If segmentId is missing or the call fails after retries.
 */
export const segmentMemberCount = async (admin, segmentId) => {
    if (!segmentId) {
        throw new Error("segmentMemberCount: missing required segmentId");
    }

    const json = await shopifyGraphqlWithRetry(
        admin,
        `#graphql
        query SegmentMemberCount($segmentId: ID!) {
            customerSegmentMembers(segmentId: $segmentId, first: 1) {
                totalCount
            }
        }`,
        { segmentId },
        { context: { module: MODULE, segmentId } }
    );

    const totalCount = json.data?.customerSegmentMembers?.totalCount;

    if (typeof totalCount !== "number") {
        throw new Error("segmentMemberCount: no totalCount in response");
    }

    logger.info(MODULE, "Segment member count resolved", { segmentId, totalCount });
    return totalCount;
};

// ─────────────────────────────────────────────────────────────────────────────
// Members (single page — for resumable background jobs)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches ONE page of segment members — no internal loop, same division
 * of responsibility as customersPage() in graphql/query/customers.js and
 * for the same reason: the caller is a resumable background job that
 * persists its own cursor between poller cycles, so looping here would
 * defeat that entirely.
 *
 * ── On sortKey ───────────────────────────────────────────────────────────
 * Pinned to `created_at`, not left to Shopify's default. Cursor-based
 * pagination over a result set the server recomputes per request is only
 * coherent if the ordering is stable between requests, and customer
 * creation date is the one sort key here that never changes for an
 * existing customer — unlike amount_spent, number_of_orders or
 * last_order_date, any of which can shift mid-build if a customer places
 * an order, silently causing a member to be visited twice or skipped
 * entirely. Duplicates are already harmless (the snapshot's
 * @@unique([snapshotId, shopifyId]) absorbs them), but a SKIPPED member
 * is a customer who quietly never gets their points, which nothing
 * downstream would ever detect.
 *
 * @param {Object} admin
 * @param {Object} params
 * @param {string} params.segmentId - Full Segment GID.
 * @param {string|null} [params.cursor] - endCursor from a previous call, or null to start.
 * @param {number} [params.pageSize=250] - Max 1000 (Shopify's own ceiling).
 * @returns {Promise<{ nodes: Array, hasNextPage: boolean, endCursor: string|null, totalCount: number }|null>}
 *   null on failure after retries — the caller must treat this the same
 *   way pointsBackfillJob.js treats a whole-page failure: re-queue from
 *   the SAME cursor, nothing lost.
 */
export const segmentMembersPage = async (admin, { segmentId, cursor = null, pageSize = DEFAULT_PAGE_SIZE } = {}) => {
    if (!segmentId) {
        logger.error(MODULE, "segmentMembersPage: missing segmentId");
        return null;
    }

    const first = Math.min(Math.max(1, pageSize), 1000);

    try {
        const json = await withRetry(
            () =>
                callShopifyGraphql(
                    admin,
                    `#graphql
                    query SegmentMembersPage($segmentId: ID!, $first: Int!, $cursor: String) {
                        customerSegmentMembers(
                            segmentId: $segmentId
                            first: $first
                            after: $cursor
                            sortKey: "created_at"
                        ) {
                            totalCount
                            edges {
                                node {
                                    ${SEGMENT_MEMBER_FIELDS}
                                }
                            }
                            pageInfo {
                                hasNextPage
                                endCursor
                            }
                        }
                    }`,
                    { segmentId, first, cursor }
                ),
            {
                maxAttempts: 3,
                baseDelayMs: 800,
                retryableErrors: SHOPIFY_RETRYABLE_ERRORS,
                context: { module: MODULE, segmentId, cursor },
            }
        );

        const connection = json.data?.customerSegmentMembers;
        if (!connection) throw new Error("Invalid response from Shopify API");

        return {
            nodes: (connection.edges ?? []).map((edge) => edge.node).filter(Boolean),
            hasNextPage: connection.pageInfo?.hasNextPage ?? false,
            endCursor: connection.pageInfo?.endCursor ?? null,
            totalCount: connection.totalCount ?? 0,
        };
    } catch (error) {
        logger.error(MODULE, "segmentMembersPage: failed to fetch page", {
            error: error?.message,
            segmentId,
            cursor,
        });
        return null;
    }
};

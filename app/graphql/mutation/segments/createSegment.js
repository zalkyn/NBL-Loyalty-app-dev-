/**
 * @file graphql/mutation/segments/createSegment.js
 * @description Creates a Shopify customer segment from inside this app,
 * so a merchant doesn't have to leave for the Shopify admin and come back
 * just to define a backfill audience.
 *
 * Shopify's own segment editor is still the better tool for anything
 * complex — it has autocomplete, live counts, and the full filter set.
 * What this covers is the one case that comes up constantly for
 * backfills and is tedious to context-switch for: "everyone with any of
 * these tags". The generated query is a plain ShopifyQL string, so a
 * segment made here is indistinguishable from one made in the admin and
 * can be edited there afterwards.
 *
 * Requires the `write_customers` access scope, which this app already has.
 */

import { logger } from "../../../utils/logger.js";
import { shopifyGraphqlWithRetry } from "../../../utils/shopifyGraphql.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "graphql/mutation/segments/createSegment";

/**
 * Builds the ShopifyQL for "has at least one of these tags".
 *
 * ── On quoting ───────────────────────────────────────────────────────────
 * Tag values are wrapped in single quotes, and a tag CONTAINING a single
 * quote is REJECTED rather than escaped. Shopify documents the segment
 * query language's syntax but not its escape sequence for a quote inside
 * a quoted literal, and guessing wrong here doesn't produce an error — it
 * produces a segment that silently matches the wrong set of customers,
 * which then silently becomes the audience for a run that awards real
 * points. Refusing the input is the only version of this with no bad
 * outcome; a merchant with an apostrophe in a tag can still build that
 * segment in Shopify's own editor and pick it here.
 *
 * `CONTAINS` is Shopify's exact-tag operator for `customer_tags` (its
 * name is misleading — it means "this tag is among the customer's tags",
 * not a substring match), and tags are matched case-insensitively.
 *
 * @param {string[]} tags
 * @returns {{ query: string }|{ error: string }}
 *
 * @example
 * buildTagQuery(["member:tier_one", "member:tier_two"]);
 * // -> { query: "customer_tags CONTAINS 'member:tier_one' OR customer_tags CONTAINS 'member:tier_two'" }
 */
export function buildTagQuery(tags) {
    const clean = (tags ?? []).map((t) => String(t ?? "").trim()).filter(Boolean);

    if (clean.length === 0) {
        return { error: "Add at least one tag." };
    }

    const withQuote = clean.find((t) => t.includes("'"));
    if (withQuote) {
        return {
            error: `The tag "${withQuote}" contains an apostrophe, which can't be used here. Build this segment in Shopify admin under Customers → Segments instead, then pick it above.`,
        };
    }

    // Duplicates are dropped rather than rejected — two identical rows is
    // a slip, not a mistake worth an error message, and OR-ing a tag with
    // itself is meaningless anyway.
    const unique = [...new Set(clean)];

    return { query: unique.map((tag) => `customer_tags CONTAINS '${tag}'`).join(" OR ") };
}

/**
 * Creates a segment.
 *
 * Returns a result object rather than throwing, matching the shape every
 * other enqueue/action helper in this codebase returns, so the caller can
 * hand `message` straight to a toast.
 *
 * userErrors are surfaced verbatim. Shopify's messages for an invalid
 * segment query are specific and actionable ("Invalid syntax near…"), and
 * replacing them with a generic string would throw away the only
 * information that helps.
 *
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {Object} params
 * @param {string} params.name
 * @param {string} params.query - ShopifyQL segment query
 * @returns {Promise<{ ok: boolean, message: string, segment?: { id: string, name: string, query: string } }>}
 */
export default async function createSegment(admin, { name, query }) {
    try {
        const trimmedName = String(name ?? "").trim();

        if (!trimmedName) {
            return { ok: false, message: "Give the segment a name." };
        }
        if (!query) {
            return { ok: false, message: "The segment has no conditions." };
        }

        const json = await shopifyGraphqlWithRetry(
            admin,
            `#graphql
            mutation CreateBackfillSegment($name: String!, $query: String!) {
                segmentCreate(name: $name, query: $query) {
                    segment {
                        id
                        name
                        query
                    }
                    userErrors {
                        field
                        message
                    }
                }
            }`,
            { name: trimmedName, query },
            { context: { module: MODULE, name: trimmedName } }
        );

        const result = json.data?.segmentCreate;
        const userErrors = result?.userErrors ?? [];

        if (userErrors.length > 0) {
            const message = userErrors.map((e) => e.message).join(" ");
            logger.error(MODULE, "segmentCreate returned userErrors", { name: trimmedName, query, userErrors });
            return { ok: false, message: `Shopify rejected the segment: ${message}` };
        }

        if (!result?.segment) {
            return { ok: false, message: "Shopify didn't return the new segment. Try again." };
        }

        logger.info(MODULE, "Segment created", { segmentId: result.segment.id, name: trimmedName });

        return {
            ok: true,
            segment: result.segment,
            message: `Created the segment "${result.segment.name}".`,
        };
    } catch (error) {
        logger.error(MODULE, "Failed to create segment", { error: error?.message, name });
        return { ok: false, message: "Couldn't create the segment. Try again in a moment." };
    }
}

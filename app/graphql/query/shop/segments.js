/**
 * @file graphql/query/shop/segments.js
 * @description Lists the customer Segments a merchant has created in
 * their Shopify admin, for the backfill page's segment picker.
 *
 * Segments replace the tag/date audience filters this feature originally
 * used — see utils/backfill/matchesAudience.js's header for why those had
 * to go (Shopify deprecated the `tag`, `tag_not`, `customer_date`,
 * `total_spent` and other Customer search filters in Admin API 2024-07,
 * pointing developers at segments instead). Unlike that workaround, this
 * is the path Shopify actually supports, so a segment-based audience
 * cannot silently no-op the way a deprecated search filter can.
 *
 * It also moves audience definition OUT of this app entirely: the
 * merchant builds the segment in Shopify's own editor, with the full
 * filter set (tags, spend, order count, location, RFM group, product
 * purchase history) rather than the two tag lists and one date this app
 * could reasonably build itself.
 */

import { logger } from "../../../utils/logger.js";
import { shopifyGraphqlWithRetry } from "../../../utils/shopifyGraphql.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "graphql/query/shop/segments";

/**
 * Fetches the shop's customer segments, newest-edited first.
 *
 * Deliberately single-page rather than paginated-to-exhaustion, unlike
 * the customers() export in graphql/query/customers.js: this feeds a
 * picker dropdown, and a shop with more than 250 distinct segments is
 * both vanishingly rare and better served by a search box than by an
 * ever-growing list. If that ever becomes a real complaint, the fix is a
 * `query:` argument on this connection (Segment search IS supported —
 * it's the *Customer* search filters that were deprecated), not
 * pagination.
 *
 * Never throws. A picker that renders empty with an error banner is a
 * recoverable state; a loader that throws takes the whole page down,
 * including the run-status panel a merchant may have opened the page to
 * check on.
 *
 * But it returns { segments, error } rather than a bare array, because
 * swallowing a failure into [] made the two worst cases indistinguishable
 * to the caller: a shop with no segments and a shop whose segments failed
 * to load both arrived as an empty list, and the picker told a merchant
 * with twenty segments that they had none. An empty list is a fact about
 * the shop; an error is a fact about this request, and only one of them
 * is worth offering a Retry button for.
 *
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {Object} [params]
 * @param {number} [params.first=250]
 * @returns {Promise<{ segments: Array<{ id: string, name: string, query: string, creationDate: string, lastEditDate: string }>, error: string|null }>}
 */
export default async function segments(admin, { first = 250 } = {}) {
    try {
        const json = await shopifyGraphqlWithRetry(
            admin,
            `#graphql
            query BackfillSegments($first: Int!) {
                segments(first: $first, sortKey: LAST_EDIT_DATE, reverse: true) {
                    nodes {
                        id
                        name
                        query
                        creationDate
                        lastEditDate
                    }
                }
            }`,
            { first },
            { context: { module: MODULE } }
        );

        return { segments: json.data?.segments?.nodes ?? [], error: null };
    } catch (error) {
        logger.error(MODULE, "Failed to fetch segments", { error: error?.message });
        return {
            segments: [],
            error: error?.message || "Shopify didn't respond.",
        };
    }
}

/**
 * Fetches ONE segment by id — used to re-validate ownership and existence
 * at the moment a snapshot build is enqueued, rather than trusting the id
 * that came back from the browser.
 *
 * The segment picker's list is rendered from a loader that may be minutes
 * old by the time the merchant clicks; the segment could have been
 * deleted in another tab since. More importantly, the segment id arrives
 * as a form value, so it is user input and must be re-checked server-side
 * regardless — a valid-looking GID for a segment belonging to a different
 * shop must not be accepted just because it parses.
 *
 * Note that this doesn't need an explicit shop check: `admin` is already
 * scoped to one shop's access token, so a segment from another shop
 * simply resolves to null here.
 *
 * @param {Object} admin
 * @param {string} segmentId - Full GID, e.g. "gid://shopify/Segment/123"
 * @returns {Promise<{ id: string, name: string, query: string }|null>}
 */
export const segment = async (admin, segmentId) => {
    try {
        if (!segmentId) throw new Error("segment: missing segmentId");

        const json = await shopifyGraphqlWithRetry(
            admin,
            `#graphql
            query BackfillSegment($id: ID!) {
                segment(id: $id) {
                    id
                    name
                    query
                }
            }`,
            { id: segmentId },
            { context: { module: MODULE, segmentId } }
        );

        return json.data?.segment ?? null;
    } catch (error) {
        logger.error(MODULE, "Failed to fetch segment", { error: error?.message, segmentId });
        return null;
    }
};

import { logger } from "../../../utils/logger.js";
import { shopifyGraphqlWithRetry } from "../../../utils/shopifyGraphql.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "graphql/query/shop/searchPages.js";

/**
 * Searches the shop's Online Store Pages (Online Store > Pages) by title,
 * for the Customize widget config's "page visibility" picker — lets the
 * merchant pick pages by name instead of typing a raw handle/URL.
 *
 * Scoped to Page resources only (not product/collection/blog) — see
 * cssVarsConfig.js's `display.pageVisibility` comment for why.
 *
 * @requires read_online_store_pages — the `pages` field on Admin GraphQL's
 * QueryRoot 403s ("Access denied for pages field.") without it. Must be
 * present in BOTH shopify.app.toml and shopify.app.loyalty-referral-pre.toml's
 * [access_scopes] `scopes` string. Adding it there requires a fresh
 * `shopify app deploy`/`config push` PLUS every already-installed shop
 * (dev and production) re-approving the updated scope set before this
 * query stops 403ing for them — see chat notes from 2026-08-06.
 *
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} searchTerm - Free-text title search, may be empty (returns most recent pages)
 * @returns {Promise<{id: string, handle: string, title: string}[]>}
 */
export default async function searchPages(admin, searchTerm) {
    try {
        const term = (searchTerm || "").trim();
        const json = await shopifyGraphqlWithRetry(
            admin,
            `#graphql
            query SearchPages($query: String, $first: Int!) {
                pages(first: $first, query: $query, sortKey: TITLE) {
                    edges {
                        node { id handle title }
                    }
                }
            }`,
            { query: term ? `title:*${term}*` : null, first: 20 },
            { context: { module: MODULE } }
        );

        const edges = json.data?.pages?.edges ?? [];
        return edges.map((e) => ({ id: e.node.id, handle: e.node.handle, title: e.node.title }));
    } catch (error) {
        logger.error(MODULE, "Failed to search shop pages", { error: error?.message });
        return [];
    }
}
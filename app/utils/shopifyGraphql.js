import { withRetry } from "./retry/withRetry.js";

/**
 * @file utils/shopifyGraphql.js
 * @description Single entry point for every Shopify Admin GraphQL call in
 * this app. Before this file existed, each of the ~8 call sites parsed
 * `admin.graphql()`'s response with its own `response.json()` call and
 * never looked at the `errors` array — meaning a Shopify rate-limit
 * ("Throttled") response was silently treated as "no data" instead of
 * being retried, since nothing ever threw an error for `withRetry` to
 * catch. This file fixes that in one place instead of eight.
 *
 * Two ways to use it, matching the two retry patterns already present in
 * the codebase — pick based on how the CALLER already handles retry:
 *
 *   - `shopifyGraphqlWithRetry()` — bundles the call + retry together.
 *     Use this for call sites that manage their own retry today (e.g.
 *     shopId.js, customers.js, getAppstleMetafield.js).
 *
 *   - `callShopifyGraphql()` — makes the call and throws on error/throttle,
 *     but does NOT retry itself. Use this inside functions whose CALLER
 *     already wraps the whole operation in `withRetry` (e.g.
 *     generateReferralDiscountCode.js, generateRewardVoucher.js) — adding
 *     a second retry loop inside those would stack retries on retries and
 *     multiply worst-case wait time for no benefit. For these, add
 *     SHOPIFY_RETRYABLE_ERRORS to the existing outer `retryableErrors`
 *     list instead.
 */

/**
 * Retryable-error substrings for any Shopify Admin GraphQL call — transient
 * network failures AND Shopify's own rate-limit response. Use this (or
 * spread it into a larger list) in every `retryableErrors` option around a
 * Shopify GraphQL request, whether via the helpers below or an existing
 * caller-level `withRetry`.
 *
 * @constant {string[]}
 */
export const SHOPIFY_RETRYABLE_ERRORS = ["fetch failed", "ECONNRESET", "ETIMEDOUT", "Throttled"];

/**
 * Makes a single Shopify Admin GraphQL call and returns the parsed JSON —
 * does NOT retry. Throws a plain `Error("Throttled")` if the response's
 * top-level `errors` array contains a THROTTLED code, so a `withRetry`
 * wrapper (this file's or the caller's own) can recognize and retry it via
 * SHOPIFY_RETRYABLE_ERRORS. Does not otherwise inspect `errors` — GraphQL
 * validation errors, `userErrors`, etc. are still the caller's job to
 * check, exactly as before this file existed.
 *
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} query - GraphQL query/mutation string
 * @param {Object} [variables] - GraphQL variables, if any
 * @returns {Promise<Object>} Parsed JSON response (`{ data, errors?, extensions? }`)
 * @throws {Error} "Throttled" on a Shopify rate-limit response; otherwise
 *   propagates whatever `admin.graphql()`/`response.json()` itself throws
 *   (network failure, malformed response, etc.)
 */
export async function callShopifyGraphql(admin, query, variables) {
    const response = await admin.graphql(query, variables ? { variables } : undefined);
    const json = await response.json();

    const isThrottled = json?.errors?.some((e) => e?.extensions?.code === "THROTTLED");
    if (isThrottled) {
        throw new Error("Throttled");
    }

    return json;
}

/**
 * `callShopifyGraphql()` wrapped in `withRetry`, retrying transient network
 * failures and Shopify THROTTLED responses with exponential backoff. Use
 * for call sites that don't already have their own outer retry layer.
 *
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {string} query - GraphQL query/mutation string
 * @param {Object} [variables] - GraphQL variables, if any
 * @param {Object} [retryOptions] - Overrides merged into the default retry
 *   config (maxAttempts: 3, baseDelayMs: 800) — pass `context: { module, ...}`
 *   here for log lines, same as any other `withRetry` call.
 * @returns {Promise<Object>} Parsed JSON response
 */
export async function shopifyGraphqlWithRetry(admin, query, variables, retryOptions = {}) {
    return withRetry(
        () => callShopifyGraphql(admin, query, variables),
        {
            maxAttempts: 3,
            baseDelayMs: 800,
            retryableErrors: SHOPIFY_RETRYABLE_ERRORS,
            ...retryOptions,
        }
    );
}

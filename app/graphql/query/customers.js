import { normalizeCustomerGid } from "../../controller/customers/normalizeCustomerGid.js";
import { logger } from "../../utils/logger.js";
import { withRetry } from "../../utils/retry/withRetry.js";
import { callShopifyGraphql, shopifyGraphqlWithRetry, SHOPIFY_RETRYABLE_ERRORS } from "../../utils/shopifyGraphql.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "graphql/query/customers";

// ─────────────────────────────────────────────────────────────────────────────
// Shared Fields
// ─────────────────────────────────────────────────────────────────────────────

const CUSTOMER_FIELDS = `#graphql
    id
    firstName
    lastName
    defaultEmailAddress {
        emailAddress
        marketingState
    }
    defaultPhoneNumber {
        phoneNumber
        marketingState
        marketingCollectedFrom
    }
    createdAt
    updatedAt
    numberOfOrders
    state
    amountSpent {
        amount
        currencyCode
    }
    verifiedEmail
    taxExempt
    tags
`;

// ─────────────────────────────────────────────────────────────────────────────
// Customers (paginated)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches all customers from the store using cursor-based pagination.
 * Iterates through all pages until no more results remain.
 *
 * @param {Object} admin - Shopify Admin GraphQL client
 * @returns {Promise<{ customers: { nodes: Array } }|null>}
 */
export default async function customers(admin) {
    const allCustomers = [];
    let cursor = null;
    let hasNextPage = true;

    try {
        while (hasNextPage) {
            // Each page is retried independently on transient network failure.
            // Without this, a single blip late in a 100k+ customer sync would
            // discard every page already fetched and fail the whole sync.
            const data = await withRetry(
                async () => {
                    const json = await callShopifyGraphql(
                        admin,
                        `#graphql
                        query CustomerList($cursor: String) {
                            customers(first: 250, after: $cursor) {
                                nodes {
                                    ${CUSTOMER_FIELDS}
                                }
                                pageInfo {
                                    hasNextPage
                                    endCursor
                                }
                            }
                        }`,
                        { cursor }
                    );

                    const page = json.data?.customers;
                    if (!page) throw new Error("Invalid response from Shopify API");
                    return page;
                },
                {
                    maxAttempts: 3,
                    baseDelayMs: 800,
                    retryableErrors: SHOPIFY_RETRYABLE_ERRORS,
                    context: { module: MODULE, fetchedSoFar: allCustomers.length },
                }
            );

            allCustomers.push(...data.nodes);
            hasNextPage = data.pageInfo.hasNextPage;
            cursor = data.pageInfo.endCursor;
        }

        return { customers: { nodes: allCustomers } };
    } catch (error) {
        logger.error(MODULE, "Failed to fetch customers", {
            error: error?.message,
            fetchedBeforeFailure: allCustomers.length,
        });
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Single Customer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches a single customer by ID.
 *
 * @param {Object}        admin - Shopify Admin GraphQL client
 * @param {string|number} id    - Customer ID (numeric or full GID)
 * @returns {Promise<Object|null>}
 */
export const customer = async (admin, id) => {
    try {
        if (!id) throw new Error("Valid customer ID required");

        const gid = normalizeCustomerGid(id);
        const json = await shopifyGraphqlWithRetry(
            admin,
            `#graphql
            query CustomerById($id: ID!) {
                customer(id: $id) {
                    ${CUSTOMER_FIELDS}
                }
            }`,
            { id: gid },
            { context: { module: MODULE, id } }
        );

        return json.data?.customer ?? null;
    } catch (error) {
        logger.error(MODULE, "Failed to fetch customer", { error: error?.message, id });
        return null;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Customer Order Count
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the total number of orders placed by a customer.
 *
 * Uses the QueryRoot `ordersCount` query filtered by `customer_id` — the only
 * truly reliable way to get an accurate customer order count in Shopify Admin
 * GraphQL:
 *
 *   - `Customer.numberOfOrders` is a scalar that can misreport as 0 even when
 *     orders exist (documented Shopify behavior).
 *   - `Customer.orders(first: N)` only returns up to N nodes, so it cannot
 *     give an accurate total without paginating through all orders.
 *   - `ordersCount(query: "customer_id:X")` is a root-level aggregation query
 *     that returns the exact count independently of the Customer object —
 *     unaffected by the numberOfOrders misreport bug.
 *
 * The `precision` field indicates whether the count is EXACT or AT_LEAST.
 * For referral eligibility checks (does the customer have any prior orders?)
 * either precision value is sufficient — we only care whether count > 0.
 *
 * Return value is always a non-negative integer.
 * Returns 0 on error so callers can safely treat it as "no orders".
 *
 * @param {Object}        admin - Shopify Admin GraphQL client
 * @param {string|number} id    - Customer ID (numeric or full GID)
 * @returns {Promise<number>} Total order count, or 0 on error
 *
 * @example
 * const count = await customerOrderCount(admin, "gid://shopify/Customer/123");
 * if (count > 0) // customer has placed at least one order
 */
/**
 * Fetches the order count for a Shopify customer.
 *
 * Throws on failure rather than defaulting to 0 — a returned `0` here
 * carries real business meaning (e.g. referral-claim.jsx treats it as
 * "no prior orders, eligible for referral reward"). Silently returning 0
 * on a Shopify API failure would incorrectly grant eligibility to a
 * customer whose real order count is unknown, not zero. Callers that only
 * need this for display (e.g. the customer dashboard) should catch and
 * default to null/"unknown" themselves.
 *
 * @param {Object}        admin - Shopify Admin GraphQL client
 * @param {string|number} id    - Shopify customer ID or GID
 * @returns {Promise<number>} Order count
 * @throws {Error} If `id` is missing, or the Shopify API call fails after retries
 */
export const customerOrderCount = async (admin, id) => {
    if (!id) {
        throw new Error("customerOrderCount: missing required id");
    }

    // Extract the numeric ID from GID if needed:
    // "gid://shopify/Customer/9441305526522" -> "9441305526522"
    // ordersCount query filter requires numeric customer_id, not GID format
    const numericId = String(id).includes("gid://")
        ? String(id).split("/").pop()
        : String(id);

    const json = await shopifyGraphqlWithRetry(
        admin,
        `#graphql
        query CustomerOrderCount($query: String!) {
            ordersCount(query: $query) {
                count
                precision
            }
        }`,
        { query: `customer_id:${numericId}` },
        { context: { module: MODULE, id } }
    );
    const result = json?.data?.ordersCount;

    if (!result) {
        throw new Error("customerOrderCount: no result from ordersCount query");
    }

    logger.info(MODULE, "customerOrderCount resolved", {
        id,
        count: result.count,
        precision: result.precision,
    });

    return result.count ?? 0;
};
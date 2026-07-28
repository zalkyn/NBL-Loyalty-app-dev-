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
 * Fetches ONE page of customers — no retry of its own (the two callers
 * below each wrap this in `withRetry` with their own context/error
 * handling, same division of responsibility as callShopifyGraphql vs
 * shopifyGraphqlWithRetry in utils/shopifyGraphql.js).
 *
 * @param {Object} admin
 * @param {Object} [params]
 * @param {string|null} [params.cursor] - Opaque `endCursor` from a
 *   previous page, or null for the first page.
 * @param {number} [params.pageSize=250]
 * @returns {Promise<{ nodes: Array, pageInfo: { hasNextPage: boolean, endCursor: string|null } }>}
 * @throws {Error} "Invalid response from Shopify API" if the shape is
 *   unexpected, or whatever callShopifyGraphql itself throws (network,
 *   Throttled).
 */
async function fetchCustomersPage(admin, { cursor = null, pageSize = 250 } = {}) {
    const json = await callShopifyGraphql(
        admin,
        `#graphql
        query CustomerList($cursor: String, $first: Int!) {
            customers(first: $first, after: $cursor) {
                nodes {
                    ${CUSTOMER_FIELDS}
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
        }`,
        { cursor, first: pageSize }
    );

    const page = json.data?.customers;
    if (!page) throw new Error("Invalid response from Shopify API");
    return page;
}

/**
 * Total customers in the shop, without fetching any of them.
 *
 * Root-level aggregation, same approach and same reasoning as
 * ordersCount() further down: asking for a count is a different question
 * from asking for a list, and answering it by paging 80,000 records to
 * call .length on the result is not the same thing done more slowly — it
 * is a different, far more expensive query that also happens to produce
 * the number.
 *
 * `precision` is EXACT below Shopify's aggregation ceiling and AT_LEAST
 * above it. Both are returned rather than flattened: a confirmation
 * screen that says "80,278 customers" when the truth is "at least 80,278"
 * has quietly promised something it can't keep, and the caller is the
 * only one who knows whether that distinction matters to it.
 *
 * @param {Object} admin - Shopify Admin GraphQL client
 * @returns {Promise<{ count: number, precision: string }|null>} null on
 *   failure — the caller decides whether a missing count is fatal.
 */
export async function customersCount(admin) {
    try {
        const json = await shopifyGraphqlWithRetry(
            admin,
            `#graphql
            query CustomersCount {
                customersCount(limit: null) {
                    count
                    precision
                }
            }`,
            {},
            { context: { module: MODULE } }
        );

        const result = json.data?.customersCount;
        if (!result || typeof result.count !== "number") return null;

        return { count: result.count, precision: result.precision ?? "EXACT" };
    } catch (error) {
        logger.error(MODULE, "Failed to count customers", { error: error?.message });
        return null;
    }
}

/**
 * Yields the shop's customers ONE PAGE AT A TIME.
 *
 * This exists because customers() below — which accumulates every page
 * into a single array before its caller sees anything — has two problems
 * that are really the same problem:
 *
 *   1. MEMORY. A shop with 80,000 customers gets 80,000 fully-hydrated
 *      objects resident at once, each with nested email, phone and money
 *      sub-objects. That figure is set by how many customers the merchant
 *      has, not by anything this app controls, so it only goes up.
 *
 *   2. PROGRESS. Nothing outside can observe a loop that only speaks when
 *      it's finished. A sync built on it can report "started" and
 *      "done" and nothing in between — which, over the twenty-odd minutes
 *      80,000 customers takes, is indistinguishable from being stuck.
 *
 * A generator fixes both at once: the consumer processes each page and
 * drops it before the next is fetched, and it gets a natural point to
 * record how far along it is.
 *
 * Errors are THROWN, not swallowed into a null the way customers() does.
 * A partial sync that reports success is worse than a failed one — the
 * merchant would have no reason to run it again.
 *
 * @param {Object} admin
 * @param {Object} [options]
 * @param {number} [options.pageSize=250]
 * @yields {Array<Object>} one page of customer nodes
 */
export async function* customerPages(admin, { pageSize = 250 } = {}) {
    let cursor = null;
    let hasNextPage = true;
    let fetched = 0;

    while (hasNextPage) {
        // Each page retried independently on transient network failure —
        // without it a single blip late in an 80k sync throws away
        // everything already written.
        const data = await withRetry(
            () => fetchCustomersPage(admin, { cursor, pageSize }),
            {
                maxAttempts: 3,
                baseDelayMs: 800,
                retryableErrors: SHOPIFY_RETRYABLE_ERRORS,
                context: { module: MODULE, fetchedSoFar: fetched },
            }
        );

        fetched += data.nodes.length;

        yield data.nodes;

        hasNextPage = data.pageInfo.hasNextPage;
        cursor = data.pageInfo.endCursor;
    }
}

/**
 * Fetches all customers from the store using cursor-based pagination.
 * Iterates through all pages until no more results remain.
 *
 * PREFER customerPages() above for anything that processes what it gets.
 * This variant holds the entire result set in memory and reports nothing
 * until it's finished; it remains only for callers that genuinely need
 * the whole list at once.
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
                () => fetchCustomersPage(admin, { cursor, pageSize: 250 }),
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
// Customers (single page)
// ─────────────────────────────────────────────────────────────────────────────
//
// The `customersPage` export that used to live here has been removed. It
// existed solely for POINTS_BACKFILL, which paged the shop's entire
// customer list because Shopify deprecated the Customer search filters
// that would have narrowed it (Admin API 2024-07). That feature now reads
// a Shopify customer Segment instead — see
// graphql/query/customerSegmentMembers.js and
// server/jobs/snapshotBuildJob.js — so nothing called this any more, and
// leaving it in place would have left a documented rationale for a design
// the codebase no longer uses.

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
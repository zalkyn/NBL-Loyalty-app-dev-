import prisma from "../../app/db.server.js";
import { unauthenticated } from "../../app/shopify.server.js";
import { logger } from "../../app/utils/logger.js";
import { withRetry } from "../../app/utils/retry/withRetry.js";
import { dbRetry } from "../../app/utils/retry/dbRetry.js";
import { getPointRuleByEvent } from "../../app/controller/pointsRule/getPointRuleByEvent.js";
import createTransaction from "../../app/controller/transaction/createTransaction.js";
import { getAppstleMetafield } from "../../app/graphql/mutation/order/getAppstleMetafield.js";
import { createCustomerReward } from "../../app/controller/customerReward/createCustomerReward.js";
import { syncCustomerConfig } from "../../app/controller/metafieldsSync/syncCustomerConfig.js";
import { updateCustomerReward } from "../../app/controller/customerReward/updateCustomerReward.js";
import { updateReferral } from "../../app/controller/referral/updateReferral.js";
import { awardReferralEarn, awardFirstReferralReward, markReferralVoucherUsed } from "../../app/controller/referral/awardReferralReward.js";
import { notifyReferralOutcome } from "../../app/controller/referral/notifyReferralOutcome.js";
import getReferralAddresses from "../../app/graphql/query/referralAddresses.js";
import { assessReferral, describeSignals } from "../../app/utils/referralFraud.js";
import enqueueDiscountDeleteJob from "../../app/controller/jobs/enqueueDiscountDeleteJob.js";
import { callShopifyGraphql, SHOPIFY_RETRYABLE_ERRORS } from "../../app/utils/shopifyGraphql.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "orderPaidJob";

/**
 * Maximum number of PENDING jobs to process in a single poller cycle.
 * Prevents a backlog from causing a single cycle to run indefinitely.
 *
 * @constant {number}
 */
const BATCH_SIZE = 50;

/**
 * How long (ms) a job may remain in PROCESSING before it is considered
 * stale and re-queued. Covers server crash mid-execution scenarios.
 *
 * @constant {number}
 */
const STALE_LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Races a promise against a hard timeout deadline.
 * Rejects with "ETIMEDOUT" if the promise does not settle within the given ms.
 *
 * @template T
 * @param {Promise<T>} promise - The promise to race
 * @param {number}     ms      - Timeout in milliseconds
 * @returns {Promise<T>}
 */
const withTimeout = (promise, ms) =>
    Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error("ETIMEDOUT")), ms)
        ),
    ]);

/**
 * Returns a short human-readable order label e.g. "#1234".
 *
 * @param {Object} order - Shopify order payload
 * @returns {string}
 */
const getOrderLabel = (order) => {
    if (order?.name) return order.name;
    if (order?.order_number) return `#${order.order_number}`;
    const gid = order?.admin_graphql_api_id || "";
    return gid ? `#${gid.split("/").pop()}` : "your order";
};

// ─────────────────────────────────────────────────────────────────────────────
// Job Entry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main entry point called by jobManager on each cron cycle.
 *
 * Steps per cycle:
 *   1. Re-queue stale PROCESSING jobs (server crash recovery)
 *   2. Fetch up to BATCH_SIZE PENDING ORDER_PAID jobs
 *   3. Process each job sequentially
 *
 * Jobs are processed sequentially to avoid hammering the Shopify Admin
 * API with concurrent unauthenticated.admin() calls.
 *
 * @returns {Promise<void>}
 */
export async function runOrderPaidJob() {
    await requeueStaleJobs();

    const jobs = await dbRetry(
        () =>
            prisma.job.findMany({
                where: {
                    type: "ORDER_PAID",
                    status: "PENDING",
                    runAt: { lte: new Date() },
                },
                orderBy: { runAt: "asc" },
                take: BATCH_SIZE,
            }),
        { module: MODULE }
    );

    if (!jobs.length) {
        logger.info(MODULE, "No pending ORDER_PAID jobs — skipping cycle");
        return;
    }

    logger.info(MODULE, `Processing ${jobs.length} ORDER_PAID job(s)`);

    for (const job of jobs) {
        // Wrapped so one job's unexpected failure (including the claim-update
        // step below, which runs before processJob's own try/catch) can't
        // throw out of this loop and abort the rest of the batch.
        try {
            await processJob(job);
        } catch (err) {
            logger.error(MODULE, `Job #${job.id} threw outside its own error handling — skipping`, {
                shop: job.shop,
                error: err?.message,
            });
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stale Lock Recovery
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resets ORDER_PAID jobs stuck in PROCESSING back to PENDING.
 * Triggered at the start of every cycle as a crash-recovery guard.
 *
 * @returns {Promise<void>}
 */
async function requeueStaleJobs() {
    const staleThreshold = new Date(Date.now() - STALE_LOCK_TIMEOUT_MS);

    const { count } = await dbRetry(
        () =>
            prisma.job.updateMany({
                where: {
                    type: "ORDER_PAID",
                    status: "PROCESSING",
                    lockedAt: { lte: staleThreshold },
                },
                data: {
                    status: "PENDING",
                    lockedAt: null,
                    lastError: "Re-queued after stale lock detected (possible server crash)",
                },
            }),
        { module: MODULE }
    );

    if (count > 0) {
        logger.warn(MODULE, `Re-queued ${count} stale ORDER_PAID job(s)`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-Job Processor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Processes a single ORDER_PAID job end-to-end.
 *
 * Flow:
 *   1. Claim the job -> PROCESSING + lockedAt
 *   2. Authenticate shop + run mainHandler
 *   3a. Success -> COMPLETED
 *   3b. Failure -> increment attempts; exponential backoff retry or FAILED
 *
 * @param {{ id: number, shop: string, payload: object, attempts: number, maxAttempts: number }} job
 * @returns {Promise<void>}
 */
async function processJob(job) {
    const { id, shop, payload, attempts, maxAttempts } = job;
    const { orderId, customerId } = payload;

    // ── 1. Claim ──────────────────────────────────────────────────────────────
    // Conditional on status still being PENDING — the previous unconditional
    // `update({ where: { id } })` always "succeeds" even if another replica
    // already claimed and started this same job a moment earlier (both
    // replicas' findMany in runOrderPaidJob can return the same PENDING row
    // before either one's claim lands). Checking the affected row count
    // makes this the actual point of truth for "did *we* get this job" —
    // count === 0 means someone else already claimed it, so we back off
    // instead of both processing the same order (double points, double
    // discount codes).
    const claim = await dbRetry(
        () =>
            prisma.job.updateMany({
                where: { id, status: "PENDING" },
                data: { status: "PROCESSING", lockedAt: new Date() },
            }),
        { module: MODULE, jobId: id }
    );

    if (claim.count === 0) {
        logger.info(MODULE, `Job #${id} already claimed by another process — skipping`, { shop, orderId });
        return;
    }

    logger.info(MODULE, `Processing job #${id}`, { shop, orderId, attempt: attempts + 1, maxAttempts });

    try {
        // ── 2. Authenticate + process ─────────────────────────────────────────
        const { admin, session } = await unauthenticated.admin(shop);

        if (!session) throw new Error(`No active session for shop: ${shop}`);

        await mainHandler({ admin, session, shop, orderId, customerId, isLastAttempt: attempts + 1 >= maxAttempts });

        // ── 3a. Success ───────────────────────────────────────────────────────
        await dbRetry(
            () =>
                prisma.job.update({
                    where: { id },
                    data: {
                        status: "COMPLETED",
                        lockedAt: null,
                        completedAt: new Date(),
                        attempts: attempts + 1,
                    },
                }),
            { module: MODULE, jobId: id }
        );

        logger.success(MODULE, `Job #${id} completed`, { shop, orderId });
    } catch (err) {
        const nextAttempt = attempts + 1;
        const exhausted = nextAttempt >= maxAttempts;

        // ── 3b. Failure — exponential backoff: 2min -> 4min -> 8min ────────────
        const backoffMs = exhausted
            ? 0
            : Math.min(2 ** nextAttempt * 60 * 1000, 30 * 60 * 1000);

        await dbRetry(
            () =>
                prisma.job.update({
                    where: { id },
                    data: {
                        status: exhausted ? "FAILED" : "PENDING",
                        lockedAt: null,
                        attempts: nextAttempt,
                        lastError: err?.message,
                        failedAt: exhausted ? new Date() : null,
                        runAt: exhausted ? undefined : new Date(Date.now() + backoffMs),
                    },
                }),
            { module: MODULE, jobId: id }
        ).catch((updateErr) => {
            // Best-effort — if even the failure-status write fails, log it
            // separately so the job isn't left silently stuck in PROCESSING.
            logger.error(MODULE, `Failed to record failure for job #${id}`, { error: updateErr?.message });
        });

        if (exhausted) {
            logger.error(MODULE, `Job #${id} permanently failed`, { shop, orderId, error: err?.message });
        } else {
            logger.warn(MODULE, `Job #${id} failed — retrying in ${backoffMs / 1000}s`, {
                shop, orderId, attempt: nextAttempt, maxAttempts, error: err?.message,
            });
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Fetcher
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches the full order from Shopify Admin API including the Appstle
 * subscription metafield — in a single GraphQL query.
 *
 * Combining the metafield fetch with the order fetch means the caller
 * (mainHandler) can run this and getAppstleMetafield in parallel:
 *   - fetchFullOrder  -> order fields + raw Appstle metafield value
 *   - getAppstleMetafield -> product.sellingPlanGroups (interval resolution)
 *
 * Both run simultaneously, reducing total latency from 3 sequential calls
 * to 2 parallel calls.
 *
 * Returns null if the order is not found or the query fails — the caller
 * should skip processing gracefully rather than throw.
 *
 * @param {Object} admin   - Shopify Admin GraphQL client
 * @param {string} orderId - Full order GID
 * @returns {Promise<{ order: object, appstle: object|null }|null>}
 */
async function fetchFullOrder(admin, orderId) {
    const json = await callShopifyGraphql(
        admin,
        `#graphql
        query GetOrderWithAppstle($id: ID!) {
            order(id: $id) {
                id
                name
                orderNumber: number
                discountCodes
                lineItems(first: 250) {
                    edges {
                        node {
                            quantity
                            originalUnitPriceSet {
                                shopMoney { amount }
                            }
                            product { id }
                            sellingPlan { sellingPlanId }
                        }
                    }
                }
                currentTotalPriceSet {
                    shopMoney { amount }
                }
                cancelledAt
                appstle_subscription: metafield(
                    key: "details"
                    namespace: "appstle_subscription"
                ) {
                    value: jsonValue
                }
            }
        }`,
        { id: orderId }
    );

    const raw = json?.data?.order ?? null;

    if (!raw) return null;

    // Normalize GraphQL shape -> REST-style shape expected by handlers
    const order = {
        name: raw.name,
        order_number: raw.orderNumber,
        // line_items: map GraphQL nodes to the flat shape handlers expect
        line_items: (raw.lineItems?.edges ?? []).map(({ node }) => ({
            product_id: node.product?.id?.replace("gid://shopify/Product/", "") ?? null,
            price: node.originalUnitPriceSet?.shopMoney?.amount ?? "0",
            quantity: node.quantity ?? 1,
        })),
        // discount_codes: Shopify returns string[] on GraphQL, normalize to [{ code }]
        discount_codes: (raw.discountCodes ?? []).map((code) => ({ code })),
        // total_price: stored on the EARN transaction's metadata so a later
        // orders/cancelled or refunds/create webhook can compute what
        // proportion of the order (and therefore of the earned points) was
        // reversed, without an extra Shopify API call.
        total_price: raw.currentTotalPriceSet?.shopMoney?.amount ?? "0",
        // cancelled_at: checked in mainHandler right before awarding points —
        // closes the race where an order is cancelled before this job runs
        // (webhook order isn't guaranteed: ORDER_REVERSED could be enqueued
        // and even attempt to run before ORDER_PAID is processed).
        cancelled_at: raw.cancelledAt ?? null,
        // Shopify itself marks subscription line items at checkout (sellingPlan),
        // independent of Appstle. Used to tell "one-time order" apart from
        // "subscription order whose Appstle metafield isn't attached yet".
        has_selling_plan: (raw.lineItems?.edges ?? []).some(({ node }) => Boolean(node?.sellingPlan)),
    };

    // Raw Appstle metafield value — passed directly to getAppstleMetafield
    // so it can resolve the interval without a second metafield fetch
    const appstle = raw.appstle_subscription?.value ?? null;

    return { order, appstle };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orchestrates the full order processing flow for a single job.
 *
 * Fetches the customer and Appstle metafield in parallel, then delegates
 * to the referral or normal order handler. Always runs voucherUpdateIfAvailable
 * at the end regardless of order type.
 *
 * @param {Object} params
 * @param {Object} params.admin      - Shopify Admin GraphQL client
 * @param {Object} params.session    - Shopify session
 * @param {string} params.shop       - Shop domain
 * @param {string} params.orderId    - Shopify order GID
 * @param {string} params.customerId - Shopify customer GID
 * @returns {Promise<void>}
 */
async function mainHandler({ admin, session, shop, orderId, customerId, isLastAttempt = false }) {
    if (!customerId) {
        logger.warn(MODULE, "No customer GID in job payload — skipping", { shop, orderId });
        return;
    }

    // Fetch customer + full order (with Appstle metafield) in parallel.
    //
    // fetchFullOrder fetches order fields AND the Appstle metafield in a
    // single GraphQL query. getAppstleMetafield then uses that pre-fetched
    // metafield value to resolve the interval (one more product API call).
    //
    // Total: 2 parallel calls instead of 3 sequential calls.
    //   Call A: DB customer fetch  (no network)
    //   Call B: Shopify order + metafield (1 GraphQL)
    //   Call C (after B): product.sellingPlanGroups (1 GraphQL, only if subscription)
    //
    // Wrapped in withRetry + withTimeout to guard against transient Shopify
    // API failures that would silently skip the entire order.
    const [customer, fullOrderRes] = await Promise.all([
        dbRetry(
            () =>
                prisma.customer.findFirst({
                    where: { shopifyId: customerId },
                    include: { referralsUsed: true },
                }),
            { module: MODULE, shop, customerId }
        ),
        withRetry(
            () => withTimeout(fetchFullOrder(admin, orderId), 8000),
            {
                maxAttempts: 3,
                baseDelayMs: 800,
                retryableErrors: SHOPIFY_RETRYABLE_ERRORS,
                context: { shop, orderId, module: MODULE },
            }
        ),
    ]);

    if (!customer) {
        logger.warn(MODULE, "Customer not found in DB — skipping", { shop, customerId });
        return;
    }

    if (!fullOrderRes) {
        logger.warn(MODULE, "Order not found in Shopify — skipping", { shop, orderId });
        return;
    }

    const { order: orderFields, appstle: appstleData } = fullOrderRes;

    // ── Cancelled-order guard ────────────────────────────────────────────────
    // Closes the race where a customer cancels an order before this job gets
    // to run (e.g. ORDER_REVERSED processed first, found nothing to reverse
    // yet, then this job would otherwise still award points for an order
    // that's already cancelled). Re-checks live Shopify state right before
    // awarding, using data already fetched in the same GraphQL call above —
    // no extra API cost.
    if (orderFields.cancelled_at) {
        logger.warn(MODULE, "Order already cancelled — skipping points award", {
            shop, orderId, cancelledAt: orderFields.cancelled_at,
        });
        return;
    }

    // ── Appstle metafield not attached yet ───────────────────────────────────
    // Appstle writes its "details" metafield onto the order a little AFTER the
    // orders/paid webhook fires, and this job can run within seconds. Without
    // it the order used to be classified as one-time, so a subscription-only
    // rule skipped it — silently, with the job marked complete and never
    // re-checked. Shopify marks subscription line items (sellingPlan) at
    // checkout, so a selling-plan order with no metafield is "not ready yet",
    // not "one-time": fail the job so it retries with backoff. Done BEFORE the
    // order-count increment below so a retry can't count the order twice.
    // On the last attempt fall through to the old behaviour (the order may be
    // from a subscription app other than Appstle) but say so loudly.
    if (orderFields.has_selling_plan && !appstleData) {
        if (!isLastAttempt) {
            throw new Error("APPSTLE_METAFIELD_PENDING: order has a selling plan but Appstle details are not attached yet");
        }
        logger.warn(MODULE, "Subscription order still has no Appstle details after all retries — treating as one-time", {
            shop, orderId,
        });
    }

    // ── Cached order-count maintenance ──────────────────────────────────────
    // Keeps Customer.orders in sync incrementally so the admin dashboard can
    // read it directly instead of calling Shopify's API on every page view
    // (see app/layout/customers/$id/_loader.server.js). Runs regardless of
    // whether this order matches a points rule — the order genuinely
    // happened either way. If the cache is still null (never backfilled —
    // see schema.prisma), Postgres leaves a NULL+1 increment as NULL, which
    // is fine: it self-heals the next time an admin opens this customer's
    // detail page. Best-effort — never let this block points awarding.
    try {
        await dbRetry(
            () =>
                prisma.customer.update({
                    where: { id: customer.id },
                    data: { orders: { increment: 1 } },
                }),
            { module: MODULE, shop, customerId: customer.id }
        );
    } catch (err) {
        logger.error(MODULE, "Failed to increment cached order count", {
            shop, orderId, customerId: customer.id, error: err?.message,
        });
    }

    // Resolve subscription interval — uses the pre-fetched appstle metafield
    // so getAppstleMetafield only needs one API call (product.sellingPlanGroups)
    const appstle = await withRetry(
        () => withTimeout(getAppstleMetafield(admin, appstleData, orderId), 8000),
        {
            maxAttempts: 5,
            baseDelayMs: 1000,
            retryableErrors: ["fetch failed", "ECONNRESET", "ETIMEDOUT"],
            context: { shop, orderId, module: MODULE },
        }
    );

    const { subscriptionContract, subscriptionInterval, isSubscription } = appstle;

    // Merge fetched order fields with the GID
    const order = { admin_graphql_api_id: orderId, ...orderFields };

    const referralContext = detectReferralOrder({ order, customer, contract: subscriptionContract });

    logger.info(MODULE, "Referral context resolved", {
        shop, orderId, ...referralContext, subscriptionInterval, isSubscription,
    });

    if (!referralContext.isReferralOrder) {
        await handleNormalOrder({ admin, order, customer, session, shop, subscriptionInterval, isSubscription });
    } else {
        await handleReferral({ admin, referralContext, order, customer, subscriptionContract, subscriptionInterval, isSubscription, session, shop });
    }

    // Always run — referral orders may also have separate reward vouchers applied
    await voucherUpdateIfAvailable({ admin, order, customer, shop, session });
}

// ─────────────────────────────────────────────────────────────────────────────
// Referral Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determines whether an order qualifies as a referral order.
 *
 * Two referral types:
 *   FIRST     — order contains the referral discount code (first purchase)
 *   RECURRING — order is tied to a subscription contract linked to a referral
 *
 * @param {Object}      params
 * @param {Object}      params.order    - Shopify order payload
 * @param {Object}      params.customer - DB customer record (with referralsUsed)
 * @param {Object|null} params.contract - Appstle subscription contract
 * @returns {{ isReferralOrder: boolean, type?: "FIRST"|"RECURRING", referral?: Object }}
 */
const detectReferralOrder = ({ order, customer, contract }) => {
    const referral = customer?.referralsUsed;
    if (!referral) return { isReferralOrder: false };

    // Case-insensitive: Shopify itself treats discount codes as
    // case-insensitive at checkout, but order.discount_codes[].code reflects
    // whatever case the customer actually typed (copy-paste preserves our
    // stored uppercase, but manual entry — especially mobile autocapitalize/
    // autocorrect — can change it). An exact-case match here would silently
    // never mark the referral as used even though Shopify already applied
    // the discount, leaving the widget showing "code ready" indefinitely.
    const discountMatch = order?.discount_codes?.find(
        (d) => d.code?.toUpperCase() === referral.discountCode?.toUpperCase()
    );
    if (discountMatch) return { isReferralOrder: true, type: "FIRST", referral };

    if (
        contract?.id &&
        referral.subscriptionContractId === contract.id?.toString() &&
        contract.currentCycle > 1
    ) {
        return { isReferralOrder: true, type: "RECURRING", referral };
    }

    return { isReferralOrder: false };
};

// ─────────────────────────────────────────────────────────────────────────────
// Points Resolvers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves points for a single line item using the P1->P4 priority chain.
 *
 * Priority (highest -> lowest):
 *   P4 — product is in a group AND interval matches
 *   P3 — product is in a group, no interval match
 *   P2 — product not in any group, interval matches
 *   P1 — global fallback
 *
 * @param {Object}      item     - Shopify line_item
 * @param {Object}      ord      - conditions.order object
 * @param {string|null} interval - Resolved subscription interval e.g. "monthly"
 * @returns {number} Points for this line item
 */
const resolveLineItemPoints = (item, ord, interval) => {
    if (!item?.product_id) return 0;

    const productGid = `gid://shopify/Product/${item.product_id}`;
    const itemTotal = Number(item.price) * (item.quantity || 1);

    // Excluded products never earn points
    const isExcluded = (ord.excludedProducts ?? []).some((p) => p.id === productGid);
    if (isExcluded) return 0;

    const group = (ord.groups ?? []).find((g) =>
        g.products.some((p) => p.id === productGid)
    );

    if (group) {
        if (interval) {
            const iv = (group.intervals ?? []).find((i) => i.interval === interval);
            if (iv) return calcPoints(ord.type, iv, itemTotal); // P4
        }
        return calcPoints(ord.type, group, itemTotal); // P3
    }

    if (interval) {
        const iv = (ord.intervals ?? []).find((i) => i.interval === interval);
        if (iv) return calcPoints(ord.type, iv, itemTotal); // P2
    }

    return calcPoints(ord.type, ord, itemTotal); // P1
};

/**
 * Calculates points from a rule object based on earning type.
 *
 * @param {"fixed"|"incremental"} type
 * @param {Object} rule      - Object with fixedPoints or rate.{ amount, points }
 * @param {number} itemTotal - Line item total (price × quantity)
 * @returns {number}
 */
const calcPoints = (type, rule, itemTotal) => {
    if (type === "incremental") {
        const { amount, points } = rule.rate ?? {};
        if (amount > 0) return Math.floor(itemTotal / amount) * points;
        return 0;
    }
    return Number(rule.fixedPoints) || 0;
};

/**
 * Resolves total points for an order by summing per-line-item points.
 * Respects trigger (oneTime / subscription / both) before calculating.
 *
 * @param {Object}      order          - Shopify order payload
 * @param {Object}      conditions     - Full pointsRule conditions object
 * @param {string|null} interval       - Resolved subscription interval
 * @param {boolean}     isSubscription
 * @returns {number} Total points to award
 */
const resolveOrderPoints = (order, conditions, interval, isSubscription) => {
    const ord = conditions?.order;
    if (!ord) {
        logger.warn(MODULE, "resolveOrderPoints: conditions.order is missing");
        return 0;
    }

    if (ord.trigger === "oneTime" && isSubscription) return 0;
    if (ord.trigger === "subscription" && !isSubscription) return 0;

    const items = order?.line_items ?? [];
    if (!items.length) return 0;

    return items.reduce((total, item) => total + resolveLineItemPoints(item, ord, interval), 0);
};

/**
 * Resolves referrer + referred points using the P1->P4 priority chain.
 *
 * For RECURRING (renewal):
 *   - Uses renewalPoints instead of points
 *   - Respects allowRenewalReward at group or global level
 *
 * @param {Object}      conditions  - Full pointsRule conditions object
 * @param {Array}       lineItems   - Shopify order line_items
 * @param {string|null} interval    - Resolved subscription interval
 * @param {boolean}     isRenewal   - true for RECURRING, false for FIRST
 * @returns {{ referrerPoints: number, referredPoints: number }}
 */
const resolveReferralPoints = (conditions, lineItems, interval, isRenewal) => {
    const ref = conditions?.referral;
    if (!ref) {
        logger.warn(MODULE, "resolveReferralPoints: conditions.referral is missing");
        return { referrerPoints: 0, referredPoints: 0 };
    }

    let resolved = null;

    for (const item of lineItems ?? []) {
        const productGid = `gid://shopify/Product/${item.product_id}`;
        const group = (ref.groups ?? []).find((g) =>
            g.products.some((p) => p.id === productGid)
        );

        if (group) {
            if (interval) {
                const iv = (group.intervals ?? []).find((i) => i.interval === interval);
                if (iv) {
                    resolved = { // P4
                        referrerPoints: isRenewal ? iv.referrer.renewalPoints : iv.referrer.points,
                        referredPoints: isRenewal ? iv.referred.renewalPoints : iv.referred.points,
                        referrerAllowRenewal: group.referrer.allowRenewalReward,
                        referredAllowRenewal: group.referred.allowRenewalReward,
                    };
                    break;
                }
            }
            resolved = { // P3
                referrerPoints: isRenewal ? group.referrer.renewalPoints : group.referrer.points,
                referredPoints: isRenewal ? group.referred.renewalPoints : group.referred.points,
                referrerAllowRenewal: group.referrer.allowRenewalReward,
                referredAllowRenewal: group.referred.allowRenewalReward,
            };
            break;
        }
    }

    if (!resolved && interval) {
        const iv = (ref.intervals ?? []).find((i) => i.interval === interval);
        if (iv) {
            resolved = { // P2
                referrerPoints: isRenewal ? iv.referrer.renewalPoints : iv.referrer.points,
                referredPoints: isRenewal ? iv.referred.renewalPoints : iv.referred.points,
                referrerAllowRenewal: ref.referrer.allowRenewalReward,
                referredAllowRenewal: ref.referred.allowRenewalReward,
            };
        }
    }

    if (!resolved) {
        resolved = { // P1 — global fallback
            referrerPoints: isRenewal ? ref.referrer.renewalPoints : ref.referrer.points,
            referredPoints: isRenewal ? ref.referred.renewalPoints : ref.referred.points,
            referrerAllowRenewal: ref.referrer.allowRenewalReward,
            referredAllowRenewal: ref.referred.allowRenewalReward,
        };
    }

    if (isRenewal) {
        return {
            referrerPoints: resolved.referrerAllowRenewal ? (resolved.referrerPoints ?? 0) : 0,
            referredPoints: resolved.referredAllowRenewal ? (resolved.referredPoints ?? 0) : 0,
        };
    }

    return {
        referrerPoints: resolved.referrerPoints ?? 0,
        referredPoints: resolved.referredPoints ?? 0,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// Normal Order Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Awards points for a standard (non-referral) order.
 * Uses per-product P1->P4 priority resolution.
 *
 * @param {Object}      params
 * @param {Object}      params.admin
 * @param {Object}      params.order
 * @param {Object}      params.customer
 * @param {Object}      params.session
 * @param {string}      params.shop
 * @param {string|null} params.subscriptionInterval
 * @param {boolean}     params.isSubscription
 * @returns {Promise<void>}
 */
const handleNormalOrder = async ({ admin, order, customer, session, shop, subscriptionInterval, isSubscription }) => {
    // getPointRuleByEvent retries transient DB errors internally.
    const rule = await getPointRuleByEvent("ORDER", session.id);

    if (!rule?.isActive) {
        logger.warn(MODULE, "ORDER rule inactive — skipping", { shop });
        return;
    }

    const orderLabel = getOrderLabel(order);
    const points = resolveOrderPoints(order, rule.conditions, subscriptionInterval, isSubscription);

    if (points <= 0) {
        logger.info(MODULE, "Order earned 0 points (trigger mismatch or all excluded) — skipping", {
            shop, orderLabel, subscriptionInterval, isSubscription,
        });
        return;
    }

    logger.info(MODULE, "Order points resolved", { shop, points, orderLabel, subscriptionInterval });

    // A retried job (automatic, or the merchant's "Retry failed orders") must
    // never pay the same order twice: if this customer already has an EARN for
    // this order under this rule, the points are already there.
    const alreadyEarned = await dbRetry(
        () =>
            prisma.transaction.findFirst({
                where: {
                    customerId: customer.id,
                    type: "EARN",
                    pointsRuleId: rule.id,
                    metadata: { path: ["orderId"], equals: order.admin_graphql_api_id },
                },
                select: { id: true },
            }),
        { module: MODULE, shop, orderId: order.admin_graphql_api_id }
    );
    if (alreadyEarned) {
        logger.warn(MODULE, "Order points already recorded — not awarding twice", {
            shop, orderLabel, customerId: customer.id, transactionId: alreadyEarned.id,
        });
        return;
    }

    const earnTransaction = await createTransaction(
        {
            customerId: customer.id,
            type: "EARN",
            eventId: rule.event.id,
            pointsRuleId: rule.id,
            reason: `Points earned for order ${orderLabel}`,
            activity: `+${points} points for order ${orderLabel}`,
            points,
            status: "COMPLETED",
            // orderId + orderTotal let orderReversalJob find and proportionally
            // reverse these points on orders/cancelled or refunds/create.
            metadata: {
                orderId: order.admin_graphql_api_id,
                orderTotal: order.total_price,
                // Lets the subscription-cancel job tell that a customer who
                // cancelled has since paid for a subscription again.
                ...(isSubscription ? { subscription: true } : {}),
            },
        },
        session
    );
    // createTransaction returns null on failure rather than throwing; without this
    // the job would be marked complete with no points recorded.
    if (!earnTransaction) {
        throw new Error(`Order points could not be recorded for customer ${customer.id} (${orderLabel})`);
    }

    // Non-critical — points already saved. syncCustomerConfig retries transient
    // network failures internally and never throws, so no outer retry/catch needed.
    await syncCustomerConfig(admin, customer.shopifyId);

    logger.success(MODULE, "Normal order handled", { shop, points, orderLabel, customerId: customer.id });
};

// ─────────────────────────────────────────────────────────────────────────────
// Referral Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handles points and reward creation for referral orders (FIRST and RECURRING).
 *
 * @param {Object}      params
 * @param {Object}      params.admin
 * @param {Object}      params.referralContext    - Output of detectReferralOrder()
 * @param {Object}      params.order
 * @param {Object}      params.customer           - DB customer who placed this order (the referred customer on FIRST orders)
 * @param {Object|null} params.subscriptionContract
 * @param {string|null} params.subscriptionInterval
 * @param {boolean}     params.isSubscription
 * @param {Object}      params.session
 * @param {string}      params.shop
 * @returns {Promise<void>}
 */
/**
 * A FIRST-order referral that earns nothing because of the rule's settings.
 * The discount code was still used on this order, so the referral is closed
 * (otherwise the widget keeps showing "code ready" forever), the reason is
 * kept on the referral, and both customers are told.
 */
const closeSkippedFirstReferral = async ({ admin, referral, order, subscriptionContract, session, shop, reason, notice }) => {
    const orderGid = order.admin_graphql_api_id;

    await updateReferral(referral.id, {
        status: "USED",
        discountUsed: true,
        rewardGiven: false,
        orderId: orderGid,
        subscriptionContractId: subscriptionContract?.id?.toString() ?? null,
        metadata: { ...(subscriptionContract ?? {}), skipped: { reason, at: new Date().toISOString(), orderId: orderGid } },
    });
    await markReferralVoucherUsed({ referral, orderGid });

    // The referred customer used a discount; only the referrer missed out on points,
    // so only the referrer needs the explanation.
    await notifyReferralOutcome({ session, shop, referralId: referral.id, customerId: referral.referrerId, notice, orderGid });
    await syncCustomerConfig(admin, referral.referrerId);
};

const handleReferral = async ({ admin, referralContext, order, customer, subscriptionContract, subscriptionInterval, isSubscription, session, shop }) => {
    // getPointRuleByEvent retries transient DB errors internally.
    const rule = await getPointRuleByEvent("REFERRAL", session.id);

    if (!rule?.isActive) {
        logger.warn(MODULE, "REFERRAL rule inactive — referral reward skipped", {
            shop, referralId: referralContext?.referral?.id, orderId: order?.admin_graphql_api_id,
        });
        if (referralContext?.type === "FIRST" && !referralContext.referral.discountUsed) {
            await closeSkippedFirstReferral({
                admin, referral: referralContext.referral, order, subscriptionContract, session, shop,
                reason: "referral rule inactive", notice: "SKIPPED_PROGRAM_INACTIVE",
            });
        }
        return;
    }

    const conditions = rule.conditions;
    const refConditions = conditions.referral;
    const { type, referral } = referralContext;
    const orderLabel = getOrderLabel(order);
    const lineItems = order?.line_items ?? [];

    // A referral held for merchant review (or rejected) must not earn anything —
    // including on later renewals of the same subscription.
    if (referral.status === "HELD" || referral.status === "REJECTED") {
        logger.warn(MODULE, `Referral is ${referral.status} — no reward for this order`, {
            shop, type, referralId: referral.id, orderId: order.admin_graphql_api_id,
        });
        return;
    }

    // ── Trigger check ─────────────────────────────────────────────────────────
    if (refConditions.trigger === "oneTime" && isSubscription) {
        // warn, not info: production only prints warn and above, and a skipped
        // referral reward must be traceable after the fact.
        logger.warn(MODULE, "REFERRAL trigger=oneTime but order is subscription — referral reward skipped", {
            shop, type, referralId: referral?.id, orderId: order.admin_graphql_api_id, isSubscription,
        });
        if (type === "FIRST" && !referral.discountUsed) {
            await closeSkippedFirstReferral({
                admin, referral, order, subscriptionContract, session, shop,
                reason: "rule is one-time orders only; order was a subscription", notice: "SKIPPED_ONE_TIME_ONLY",
            });
        }
        return;
    }
    if (refConditions.trigger === "subscription" && !isSubscription) {
        logger.warn(MODULE, "REFERRAL trigger=subscription but order is one-time — referral reward skipped", {
            shop, type, referralId: referral?.id, orderId: order.admin_graphql_api_id, isSubscription,
        });
        if (type === "FIRST" && !referral.discountUsed) {
            await closeSkippedFirstReferral({
                admin, referral, order, subscriptionContract, session, shop,
                reason: "rule is subscription orders only; order was one-time", notice: "SKIPPED_SUBSCRIPTION_ONLY",
            });
        }
        return;
    }

    // ── FIRST referral order ──────────────────────────────────────────────────
    if (type === "FIRST") {
        if (referral.discountUsed) {
            logger.warn(MODULE, "Referral discount already used — skipping", {
                shop, referralId: referral.id, orderId: order.admin_graphql_api_id,
            });
            return;
        }

        const { referrerPoints, referredPoints } = resolveReferralPoints(conditions, lineItems, subscriptionInterval, false);

        const orderGid = order.admin_graphql_api_id;

        // ── Self-dealing check ────────────────────────────────────────────────
        // Compare the two accounts before anything is awarded. HOLD parks the
        // reward for the merchant to approve or reject (the referral discount
        // was already applied by Shopify); FLAG rewards as usual but records
        // the signal. A failed address lookup throws so the job retries —
        // the check is never skipped silently.
        const referrerCustomer = await dbRetry(
            () => prisma.customer.findUnique({
                where: { id: referral.referrerId },
                select: { shopifyId: true, name: true, firstName: true, lastName: true },
            }),
            { module: MODULE, shop, referralId: referral.id }
        );
        const { referrerAddresses, referredAddresses } = await getReferralAddresses(admin, {
            referrerGid: referrerCustomer?.shopifyId,
            referredGid: customer?.shopifyId,
            orderGid,
        });
        const assessment = assessReferral({
            referrer: referrerCustomer ?? {},
            referred: customer ?? {},
            referrerAddresses,
            referredAddresses,
        });

        if (assessment.decision === "HOLD") {
            await updateReferral(referral.id, {
                status: "HELD",
                // Shopify already consumed the discount code on this order.
                discountUsed: true,
                rewardGiven: false,
                orderId: orderGid,
                subscriptionContractId: subscriptionContract?.id?.toString() ?? null,
                metadata: {
                    ...(subscriptionContract ?? {}),
                    hold: {
                        heldAt: new Date().toISOString(),
                        signals: assessment.signals,
                        reason: describeSignals(assessment.signals),
                        orderId: orderGid,
                        orderLabel,
                        orderTotal: order.total_price,
                        referrerPoints,
                        referredPoints,
                        subscriptionInterval: subscriptionInterval ?? null,
                    },
                },
            });
            await markReferralVoucherUsed({ referral, orderGid });

            await notifyReferralOutcome({ session, shop, referralId: referral.id, customerId: referral.referrerId, notice: "HELD_REFERRER", orderGid });
            await notifyReferralOutcome({ session, shop, referralId: referral.id, customerId: referral.referredId, notice: "HELD_REFERRED", orderGid });

            logger.warn(MODULE, "Referral reward HELD for merchant review", {
                shop, referralId: referral.id, orderId: orderGid, signals: assessment.signals,
            });
            await Promise.all([
                syncCustomerConfig(admin, referral.referrerId),
                syncCustomerConfig(admin, referral.referredId),
            ]);
            return;
        }

        if (assessment.decision === "FLAG") {
            logger.warn(MODULE, "Referral rewarded but flagged for review", {
                shop, referralId: referral.id, orderId: orderGid, signals: assessment.signals,
            });
        }

        await awardFirstReferralReward({
            session, shop, referral, eventId: rule.event.id, orderGid, orderLabel,
            orderTotal: order.total_price, referrerPoints, referredPoints, subscriptionContract,
            extraMetadata: assessment.decision === "FLAG"
                ? { reviewFlag: { signals: assessment.signals, reason: describeSignals(assessment.signals), orderId: orderGid } }
                : {},
        });

        // Non-critical — referral and transactions already committed.
        // syncCustomerConfig retries transient failures internally and never throws.
        await Promise.all([
            syncCustomerConfig(admin, referral.referrerId),
            syncCustomerConfig(admin, referral.referredId),
        ]);

        logger.success(MODULE, "Referral FIRST order handled", { shop, referralId: referral.id, referrerPoints, referredPoints, orderLabel });
        return;
    }

    // ── RECURRING referral (subscription renewal) ─────────────────────────────
    if (type === "RECURRING") {
        const orderGid = order.admin_graphql_api_id;

        const { referrerPoints, referredPoints } = resolveReferralPoints(conditions, lineItems, subscriptionInterval, true);

        // Duplicate protection (Shopify's at-least-once delivery, job retries)
        // is per customer inside awardReferralEarn. The old guard here queried
        // Reward.referralId, a column that does not exist — Prisma rejected the
        // query, so every renewal failed before awarding anything.
        const awards = [];
        if (referrerPoints > 0) {
            awards.push({
                customerId: referral.referrerId,
                points: referrerPoints,
                reason: `Subscription renewal reward — referred customer renewed (${orderLabel})`,
                activity: `+${referrerPoints} points for referral renewal`,
                title: "Referral renewal reward",
                description: `Your referred customer renewed their subscription. You earned ${referrerPoints} points.`,
            });
        }
        if (referredPoints > 0) {
            awards.push({
                customerId: referral.referredId,
                points: referredPoints,
                reason: `Subscription renewal reward — earned for renewing subscription (${orderLabel})`,
                activity: `+${referredPoints} points for subscription renewal`,
                title: "Subscription renewal reward",
                description: `You earned ${referredPoints} points for renewing your subscription.`,
            });
        }

        for (const a of awards) {
            await awardReferralEarn({
                session, shop, referral, orderGid,
                input: {
                    customerId: a.customerId,
                    type: "EARN",
                    eventId: rule.event.id,
                    referralId: referral.id,
                    reason: a.reason,
                    activity: a.activity,
                    points: a.points,
                    status: "COMPLETED",
                    metadata: { orderId: orderGid, orderTotal: order.total_price },
                },
            });
            // Idempotent on its own (rewardKey is deterministic per customer +
            // order); a duplicate comes back null and is not an error.
            await createCustomerReward({
                customerId: a.customerId,
                event: "REFERRAL",
                type: "RECURRING",
                title: a.title,
                description: a.description,
                orderId: orderGid,
                referralId: referral.id,
                status: "COMPLETED",
            });
        }

        // Keep what was recorded on the first order (a review flag, or the
        // merchant's approval); only the contract part is refreshed.
        await updateReferral(referral.id, {
            metadata: {
                ...(subscriptionContract ?? {}),
                ...(referral.metadata?.reviewFlag ? { reviewFlag: referral.metadata.reviewFlag } : {}),
                ...(referral.metadata?.approval ? { approval: referral.metadata.approval } : {}),
            },
        });

        // Non-critical — syncCustomerConfig retries transient failures internally and never throws.
        await Promise.all([
            syncCustomerConfig(admin, referral.referrerId),
            syncCustomerConfig(admin, referral.referredId),
        ]);

        logger.success(MODULE, "Referral RECURRING order handled", { shop, referralId: referral.id, referrerPoints, referredPoints, orderLabel });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Voucher Update
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marks reward vouchers as USED if their discount code was applied on this order.
 * Runs after both normal and referral order handling.
 *
 * @param {Object} params
 * @param {Object} params.admin
 * @param {Object} params.order
 * @param {Object} params.customer
 * @param {string} params.shop
 * @param {Object} params.session
 * @returns {Promise<void>}
 */
const voucherUpdateIfAvailable = async ({ admin, order, customer, shop, session }) => {
    try {
        if (!order || !customer?.id) return;

        const orderDiscountCodes = order?.discount_codes ?? [];
        if (!orderDiscountCodes.length) return;

        // Normalize to uppercase — DB codes are always generated uppercase
        // (generateDiscountCode.js), but a customer typing the code by hand
        // at checkout (rather than copy-pasting) can submit it in a
        // different case, which would otherwise silently miss this `in`
        // filter and leave an already-redeemed voucher looking unused.
        const discountCodeSet = new Set(
            orderDiscountCodes.map((d) => d?.code?.toUpperCase()).filter(Boolean)
        );
        if (!discountCodeSet.size) return;

        const rewards = await dbRetry(
            () =>
                prisma.reward.findMany({
                    where: {
                        customerId: customer.id,
                        code: { in: [...discountCodeSet] },
                        status: { notIn: ["USED", "EXPIRED", "CANCELLED", "REDEEMED"] },
                    },
                    select: { id: true, code: true, title: true, discountNodeId: true },
                }),
            { module: MODULE, shop, customerId: customer.id }
        );

        if (!rewards.length) return;

        const orderLabel = getOrderLabel(order);

        await Promise.all(
            rewards.map((reward) => {
                // Non-critical, fire-and-forget — see the matching comment
                // in customers/$id/_action.server.js's handleCancelReward.
                // Deliberately NOT part of the Promise.all below: order
                // processing must never wait on this hygiene step.
                enqueueDiscountDeleteJob({
                    shop,
                    discountNodeId: reward.discountNodeId,
                    source: "reward_used",
                    entityType: "reward",
                    entityId: reward.id,
                });

                return Promise.all([
                    updateCustomerReward(reward.id, {
                        status: "USED",
                        discountUsed: true,
                        usedAt: new Date(),
                        orderId: order.admin_graphql_api_id,
                    }),
                    createTransaction(
                        {
                            customerId: customer.id,
                            type: "REDEEM",
                            points: 0,
                            rewardId: reward.id,
                            status: "COMPLETED",
                            reason: `Reward voucher used on order ${orderLabel}`,
                            activity: `Reward "${reward.title || reward.code}" applied on order ${orderLabel}`,
                        },
                        session
                    ),
                ]);
            })
        );

        // Non-critical — voucher status already updated. syncCustomerConfig
        // retries transient network failures internally and never throws.
        await syncCustomerConfig(admin, customer.shopifyId);

        logger.success(MODULE, "Voucher rewards marked as used", {
            shop,
            customerId: customer.id,
            matchedRewardIds: rewards.map((r) => r.id),
            matchedCount: rewards.length,
        });
    } catch (error) {
        logger.error(MODULE, "Voucher update error", { shop, customerId: customer?.id, error: error?.message });
    }
};
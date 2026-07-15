import configMetafieldSyncMutation from "../../graphql/mutation/metafieldsSync/config.js";
import prisma from "../../db.server.js";
import { normalizeCustomerGid } from "../customers/normalizeCustomerGid.js";
import getActiveConfigUpdateVersion from "../configUpdateVersion/getActiveConfigUpdateVersion.js";
import { logger } from "../../utils/logger.js";
import { withRetry } from "../../utils/retry/withRetry.js";
import { SHOPIFY_RETRYABLE_ERRORS } from "../../utils/shopifyGraphql.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "controller/metafieldsSync/syncCustomerConfig.js";

/** @constant {object} Shared retry options for a metafield sync. Both exported functions below always
 *  retry internally, so callers never need to wrap them in `withRetry` themselves. Includes "Throttled" —
 *  configMetafieldSyncMutation (config.js) preserves Shopify's own error text verbatim when it re-throws a
 *  GraphQL-level error, so a rate-limited response reaches here as e.g. "metafieldsSet GraphQL error: Throttled",
 *  which this list's substring match still catches. */
const SYNC_RETRY_OPTIONS = { maxAttempts: 3, baseDelayMs: 800, retryableErrors: SHOPIFY_RETRYABLE_ERRORS };

const APP_NAME = "North Borders Loyalty App";
const NAMESPACE = "app";

// ─────────────────────────────────────────────────────────────────────────────
// Split-metafield design
// ─────────────────────────────────────────────────────────────────────────────
// The customer's app config used to live in ONE metafield (`nbl_customer_v1`)
// holding everything — points, referralCode, and the FULL, unbounded
// transactions/rewards/prizeClaims history. Two problems with that at scale
// (100k+ customers, some with years of activity):
//
//   1. Shopify's JSON metafield write limit (128KB as of API 2026-04 for
//      apps not grandfathered at the old 2MB limit — this app's api_version
//      is 2026-04, so it is NOT grandfathered) — an unbounded array easily
//      grows past that for a long-time, highly active customer, at which
//      point writes to that metafield start failing outright.
//   2. Every sync rewrote the ENTIRE blob even when only one part of it
//      actually changed (e.g. a reward redemption rewriting prizeClaims
//      data that didn't change at all).
//
// Fix: four independent metafields, one per domain, each capped to a bounded
// number of most-recent rows (see *_CAP below) — and callers that know
// exactly which domain(s) an event touched can pass `{ scope: [...] }` to
// only write those, leaving the others untouched. Callers that don't pass a
// scope (or need a full self-heal, e.g. the resync/provision paths) get all
// four written, same as before.
//
// `nbl_customer_v1` (the old single-blob metafield) is left in place,
// UNTOUCHED — nothing here writes to it anymore, but the storefront widget
// still reads it as a fallback for whichever split metafield a given
// customer hasn't been migrated to yet (see loyalty.liquid +
// main.preact.jsx's mergeCustomerConfig()). There's no bulk migration job:
// each customer's split metafields get written the first time ANY event
// (or the periodic resync) fires for them — lazy, self-healing, no
// thundering-herd risk since it's spread out over real customer activity
// rather than a single bulk backfill.

/** @constant {string[]} Every domain, in a stable order. Used as the default scope. */
const ALL_DOMAINS = ["core", "transactions", "rewards", "prizeClaims"];

/** @constant {object} Metafield key per domain. */
const METAFIELD_KEYS = {
    core: "nbl_customer_core_v1",
    transactions: "nbl_customer_transactions_v1",
    rewards: "nbl_customer_rewards_v1",
    prizeClaims: "nbl_customer_prizeclaims_v1",
};

// How many most-recent rows to keep in each capped array. At ~150-250 bytes
// per serialized row, 100 rows lands well under the 128KB metafield write
// limit even accounting for JSON overhead — comfortable safety margin, not
// a number picked to just barely fit. The widget only ever shows recent
// activity/active rewards, so this doesn't remove anything a customer would
// actually see today; older history simply isn't synced to the metafield.
const TRANSACTIONS_CAP = 100;
const REWARDS_CAP = 100;
const PRIZE_CLAIMS_CAP = 100;

// Prisma `select` fragment per domain. `id`/`shopifyId` are always included
// separately (see buildSelect) — every domain needs shopifyId for the
// metafield's ownerId, and `core` additionally exposes the customer's own
// `id` in its JSON value because the widget's needsJoin check
// (App.jsx: `!customer.config || !customer.config.id`) reads it.
const DOMAIN_SELECT = {
    core: {
        points: true,
        referralCode: true,
        // Only needed to look up this shop's active ConfigUpdateVersion
        // (see the "update available" banner logic below) — not itself
        // written into the metafield.
        session: { select: { shop: true } },
    },
    // ActivityRow + the toast notification list read: id, type, points,
    // activity, reason (fallback text), createdAt, notifiedAt. Nothing reads
    // the nested `reward` sub-object that used to be included here.
    transactions: {
        transactions: {
            orderBy: { createdAt: "desc" },
            take: TRANSACTIONS_CAP,
            select: {
                id: true,
                type: true,
                points: true,
                activity: true,
                reason: true,
                createdAt: true,
                notifiedAt: true,
            },
        },
    },
    // ActiveRewardItem + the discountUsed/status filters (Home/Rewards/
    // Activities tabs) are all that touch this array.
    rewards: {
        rewards: {
            orderBy: { createdAt: "desc" },
            take: REWARDS_CAP,
            select: {
                id: true,
                code: true,
                title: true,
                discountUsed: true,
                status: true,
            },
        },
    },
    // referralsSent / referralsUsed removed entirely — grep confirms nothing
    // in app/widget-ui reads them. Dashboard pages and orderPaidJob.js query
    // these directly from Postgres themselves; they don't go through this
    // metafield, so dropping them here doesn't affect either.
    prizeClaims: {
        prizeClaims: {
            orderBy: { createdAt: "desc" },
            take: PRIZE_CLAIMS_CAP,
            select: {
                id: true,
                status: true,
                pointsCost: true,
                physicalPrizeId: true,
            },
        },
    },
};

const BATCH_SIZE = 10;

/**
 * Persists lastSyncedVersionKey to DB for one or more customers — ONLY
 * ever called AFTER the corresponding Shopify metafield write has already
 * been confirmed successful (see call sites below). This ordering is the
 * whole point: if the metafield write fails, this never runs, so DB can
 * never claim a customer is "updated" when their actual metafield isn't.
 * A failure here (DB hiccup) is logged but non-fatal — the customer's
 * metafield is already correct either way; only the admin's rollout-progress
 * count would lag until the next sync self-corrects it.
 *
 * @param {number[]} customerIds
 * @param {string|null} versionKey
 * @returns {Promise<void>}
 */
async function stampVersionKey(customerIds, versionKey) {
    try {
        await prisma.customer.updateMany({
            where: { id: { in: customerIds } },
            data: { lastSyncedVersionKey: versionKey },
        });
    } catch (error) {
        logger.error(MODULE, "Failed to persist lastSyncedVersionKey after successful metafield sync", {
            customerIds,
            versionKey,
            error: error?.message,
        });
    }
}

/**
 * Normalizes a caller-supplied scope into a valid, deduped array of domain
 * names. An empty/missing/invalid scope falls back to ALL_DOMAINS — every
 * existing caller that doesn't pass `options.scope` keeps getting a full
 * sync, exactly like before this split.
 *
 * @param {string[]} [scope]
 * @returns {string[]}
 */
function normalizeScope(scope) {
    if (!Array.isArray(scope) || scope.length === 0) return ALL_DOMAINS;
    const valid = scope.filter((d) => ALL_DOMAINS.includes(d));
    return valid.length ? [...new Set(valid)] : ALL_DOMAINS;
}

/**
 * Builds the Prisma `select` object for the given scope. Always includes
 * `id`/`shopifyId` regardless of scope (cheap scalar fields, needed for
 * ownerId + the needsJoin `.id` check either way).
 *
 * @param {string[]} scope
 * @returns {object}
 */
function buildSelect(scope) {
    const select = { id: true, shopifyId: true };
    scope.forEach((domain) => Object.assign(select, DOMAIN_SELECT[domain]));
    return select;
}

/**
 * Builds the JSON value for one domain's metafield from a Prisma Customer
 * record shaped by buildSelect(scope).
 *
 * @param {string} domain
 * @param {object} customer
 * @param {string|null} [targetVersionKey] - Only used for "core": the
 *   ConfigUpdateVersion key this sync is about to stamp the customer with
 *   (see syncCustomerConfig below for why this is the TARGET value, not a
 *   read of the customer's current one).
 * @returns {object}
 */
function buildDomainValue(domain, customer, targetVersionKey) {
    switch (domain) {
        case "core":
            return {
                appName: APP_NAME,
                id: customer.id,
                shopifyId: customer.shopifyId,
                points: customer.points,
                referralCode: customer.referralCode,
                // Compared client-side against the shop metafield's
                // updateVersion.key (see loyalty.liquid + main.preact.jsx's
                // mergeCustomerConfig()) to decide whether this customer
                // sees the "update available" banner.
                lastSyncedVersionKey: targetVersionKey ?? null,
            };
        case "transactions":
            return { transactions: customer.transactions || [] };
        case "rewards":
            return { rewards: customer.rewards || [] };
        case "prizeClaims":
            return { prizeClaims: customer.prizeClaims || [] };
        default:
            return {};
    }
}

/**
 * Builds the metafield input array for the given scope.
 *
 * @param {object} customer - Prisma Customer record shaped by buildSelect(scope)
 * @param {string[]} scope
 * @param {string|null} [targetVersionKey] - See buildDomainValue.
 * @returns {Array<{ namespace: string, key: string, value: string, type: string, ownerId: string }>}
 */
function buildMetafields(customer, scope, targetVersionKey) {
    return scope.map((domain) => ({
        namespace: NAMESPACE,
        key: METAFIELD_KEYS[domain],
        value: JSON.stringify(buildDomainValue(domain, customer, targetVersionKey)),
        type: "json",
        ownerId: customer.shopifyId,
    }));
}

/**
 * Syncs every customer's metafields for a shop, in batches. Used by bulk
 * jobs (e.g. after a widget config change that all customers need to see).
 * Always does a FULL sync (all four domains) — this is a full self-heal
 * pass, not a targeted event.
 *
 * Each item retries independently on transient network failure and never
 * throws — a single customer's sync failing does not affect the rest of the
 * batch or the caller. Failures are logged individually so they're visible
 * instead of silently vanishing into `Promise.allSettled`.
 *
 * @param {Object} admin   - Shopify Admin GraphQL client
 * @param {Object} session - Shopify session (used to scope customers to this shop)
 * @returns {Promise<void>}
 */
export const syncCustomersConfig = async (admin, session) => {
    try {
        // One lookup for the whole batch (shop-wide, not per-customer) — a
        // full sync means "this customer is now fully fresh", so stamping
        // everyone with the shop's current active version is exactly
        // correct: this is the bulk equivalent of syncCustomerConfig's own
        // "core scope always stamps the active version" behaviour below.
        const activeVersion = await getActiveConfigUpdateVersion(session?.shop);
        const targetVersionKey = activeVersion?.versionKey ?? null;

        const customers = await prisma.customer.findMany({
            where: { sessionId: session.id }, // scoped to current shop
            select: buildSelect(ALL_DOMAINS),
        });

        for (let i = 0; i < customers.length; i += BATCH_SIZE) {
            const batch = customers.slice(i, i + BATCH_SIZE);
            const settled = await Promise.allSettled(
                batch.map((customer) =>
                    withRetry(
                        () => configMetafieldSyncMutation(admin, buildMetafields(customer, ALL_DOMAINS, targetVersionKey)),
                        { ...SYNC_RETRY_OPTIONS, context: { module: MODULE, shop: session?.shop, customerId: customer.id } }
                    )
                )
            );

            const stampable = [];
            settled.forEach((result, idx) => {
                if (result.status === "rejected") {
                    logger.error(MODULE, "Customer metafield sync failed after retries", {
                        shop: session?.shop,
                        customerId: batch[idx]?.id,
                        error: result.reason?.message,
                    });
                } else {
                    // Metafield write confirmed successful — safe to persist
                    // the same version key to DB now. See syncCustomerConfig
                    // below for why this ordering (write first, DB after)
                    // matters.
                    stampable.push(batch[idx].id);
                }
            });

            if (stampable.length) {
                await stampVersionKey(stampable, targetVersionKey);
            }
        }
    } catch (error) {
        logger.error(MODULE, "syncCustomersConfig failed", { shop: session?.shop, error: error?.message });
    }
};

/**
 * Syncs a single customer's config to Shopify — the split
 * core/transactions/rewards/prizeClaims metafields (see the module-level
 * comment above for why they're split). Retries internally on transient
 * network failure, so callers never need to wrap this in `withRetry`
 * themselves.
 *
 * Never throws — returns `null` on any failure (customer not found, invalid
 * ID, or sync failure after all retries) so callers can treat this as a
 * best-effort, non-critical operation.
 *
 * @param {Object}        admin      - Shopify Admin GraphQL client
 * @param {string|number} customerId - Internal numeric id (<=6 digits) or Shopify GID/numeric id
 * @param {Object}        [options]
 * @param {string[]}      [options.scope] - Which domain(s) to sync:
 *   "core" | "transactions" | "rewards" | "prizeClaims". Omit (or pass an
 *   empty/invalid array) for a full sync of all four — this is the default
 *   and is what every existing caller gets unless it explicitly opts into a
 *   narrower scope. Pass a narrower scope ONLY when the caller is certain
 *   which domain(s) its event actually changed — an incorrectly-narrow
 *   scope silently leaves a domain stale, which is worse than the small
 *   extra write cost of a full sync. When in doubt, omit this.
 * @returns {Promise<Object|null>} The synced Prisma Customer record
 *   (containing only the fields selected for the given scope, plus
 *   id/shopifyId), or null on failure.
 */
export const syncCustomerConfig = async (admin, customerId, options = {}) => {
    let normalizedId = null;
    const scope = normalizeScope(options.scope);

    try {
        let customer = null;
        const select = buildSelect(scope);

        if (customerId?.toString()?.length <= 6) {
            customer = await prisma.customer.findFirst({
                where: { id: Number(customerId) },
                select,
            });
        } else {
            normalizedId = normalizeCustomerGid(customerId);
            if (!normalizedId) throw new Error("Customer ID is required");

            customer = await prisma.customer.findFirst({
                where: { shopifyId: normalizedId },
                select,
            });
        }

        if (!customer) throw new Error(`Customer not found: ${normalizedId ?? customerId}`);

        // Only look this up when "core" is actually in scope — it's the
        // only domain that carries lastSyncedVersionKey. customer.session.shop
        // comes from the extra `session: { select: { shop } } }` in the core
        // DOMAIN_SELECT fragment.
        const targetVersionKey = scope.includes("core")
            ? (await getActiveConfigUpdateVersion(customer.session?.shop))?.versionKey ?? null
            : null;

        // Single metafieldsSet call for the whole scope — see
        // configMetafieldSyncMutation's own comment for why this is safe to
        // retry as one unit rather than per-field.
        await withRetry(
            () => configMetafieldSyncMutation(admin, buildMetafields(customer, scope, targetVersionKey)),
            { ...SYNC_RETRY_OPTIONS, context: { module: MODULE, customerId: customer.id, scope } }
        );

        // Metafield write confirmed successful (withRetry above would have
        // thrown otherwise, landing in the catch block below) — only NOW is
        // it safe to persist the same version key to DB. See
        // stampVersionKey's own comment for why this ordering matters.
        if (scope.includes("core")) {
            await stampVersionKey([customer.id], targetVersionKey);
        }

        return customer;
    } catch (error) {
        logger.error(MODULE, "syncCustomerConfig failed", {
            customerId: normalizedId ?? customerId,
            scope,
            error: error?.message,
        });
        return null;
    }
};

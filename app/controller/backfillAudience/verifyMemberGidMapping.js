/**
 * @file controller/backfillAudience/verifyMemberGidMapping.js
 * @description Proves, against live Shopify data, that rewriting a
 * `gid://shopify/CustomerSegmentMember/<n>` into
 * `gid://shopify/Customer/<n>` actually lands on the same person — before
 * a single point is awarded off that assumption.
 *
 * ── Why a whole module for one string rewrite ────────────────────────────
 * The rewrite itself is three lines (see
 * utils/backfill/normalizeSegmentMemberGid.js). What justifies this file
 * is the consequence of it being wrong.
 *
 * The 1:1 relationship between the two ids is confirmed by Shopify staff
 * on the developer forum and shown in Shopify's own segments guide, but
 * it is NOT stated in the API reference — CustomerSegmentMember.id is
 * documented only as "The member's ID", with no declared relationship to
 * Customer. The same staff reply that confirmed it also noted the
 * feedback had been passed on to change the behaviour.
 *
 * So this is an undocumented coincidence that the platform owner has
 * openly discussed changing. If it changes, the rewrite doesn't throw, it
 * doesn't return null, and Shopify returns no warning: it silently
 * produces a valid-looking Customer GID for the WRONG customer. Real
 * points, real money, wrong people, and the first anyone would know is a
 * merchant support ticket weeks later.
 *
 * Verification turns that silent, permanent, unattributable failure into
 * a loud one that happens before anything is awarded. That trade — a
 * single extra API call per snapshot build — is not close.
 *
 * ── What "verified" means here ───────────────────────────────────────────
 * A sample of members is rewritten and looked up as real Customer records
 * in ONE `nodes(ids:)` call, then matched on email. Email is the right
 * comparison key: it's the field both objects expose, it's what
 * store.js's own upsert is keyed on, and unlike a name it's unique per
 * customer within a shop (Customer's own @@unique([sessionId, email])
 * relies on exactly that).
 *
 * This is a sample, not an exhaustive check — verifying all 2000 members
 * would mean fetching all 2000 customers, which is the entire cost this
 * feature exists to avoid. That's the correct trade for what's being
 * guarded against: the failure mode isn't "one member maps oddly", it's
 * "the id scheme changed", which is systemic. If the scheme changes, a
 * handful of samples catch it just as reliably as all of them.
 */

import { logger } from "../../utils/logger.js";
import { shopifyGraphqlWithRetry } from "../../utils/shopifyGraphql.js";
import { normalizeSegmentMemberGid } from "../../utils/backfill/normalizeSegmentMemberGid.js";

/** @constant {string} Module identifier for structured logging */
const MODULE = "controller/backfillAudience/verifyMemberGidMapping";

/**
 * @constant {number} How many members to sample per verification.
 *
 * Small on purpose. This guards against a systemic scheme change, not
 * per-row corruption, so the sample only has to be large enough that a
 * changed scheme can't plausibly pass by luck. Five members all mapping
 * to the correct email by coincidence is not a scenario worth budgeting
 * API calls for.
 */
const SAMPLE_SIZE = 5;

/**
 * Verifies the CustomerSegmentMember -> Customer id assumption against a
 * sample of real members.
 *
 * Samples are drawn only from members that HAVE an email, since email is
 * the comparison key — a member without one can't confirm or deny
 * anything and would just weaken the sample. A page where no member has
 * an email returns `{ ok: true, checked: 0 }` (nothing was disproved) and
 * the caller is expected to try again on a later page rather than treat
 * an unverifiable page as verified. See buildSnapshot.js, which will not
 * mark a snapshot READY until at least one member has actually been
 * checked.
 *
 * @param {Object} admin - Shopify Admin GraphQL client
 * @param {Array<Object>} memberNodes - Raw CustomerSegmentMember nodes from segmentMembersPage()
 * @returns {Promise<{ ok: boolean, checked: number, reason?: string }>}
 *   ok:false means the assumption FAILED and the snapshot must be aborted.
 *   ok:true with checked:0 means nothing could be verified from this input.
 * @throws {Error} If the Shopify lookup itself fails after retries — an
 *   inconclusive check is not a passing check, and must not be swallowed
 *   into `{ ok: true }`. The caller retries the page; a build that can
 *   never verify never becomes READY.
 */
export async function verifyMemberGidMapping(admin, memberNodes) {
    const sample = (memberNodes ?? [])
        .filter((node) => node?.id && node?.defaultEmailAddress?.emailAddress)
        .slice(0, SAMPLE_SIZE);

    if (sample.length === 0) {
        return { ok: true, checked: 0 };
    }

    /** @type {Map<string, string>} normalised Customer GID -> expected email (lowercased) */
    const expected = new Map();

    for (const node of sample) {
        const customerGid = normalizeSegmentMemberGid(node.id);

        // An unparseable member GID is itself a scheme change — the shape
        // Shopify returns is no longer the shape this code was written
        // against. Fail rather than skipping the row.
        if (!customerGid) {
            return {
                ok: false,
                checked: 0,
                reason: `Unrecognised segment member GID format: "${node.id}". Shopify may have changed the CustomerSegmentMember id scheme.`,
            };
        }

        expected.set(customerGid, node.defaultEmailAddress.emailAddress.trim().toLowerCase());
    }

    // One call for the whole sample. `nodes(ids:)` returns null in-place
    // for any id that doesn't resolve, which is exactly the signal needed
    // — a rewritten GID pointing at nothing is as fatal as one pointing
    // at the wrong person.
    const json = await shopifyGraphqlWithRetry(
        admin,
        `#graphql
        query VerifySegmentMemberIds($ids: [ID!]!) {
            nodes(ids: $ids) {
                ... on Customer {
                    id
                    defaultEmailAddress {
                        emailAddress
                    }
                }
            }
        }`,
        { ids: [...expected.keys()] },
        { context: { module: MODULE, sampleSize: expected.size } }
    );

    const resolved = json.data?.nodes;

    if (!Array.isArray(resolved)) {
        throw new Error("verifyMemberGidMapping: unexpected response shape from nodes(ids:)");
    }

    // Index what came back rather than relying on positional alignment.
    // nodes(ids:) does preserve order, but matching by id makes the check
    // independent of that guarantee — and a mismatch here is precisely
    // the class of assumption this module exists to stop trusting.
    /** @type {Map<string, string>} */
    const actual = new Map();
    for (const node of resolved) {
        if (node?.id && node?.defaultEmailAddress?.emailAddress) {
            actual.set(node.id, node.defaultEmailAddress.emailAddress.trim().toLowerCase());
        }
    }

    for (const [customerGid, expectedEmail] of expected) {
        const actualEmail = actual.get(customerGid);

        if (actualEmail == null) {
            return {
                ok: false,
                checked: expected.size,
                reason: `Segment member id ${customerGid} did not resolve to a Customer. The CustomerSegmentMember -> Customer id mapping appears to have changed.`,
            };
        }

        if (actualEmail !== expectedEmail) {
            // Deliberately does NOT log or return either email address —
            // this failure means the app has just been shown two
            // different customers' PII side by side, and writing that
            // pairing into a log file is the last thing it should do
            // about it. The GID alone is enough to investigate.
            return {
                ok: false,
                checked: expected.size,
                reason: `Segment member id ${customerGid} resolved to a Customer with a different email address. The CustomerSegmentMember -> Customer id mapping is no longer 1:1 — this snapshot has been aborted to prevent awarding points to the wrong customers.`,
            };
        }
    }

    logger.info(MODULE, "Segment member GID mapping verified", { checked: expected.size });
    return { ok: true, checked: expected.size };
}

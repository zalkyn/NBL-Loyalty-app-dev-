import { customerPages } from "../../graphql/query/customers.js";
import { storeCustomer } from "./store.js";

/** @constant {number} Number of customers upserted concurrently within a page */
const BATCH_SIZE = 10;

/**
 * @constant {number} Cap on how many per-customer errors are kept.
 *
 * A sync that fails on one customer produces one error worth reading. A
 * sync that fails on all 80,000 — a bad migration, a dead database —
 * produces the same one error 80,000 times, and keeping every copy turns
 * a diagnosable failure into an out-of-memory crash on the reporting
 * path. The count in `failed` stays exact regardless; only the list of
 * examples is bounded.
 */
const MAX_RECORDED_ERRORS = 50;

/**
 * Fetches every customer from the connected Shopify store and upserts them
 * into the local Customer table, ONE PAGE AT A TIME.
 *
 * ── Why streaming rather than fetch-all-then-loop ────────────────────────
 * The previous version pulled the shop's entire customer list into one
 * array and only then began writing. On a shop with 80,000 customers that
 * is 80,000 hydrated objects resident simultaneously, and — because the
 * loop had no way to speak until it finished — twenty minutes during
 * which the only honest thing the UI could say was "started". Neither
 * problem was fixable from the UI side, because neither was a UI problem.
 *
 * Consuming customerPages() means at most one page (250) is alive at a
 * time, and every page boundary is a place to report progress. The
 * `onProgress` callback is what makes a real progress bar possible; see
 * customerSyncProcessor.js for where those numbers end up.
 *
 * ── What a sync does and doesn't do ──────────────────────────────────────
 * It upserts: customers new to this app are created, ones already here are
 * updated. Nothing local is ever deleted — a customer removed in Shopify
 * keeps their local record, points and history, because deleting a
 * balance someone earned is not a thing a sync button should be able to
 * do as a side effect.
 *
 * Per-customer failures are isolated via Promise.allSettled and counted
 * rather than thrown — one malformed record must never abort the rest.
 * A failure of the FETCH is different and does throw: a partial sync
 * reporting success is worse than an outright failure, because the
 * merchant has no reason to run it again.
 *
 * @param {Object}   admin      - Shopify Admin GraphQL client
 * @param {Object}   session    - Shopify session (scopes new customers to this shop)
 * @param {Object}   [options]
 * @param {number|null} [options.total] - Expected total, if the caller already
 *   counted. Passed through to onProgress so a bar has its denominator from
 *   the first tick rather than after the last page.
 * @param {(progress: { total: number|null, processed: number, success: number, failed: number }) => void|Promise<void>} [options.onProgress]
 *   Called after each page. Awaited, so a slow persist throttles the sync
 *   rather than racing it. Its failures are swallowed — reporting is not
 *   allowed to break the work being reported on.
 * @returns {Promise<{ total: number, success: number, failed: number, errors: Array<{ customerId: string, reason: string }> }>}
 * @throws {Error} If fetching a page from Shopify fails after its retries.
 */
export default async function syncCustomersFromStore(admin, session, options = {}) {
    const { total: expectedTotal = null, totalIsEstimate = false, onProgress = null } = options;

    const results = { total: 0, success: 0, failed: 0, errors: [] };

    for await (const page of customerPages(admin, { pageSize: 250 })) {
        for (let i = 0; i < page.length; i += BATCH_SIZE) {
            const batch = page.slice(i, i + BATCH_SIZE);
            const settled = await Promise.allSettled(batch.map((c) => storeCustomer(session, c)));

            settled.forEach((result, idx) => {
                if (result.status === "fulfilled" && result.value) {
                    results.success++;
                } else {
                    results.failed++;
                    if (results.errors.length < MAX_RECORDED_ERRORS) {
                        results.errors.push({
                            customerId: batch[idx]?.id,
                            reason:
                                result.status === "rejected"
                                    ? result.reason?.message
                                    : "storeCustomer returned null",
                        });
                    }
                }
            });
        }

        results.total += page.length;

        if (onProgress) {
            try {
                await onProgress({
                    // ── The denominator, and when there isn't one ──────────
                    // This previously fell back to `results.total` once the
                    // run passed the expected figure. That makes the
                    // denominator follow the numerator, so the bar reads
                    // "20,250 of 20,250 — 100% done" while an hour of work
                    // remains. Worse on exactly the shops the bar exists
                    // for: Shopify's customersCount caps at 10,000, so any
                    // shop above that overtook its own total within the
                    // first minute.
                    //
                    // Overshooting the estimate means the estimate was
                    // wrong, and the honest report of a wrong denominator
                    // is no denominator. null makes the bar disappear and
                    // the UI fall back to a running tally, which is a
                    // smaller loss than a progress bar that lies.
                    total: expectedTotal != null && expectedTotal >= results.total ? expectedTotal : null,
                    totalIsEstimate,
                    processed: results.total,
                    success: results.success,
                    failed: results.failed,
                });
            } catch {
                // Deliberately ignored. A failed progress write costs the
                // merchant an out-of-date number for a few seconds; letting
                // it propagate would abort a sync that is otherwise working.
            }
        }
    }

    return results;
}
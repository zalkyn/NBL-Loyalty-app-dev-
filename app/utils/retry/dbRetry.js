import { withRetry } from './withRetry.js';

/**
 * `withRetry` preset scoped to transient database failures (connection
 * resets, timeouts, deadlocks). Use for Prisma/DB calls; use `withRetry`
 * directly (with `retryableErrors` set to network error strings) for
 * Shopify Admin API calls.
 *
 * @param {() => Promise<any>} fn - Async DB operation to run.
 * @param {object} [context] - Extra fields merged into retry log lines (e.g. `{ shop }`).
 * @returns {Promise<any>} The resolved value of `fn`.
 * @throws {Error} The last error, if every attempt fails or the error isn't retryable.
 */
export const dbRetry = (fn, context = {}) => {
    return withRetry(fn, {
        retryableErrors: [
            "ECONNRESET",
            "ETIMEDOUT",
            "deadlock",
            "timeout",
            // Prisma's P2034 error ("Transaction failed due to a write
            // conflict or a deadlock. Please retry your transaction.") —
            // thrown when a Serializable-isolation transaction (see
            // createTransaction.js) loses a genuine concurrent write
            // conflict. "deadlock" above already covers part of that exact
            // message, but matching "write conflict" too makes the intent
            // explicit and doesn't depend on that phrasing staying the same.
            "write conflict",
        ],
        context: {
            ...context,
            layer: "database",
        },
    });
};
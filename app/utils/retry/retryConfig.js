/**
 * Default options for `withRetry` (see withRetry.js).
 * Individual call sites override any of these per use-case, e.g.
 * `withRetry(fn, { maxAttempts: 2, retryableErrors: [...] })`.
 *
 * Delay progression with the defaults below: 1.2s -> 2.4s -> 4.8s (+ jitter).
 *
 * @type {{
 *   maxAttempts: number,
 *   baseDelayMs: number,
 *   backoffFactor: number,
 *   maxDelayMs: number,
 *   jitterFactor: number,
 *   retryableErrors: Array<string|Function>,
 *   context: { app: string },
 * }}
 */
export const RETRY_CONFIG = {
    maxAttempts: 4,
    baseDelayMs: 1200,
    backoffFactor: 2,
    maxDelayMs: 30000, // 30s cap, regardless of attempt count
    jitterFactor: 0.3, // up to +30% random jitter, avoids synchronized retry spikes

    // Empty = retry every error. Callers should pass an explicit list
    // (e.g. ["fetch failed", "ECONNRESET", "ETIMEDOUT"]) to avoid retrying
    // non-transient failures such as validation or business-rule errors.
    retryableErrors: [],

    context: {
        app: "NBL",
    },
};

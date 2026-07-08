import { RETRY_CONFIG } from './retryConfig.js';
import { logger } from '../logger.js';

/**
 * Runs `fn` with exponential-backoff retry on transient failures.
 *
 * Retries only errors matched by `retryableErrors` (string = case-insensitive
 * substring match against `error.message`, function = `instanceof` check).
 * An empty `retryableErrors` array (the default) retries every error — pass
 * an explicit list to scope retries to known-transient failures only
 * (e.g. `["fetch failed", "ECONNRESET", "ETIMEDOUT"]`).
 *
 * @param {() => Promise<any>} fn - Async operation to run. Must be a thunk
 *   (zero-arg function) so it can be safely re-invoked on each attempt.
 * @param {object}   [options]
 * @param {number}   [options.maxAttempts]    - Total attempts, including the first (default: see RETRY_CONFIG).
 * @param {number}   [options.baseDelayMs]    - Delay before the 2nd attempt, in ms.
 * @param {number}   [options.backoffFactor]  - Multiplier applied to the delay after each failed attempt.
 * @param {number}   [options.maxDelayMs]     - Upper bound on the computed delay.
 * @param {number}   [options.jitterFactor]   - Adds up to `delay * jitterFactor` of random jitter to avoid retry storms.
 * @param {Array<string|Function>} [options.retryableErrors] - Errors to retry; anything else is thrown immediately.
 * @param {object}   [options.context]        - Extra fields (e.g. `{ shop, module }`) merged into every log line.
 *
 * @returns {Promise<any>} The resolved value of `fn`.
 * @throws {Error} The last error, if every attempt fails or a non-retryable error occurs.
 */
export const withRetry = async (fn, options = {}) => {
    const config = { ...RETRY_CONFIG, ...options };

    const {
        maxAttempts,
        baseDelayMs,
        backoffFactor,
        maxDelayMs,
        jitterFactor,
        retryableErrors,
        context = {}
    } = config;

    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await fn();

            // ✅ success after retry — log recovery
            if (attempt > 1) {
                logger.success(
                    context.shop,
                    `Recovered on attempt ${attempt}/${maxAttempts}`,
                    { attempt, maxAttempts, ...context }
                );
            }

            return result;

        } catch (error) {
            lastError = error;
            const message = error?.message || 'Unknown error';

            // ❌ skip retry if error is not in retryableErrors list
            // retryableErrors entries can be strings (message.includes check)
            // or constructors/classes (instanceof check)
            if (
                retryableErrors.length &&
                !retryableErrors.some(e =>
                    typeof e === 'string'
                        ? message.toLowerCase().includes(e.toLowerCase())
                        : (typeof e === 'function' && error instanceof e)
                )
            ) {
                logger.error(
                    context.shop,
                    `Non-retryable error — aborting`,
                    { attempt, maxAttempts, error: message, ...context }
                );
                throw error;
            }

            // ❌ last attempt exhausted → throw
            if (attempt === maxAttempts) {
                logger.error(
                    context.shop,
                    `All ${maxAttempts} attempts failed`,
                    { attempt, maxAttempts, error: message, ...context }
                );
                throw error;
            }

            // ⏳ calculate delay with exponential backoff + jitter
            let delay = baseDelayMs * (backoffFactor ** (attempt - 1));
            delay = Math.min(delay, maxDelayMs);
            if (jitterFactor) {
                delay += Math.random() * delay * jitterFactor;
            }

            logger.warn(
                context.shop,
                `Attempt ${attempt}/${maxAttempts} failed — retrying in ${Math.round(delay)}ms`,
                { attempt, maxAttempts, error: message, delayMs: Math.round(delay), ...context }
            );

            await new Promise(res => setTimeout(res, delay));
        }
    }

    throw lastError; // fallback safety
};
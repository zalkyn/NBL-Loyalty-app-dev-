import { RETRY_CONFIG } from './retryConfig.js';
import { logger } from '../logger.js';

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

            // ✅ if success after retry
            if (attempt > 1) {
                logger.success(
                    context.shop,
                    `Recovered after ${attempt} attempts`,
                    { attempt, ...context }
                );
            }

            return result;

        } catch (error) {
            lastError = error;
            const message = error?.message || 'Unknown error';

            // ❌ skip retry if not retryable
            if (
                retryableErrors.length &&
                !retryableErrors.some(e =>
                    error instanceof e || message.includes(e)
                )
            ) {
                logger.error(
                    context.shop,
                    `Non-retryable error`,
                    { attempt, error: message, ...context }
                );
                throw error;
            }

            // ❌ last attempt → throw
            if (attempt === maxAttempts) {
                logger.error(
                    context.shop,
                    `All retries failed`,
                    { attempt, maxAttempts, error: message, ...context }
                );
                throw error;
            }

            // ⏳ calculate delay (simple + readable)
            let delay = baseDelayMs * (backoffFactor ** (attempt - 1));
            delay = Math.min(delay, maxDelayMs);

            if (jitterFactor) {
                delay += Math.random() * delay * jitterFactor;
            }

            logger.warn(
                context.shop,
                `Retry ${attempt} failed → next in ${Math.round(delay)}ms`,
                { error: message, ...context }
            );

            await new Promise(res => setTimeout(res, delay));
        }
    }

    throw lastError; // fallback safety
};
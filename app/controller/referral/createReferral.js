import prisma from "../../db.server.js";
import { logger } from "../../utils/logger.js";
import { dbRetry } from "../../utils/retry/dbRetry.js";
import { DEFAULT_REFERRAL_SELECT } from "./referralSelect.js";

/**
 * Creates a new referral record.
 * A customer can only be referred once — enforced by @@unique([referredId]).
 *
 * @param {Object}        input
 * @param {number|string} input.referrerId              - Customer who referred.
 * @param {number|string} input.referredId              - Customer who was referred.
 * @param {string}        [input.orderId]
 * @param {string}        [input.status]                - "ACTIVE" | "PENDING" | "USED" | "CANCELLED" | "EXPIRED"
 * @param {string}        [input.discountCode]
 * @param {string}        [input.discountInfo]
 * @param {boolean}       [input.discountUsed]
 * @param {boolean}       [input.rewardGiven]
 * @param {string}        [input.subscriptionContractId]
 * @param {Object}        [input.metadata]
 * @param {Object}        [select]                      - Prisma select object to control returned fields.
 * @returns {Promise<Object|null>} Created referral, or null specifically when
 *   the referred customer already has a referral (P2002 on the unique
 *   [referredId] constraint) — a normal, expected outcome callers should
 *   treat as "already referred", not a failure.
 * @throws {Error} Any other database error (connection issues, timeouts,
 *   etc.) is re-thrown rather than swallowed, so callers can tell "this
 *   customer was already referred" apart from "the database call failed"
 *   instead of both silently returning null.
 *
 * @example
 * await createReferral({
 *     referrerId:   1,
 *     referredId:   2,
 *     discountCode: "NBL_A3K9XZT_REFERRAL",
 *     status:       "PENDING",
 * })
 */
export const createReferral = async (input, select = DEFAULT_REFERRAL_SELECT) => {
    try {
        const referral = await dbRetry(
            () =>
                prisma.referral.create({
                    data: {
                        referrerId: Number(input.referrerId),
                        referredId: Number(input.referredId),
                        orderId: input.orderId ?? null,
                        status: input.status ?? "PENDING",
                        discountCode: input.discountCode ?? null,
                        discountInfo: input.discountInfo ?? null,
                        discountUsed: input.discountUsed ?? false,
                        rewardGiven: input.rewardGiven ?? false,
                        subscriptionContractId: input.subscriptionContractId ?? null,
                        metadata: input.metadata ?? {},
                    },
                    select,
                }),
            { referrerId: input.referrerId, referredId: input.referredId }
        );

        logger.info("Referral created", {
            referralId: referral.id,
            referrerId: input.referrerId,
            referredId: input.referredId,
            status: referral.status,
        });

        return referral;
    } catch (error) {
        // P2002 — referredId unique constraint violation
        if (error?.code === "P2002") {
            logger.warn("Referral already exists for referred customer", {
                referredId: input.referredId,
            });
            return null;
        }

        logger.error("Failed to create referral", {
            input,
            error: error?.message,
            stack: error?.stack,
        });

        // Re-throw: unlike the P2002 case above, this isn't an expected
        // outcome the caller should quietly treat as "no referral created".
        // Swallowing it here previously made real DB failures (timeouts,
        // connection drops) indistinguishable from "referral already
        // exists", which is misleading in any caller that maps a null
        // return to a 409 "already exists" response.
        throw error;
    }
};
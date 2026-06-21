import prisma from "../../db.server.js";
import { logger } from "../../utils/logger.js";

// ─── Default Select ───────────────────────────────────────────────────────────

/**
 * Default fields selected for all transaction queries.
 * Override by passing a custom `select` object.
 */
const DEFAULT_TRANSACTION_SELECT = {
    id: true,
    customerId: true,
    type: true,
    points: true,
    balanceAfter: true,
    status: true,
    reason: true,
    activity: true,
    eventId: true,
    rewardId: true,
    referralId: true,
    pointsRuleId: true,
    expiresAt: true,
    metadata: true,
    createdAt: true,
};

// ─── Create Transaction ───────────────────────────────────────────────────────

/**
 * Creates a points transaction and updates the customer's balance atomically.
 *
 * Transaction types:
 * - EARN / REFERRAL   → adds points, increases lifetimePoints
 * - REDEEM / EXPIRE   → deducts points (throws if insufficient balance)
 * - ADJUST / REVERSAL → signed value (+/-), balance floored at 0
 *
 * @param {Object}                                                    input
 * @param {number}                                                    input.customerId
 * @param {"EARN"|"REDEEM"|"ADJUST"|"EXPIRE"|"REVERSAL"|"REFERRAL"}  input.type
 * @param {number}                                                    input.points        - EARN/REDEEM/EXPIRE/REFERRAL: always positive. ADJUST/REVERSAL: signed (+/-)
 * @param {string}                                                    [input.status]      - "ACTIVE" | "PENDING" | "COMPLETED" | "CANCELLED" | "REVERSED" (default: "ACTIVE")
 * @param {string}                                                    [input.reason]
 * @param {number}                                                    [input.eventId]
 * @param {number}                                                    [input.rewardId]
 * @param {number}                                                    [input.referralId]
 * @param {number}                                                    [input.pointsRuleId]
 * @param {string}                                                    [input.activity]
 * @param {Date|string}                                               [input.expiresAt]
 * @param {Object}                                                    [input.metadata]
 * @param {Object}                                                    session
 * @param {string}                                                    session.id
 * @param {Object}                                                    [select]            - Prisma select object to control returned fields.
 * @returns {Promise<Object|null>} Created transaction or null on failure.
 *
 * @example
 * // Earn points for order
 * await createTransaction(
 *     {
 *         customerId:   12,
 *         type:         "EARN",
 *         points:       150,
 *         activity:     "Earned 150 pts for order #1234",
 *         eventId:      3,
 *         pointsRuleId: 7,
 *         status:       "COMPLETED",
 *         metadata:     { orderId: "gid://shopify/Order/1234" },
 *     },
 *     session
 * )
 *
 * // Minimal select — only return what's needed
 * await createTransaction(input, session, { id: true, points: true, balanceAfter: true })
 */
export default async function createTransaction(input, session, select = DEFAULT_TRANSACTION_SELECT) {
    try {
        return await prisma.$transaction(async (tx) => {
            const customer = await tx.customer.findUnique({
                where: { id: input.customerId },
                select: {
                    points: true,
                    lifetimePoints: true,
                    sessionId: true,
                },
            });

            if (!customer) {
                throw new Error("Customer not found");
            }

            if (customer.sessionId !== session.id) {
                throw new Error("Unauthorized: customer does not belong to this shop");
            }

            const amount = Number(input.points);
            let signedPoints;
            let newBalance;
            let newLifetimePoints = customer.lifetimePoints;

            switch (input.type) {
                case "EARN":
                case "REFERRAL":
                    signedPoints = amount;
                    newBalance = customer.points + amount;
                    newLifetimePoints += amount;
                    break;

                case "REDEEM":
                case "EXPIRE":
                    if (amount > customer.points) {
                        throw new Error(
                            `Insufficient points: has ${customer.points}, attempted ${amount}`
                        );
                    }
                    signedPoints = -amount;
                    newBalance = customer.points - amount;
                    break;

                case "ADJUST":
                    signedPoints = amount;
                    newBalance = Math.max(0, customer.points + amount);
                    newLifetimePoints += amount;
                    break;
                case "REVERSAL":
                    // Signed value passed directly from caller (+/-)
                    signedPoints = amount;
                    newBalance = Math.max(0, customer.points + amount);
                    break;

                default:
                    throw new Error(`Unknown transaction type: ${input.type}`);
            }

            const transaction = await tx.transaction.create({
                data: {
                    customerId: input.customerId,
                    type: input.type,
                    points: signedPoints,
                    balanceAfter: newBalance,
                    status: input.status ?? "COMPLETED",
                    reason: input.reason ?? null,
                    activity: input.activity ?? null,
                    eventId: input.eventId ?? null,
                    rewardId: input.rewardId ?? null,
                    referralId: input.referralId ?? null,
                    pointsRuleId: input.pointsRuleId ?? null,
                    expiresAt: input.expiresAt ?? null,
                    metadata: input.metadata ?? {},
                },
                select,
            });

            await tx.customer.update({
                where: { id: input.customerId },
                data: {
                    points: newBalance,
                    lifetimePoints: newLifetimePoints,
                },
            });

            logger.info("Transaction created", {
                transactionId: transaction.id,
                customerId: input.customerId,
                type: input.type,
                points: signedPoints,
                balanceAfter: newBalance,
            });

            return transaction;
        });
    } catch (error) {
        logger.error("Failed to create transaction", {
            error: error?.message,
            input,
            module: "createTransaction.js",
        });
        return null;
    }
}
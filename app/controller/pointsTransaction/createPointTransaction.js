import prisma from "db-server";
import { logger } from "app/utils/logger";



/**
 * Creates a points transaction for a customer and updates their balance.
 *
 * This function performs the following operations inside a database transaction:
 * - Validates the customer and session ownership
 * - Calculates new points balance and lifetime points
 * - Creates a points transaction record
 * - Updates the customer's points balance
 * - Logs the activity
 *
 * @async
 * @function createPointsTransaction
 *
 * @param {Object} input - Transaction input data
 * @param {Int} input.customerId - Unique ID of the customer
 * @param {"EARN"|"REDEEM"|"ADJUST"|"EXPIRE"} input.type - Type of transaction
 * @param {number|string} input.points - Number of points to add or deduct
 * @param {string} [input.reason] - Reason for the transaction (optional)
 * @param {string} [input.eventId] - Related event ID (optional)
 * @param {Date|string} [input.expiresAt] - Expiration date of points (optional)
 * @param {Object} [input.metadata] - Additional metadata (optional)
 *
 * @param {Object} session - Current session object
 * @param {string} session.id - Session ID used to validate shop ownership
 *
 * @returns {Promise<Object|undefined>} Returns the created points transaction object including:
 * @returns {string} returns.id - Transaction ID
 * @returns {string} returns.customerId - Customer ID
 * @returns {"EARN"|"REDEEM"|"ADJUST"|"EXPIRE"} returns.type - Transaction type
 * @returns {number} returns.points - Points added or deducted
 * @returns {number} returns.balanceAfter - Customer balance after transaction
 * @returns {string|null} returns.reason - Reason for transaction
 * @returns {string|null} returns.eventId - Associated event ID
 * @returns {Date|null} returns.expiresAt - Expiry date of points
 * @returns {Object} returns.metadata - Additional metadata
 * @returns {Object} returns.customer - Related customer object
 * @returns {Object|null} returns.event - Related event object
 *
 * @throws {Error} Throws error if customer not found or unauthorized access
 */

export default async function createPointsTransaction(input, session,) {
    try {
        return await prisma.$transaction(async (tx) => {
            const customer = await tx.customer.findUnique({
                where: { id: input.customerId },
                select: {
                    points: true,
                    lifetimePoints: true,
                    sessionId: true
                }
            });

            if (!customer) throw new Error("Customer not found");
            if (customer.sessionId !== session.id) {
                throw new Error("Unauthorized: Customer does not belong to this shop");
            }

            let newBalance;
            let lifeTimePoints = customer.lifetimePoints;

            if (input.type === "REDEEM") {
                newBalance = Math.max(0, customer.points - Number(input.points));
            } else {
                newBalance = customer.points + Number(input.points);
                lifeTimePoints += Number(input.points);
            }

            // Create Points Transaction
            const transaction = await tx.pointsTransaction.create({
                data: {
                    customerId: input.customerId,
                    type: input.type,
                    points: input.points,
                    balanceAfter: newBalance,
                    reason: input.reason,
                    eventId: input.eventId || null,
                    expiresAt: input.expiresAt || null,
                    metadata: input.metadata || {},
                },
                include: {
                    customer: true,
                    event: true
                }
            });

            // Update Customer balance
            await tx.customer.update({
                where: { id: input.customerId },
                data: {
                    points: newBalance,
                    lifetimePoints: lifeTimePoints,
                }
            });

            // Create Activity Log
            await tx.activityLog.create({
                data: {
                    customerId: input.customerId,
                    activityType: `${input.type}_POINTS`,
                    source: input.type === "ADJUST" ? input.reason : "SYSTEM",
                    points: input.points,
                    status: "SUCCESS",
                    referenceId: input.referenceId,
                    metadata: input.metadata,
                }
            });

            return transaction;
        });
    } catch (error) {
        logger.error("Create Points Transaction Error:", {
            message: error?.message,
            module: "controller/createPointTransaction.js"
        });
    }
}
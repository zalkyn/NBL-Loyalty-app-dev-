import prisma from "db-server";

// ====================== SERVICE FUNCTION ======================
export async function createPointsTransaction(input, session) {
    console.log("Creating Points Transaction with input:", JSON.stringify(input, null, 2));
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

            const currentBalance = customer.points;
            const newBalance = Math.max(0, currentBalance + input.points);

            // Create Points Transaction
            const transaction = await tx.pointsTransaction.create({
                data: {
                    customerId: input.customerId,
                    type: input.type,
                    points: input.points,
                    balanceAfter: newBalance,
                    eventId: input.eventId || null,
                    referenceId: input.referenceId || null,
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
                    ...(input.type === "EARN" && {
                        lifetimePoints: { increment: input.points }
                    })
                }
            });

            // Create Activity Log
            await tx.activityLog.create({
                data: {
                    customerId: input.customerId,
                    activityType: `${input.type}_POINTS`,
                    source: input.type === "ADJUST" ? "ADMIN" : "SYSTEM",
                    points: input.points,
                    status: "SUCCESS",
                    referenceId: input.referenceId,
                    metadata: input.metadata,
                }
            });

            return transaction;
        });
    } catch (error) {
        console.error("Create Points Transaction Error:", error);
    }
}
import prisma from "../../db.server.js";

/**
 * Prevent duplicate webhook processing
 * Returns true = already processed
 */
export async function isDuplicateEvent({ shop, eventKey }) {
    try {
        await prisma.webhookEvent.create({
            data: { shop, eventKey }
        });
        return false; // first time
    } catch (err) {
        // unique constraint failed → duplicate
        return true;
    }
}
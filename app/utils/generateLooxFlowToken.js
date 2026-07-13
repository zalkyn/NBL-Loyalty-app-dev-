import crypto from "node:crypto";
import prisma from "../db.server.js";
import { logger } from "./logger.js";

/** @constant {number} Random bytes of entropy per token (-> 48 hex chars) */
const TOKEN_BYTES = 24;

/** @constant {number} Maximum attempts before throwing on collision */
const MAX_ATTEMPTS = 5;

/**
 * Generates a cryptographically random hex token.
 *
 * Unlike generateReferralCode.js / generateDiscountCode.js (Math.random,
 * fine for low-stakes uniqueness), this token doubles as a bearer secret —
 * it authenticates api/loox-new-review-trigger/:token — so it must come
 * from a CSPRNG. 24 bytes (192 bits) makes collision or brute-force guessing
 * infeasible.
 *
 * @returns {string} 48-character hex string
 */
function generateToken() {
    return crypto.randomBytes(TOKEN_BYTES).toString("hex");
}

/**
 * Generates a unique Loox Flow token by checking against existing
 * AppSettings rows. Retries up to MAX_ATTEMPTS times on collision before
 * throwing — collision is astronomically unlikely at 192 bits of entropy,
 * this is just defensive symmetry with the codebase's other generators.
 *
 * @returns {Promise<string>} A unique 48-character hex token
 * @throws {Error} If a unique token cannot be generated within MAX_ATTEMPTS tries
 */
export default async function generateLooxFlowToken() {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const token = generateToken();

        const exists = await prisma.appSettings.findUnique({
            where: { looxFlowToken: token },
            select: { id: true },
        });

        if (!exists) {
            if (attempt > 1) {
                logger.info(`Loox Flow token generated after ${attempt} attempts`);
            }
            return token;
        }

        logger.warn(`Loox Flow token collision on attempt ${attempt}/${MAX_ATTEMPTS}`);
    }

    throw new Error(`Failed to generate a unique Loox Flow token after ${MAX_ATTEMPTS} attempts`);
}

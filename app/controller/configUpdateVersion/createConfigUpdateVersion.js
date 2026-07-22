import crypto from "node:crypto";
import prisma from "../../db.server.js";
import { logger } from "../../utils/logger.js";

/** @constant {number} Random bytes of entropy per version key (-> 32 hex chars) */
const KEY_BYTES = 16;

/** @constant {number} Maximum attempts before throwing on collision */
const MAX_ATTEMPTS = 5;

/**
 * Generates a unique version key. Doesn't need to be a secret (it's read
 * back out to every customer's own metafield and compared client-side), so
 * plain randomness is enough — collision-avoidance against other rows is
 * what actually matters here, same rationale as generateReferralCode.js.
 *
 * @returns {Promise<string>}
 */
async function generateVersionKey() {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const key = crypto.randomBytes(KEY_BYTES).toString("hex");

        const exists = await prisma.configUpdateVersion.findUnique({
            where: { versionKey: key },
            select: { id: true },
        });

        if (!exists) return key;

        logger.warn("Config update version key collision", { attempt, module: "createConfigUpdateVersion" });
    }

    throw new Error(`Failed to generate a unique version key after ${MAX_ATTEMPTS} attempts`);
}

/**
 * Creates a new "config update" version for a shop — this is what the
 * widget's update banner compares against (see widgetConfigVersion.js /
 * mergeCustomerConfig() on the widget side).
 *
 * Deactivates any previously-active version for this shop first (only one
 * `isActive` row per shop at a time), but never deletes old rows — this is
 * an append-only audit history of what was announced and when.
 *
 * Does NOT touch the shop metafield itself — the caller (the admin route
 * action) is responsible for calling syncAppConfig afterward so the new
 * active version becomes visible to the storefront. Keeping that separate
 * here mirrors the existing customize page's upsertAndSync pattern.
 *
 * @param {Object} params
 * @param {string} params.shop
 * @param {string} params.title       - Shown in the widget banner.
 * @param {string} [params.description] - Optional longer text, also shown in the banner.
 * @returns {Promise<Object>} The newly created ConfigUpdateVersion row.
 */
export default async function createConfigUpdateVersion({ shop, title, description }) {
    if (!shop) throw new Error("shop is required");
    if (!title || !title.trim()) throw new Error("title is required");

    const versionKey = await generateVersionKey();

    const [, created] = await prisma.$transaction([
        prisma.configUpdateVersion.updateMany({
            where: { shop, isActive: true },
            data: { isActive: false },
        }),
        prisma.configUpdateVersion.create({
            data: {
                shop,
                versionKey,
                title: title.trim(),
                description: description?.trim() || null,
                isActive: true,
            },
        }),
    ]);

    logger.success("Config update version created", { shop, versionKey, title: created.title });

    return created;
}

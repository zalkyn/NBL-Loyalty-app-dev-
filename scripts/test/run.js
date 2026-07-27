#!/usr/bin/env node
/**
 * @file scripts/test/run.js
 * @description Runs every *.test.js file in this folder and prints one
 * combined pass/fail report.
 *
 * Usage:
 *   npm test                 -> everything, including the DB-backed
 *                                integration test (needs a local
 *                                DATABASE_URL — see backfillIntegration.test.js)
 *   npm run test:unit        -> only the pure-function unit tests
 *                                (computePoints, normalizeSegmentMemberGid) — no DB
 *                                needed at all, safe to run anywhere
 *   node scripts/test/run.js --allow-remote
 *                             -> forwarded through to
 *                                backfillIntegration.test.js's own safety
 *                                check, for the rare case you deliberately
 *                                want to run it against a remote DB
 */

import { report } from "./lib/assert.js";
import { run as runComputePoints } from "./computePoints.test.js";
import { run as runNormalizeSegmentMemberGid } from "./normalizeSegmentMemberGid.test.js";

const unitOnly = process.argv.includes("--unit-only");

await runComputePoints();
await runNormalizeSegmentMemberGid();

if (!unitOnly) {
    const { run: runBackfillIntegration } = await import("./backfillIntegration.test.js");
    await runBackfillIntegration();
    const prisma = (await import("../../app/db.server.js")).default;
    await prisma.$disconnect();
}

process.exit(report() ? 0 : 1);

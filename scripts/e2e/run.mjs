#!/usr/bin/env node
/**
 * One command for the whole end-to-end check:  npm run test:e2e
 *
 * Creates a throwaway local database (nbl-e2e) next to your dev one, applies the
 * migrations, runs the job/action scenarios (e2e.mjs) and the page-render checks
 * (render.mjs) against it, then drops it. Your dev database is never touched.
 * Only runs against a local Postgres.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const env = fs.readFileSync(path.join(root, ".env"), "utf8");
const dev = env.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
if (!dev || !/@(localhost|127\.0\.0\.1)[:/]/.test(dev)) { console.error("Refusing: .env DATABASE_URL is not a local database."); process.exit(1); }

const base = dev.replace(/\/[^/?]+(\?.*)?$/, "");
const e2eUrl = `${base}/nbl-e2e`;
const { PrismaClient } = createRequire(path.join(root, "package.json"))("@prisma/client");
const admin = new PrismaClient({ datasourceUrl: `${base}/postgres` });
const childEnv = { ...process.env, DATABASE_URL: e2eUrl, LOG_LEVEL: "silent", NODE_ENV: "test" };
const run = (args) => spawnSync(process.execPath, args, { cwd: root, env: childEnv, stdio: "inherit" }).status === 0;
const npx = (args) => spawnSync("npx", args, { cwd: root, env: childEnv, stdio: "inherit" }).status === 0;

let ok = false;
try {
    await admin.$executeRawUnsafe('DROP DATABASE IF EXISTS "nbl-e2e"');
    await admin.$executeRawUnsafe('CREATE DATABASE "nbl-e2e"');
    ok = npx(["prisma", "migrate", "deploy"])
        && run(["--import", "./scripts/e2e/register.mjs", "scripts/e2e/e2e.mjs", "--keep"])
        && run(["scripts/e2e/render.mjs"]);
} finally {
    await admin.$executeRawUnsafe('DROP DATABASE IF EXISTS "nbl-e2e"').catch(() => {});
    await admin.$disconnect();
}
process.exit(ok ? 0 : 1);

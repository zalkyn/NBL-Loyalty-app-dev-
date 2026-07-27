#!/usr/bin/env node
/**
 * @file scripts/prisma.js
 * @description ONE command for every Prisma CLI operation, against the
 * local database, the production database, or both — no more manually
 * swapping DATABASE_URL in .env by hand.
 *
 * Usage:
 *   npm run prisma:local -- <prisma command> [...args]
 *   npm run prisma:prod  -- <prisma command> [...args]
 *   npm run prisma:both  -- <prisma command> [...args]
 *
 * Examples:
 *   npm run prisma:local -- migrate dev --name add_points_backfill
 *   npm run prisma:prod  -- migrate deploy
 *   npm run prisma:both  -- migrate deploy
 *   npm run prisma:local -- studio
 *   npm run prisma:prod  -- migrate status
 *
 * ── How targeting actually works ─────────────────────────────────────────
 *   local:
 *     Runs `prisma` directly, nothing else. Prisma's own CLI already
 *     auto-loads .env from the project root on every command — this is
 *     completely unchanged from what already happens today running
 *     `npx prisma ...` by hand. See:
 *     https://www.prisma.io/docs/orm/more/dev-environment/environment-variables
 *
 *   production:
 *     Reads .env.production from the project root and merges its
 *     variables into the CHILD process's environment before spawning
 *     `prisma`. Verified directly against Prisma's own documentation and
 *     an official GitHub discussion: an environment variable that is
 *     ALREADY SET when a process starts always wins over the same key
 *     found later in a .env file
 *     (https://github.com/prisma/prisma/discussions/21207) — Prisma's own
 *     CLI follows this rule too. Since this script sets DATABASE_URL (and
 *     anything else in .env.production) on the CHILD process's env before
 *     prisma even starts, prisma's own internal auto-load of the plain
 *     .env file cannot override it. .env itself is never read or touched
 *     by this path at all.
 *
 *   both:
 *     Runs the command against LOCAL FIRST, then — only if that
 *     succeeded — PRODUCTION. Deliberately restricted to a short
 *     allowlist (see ALLOWED_FOR_BOTH below), much stricter than the
 *     production-only blocklist further down. `migrate dev` fundamentally
 *     doesn't make sense run against two databases at once: it GENERATES
 *     a new migration file from your current schema diff, then applies
 *     it — production must only ever apply migration files that already
 *     exist and were reviewed, via `migrate deploy`, never generate its
 *     own on the fly. `migrate reset` is destructive by design. The real
 *     workflow is sequential, not simultaneous: `prisma:local --
 *     migrate dev` to create + apply a migration locally, review it,
 *     commit it, and only then `prisma:both -- migrate deploy` (or
 *     `prisma:prod`) once you're ready to ship it.
 *
 * ── Why a wrapper script instead of just `dotenv-cli` ────────────────────
 * Prisma's own docs recommend dotenv-cli for exactly this "multiple .env
 * files" scenario. This script does the same underlying thing (load a
 * named .env file, merge into the child's environment) with a few extra
 * lines of built-in Node instead of a new dependency — and it's what
 * makes the safety nets below possible, which a plain `dotenv -e ... --
 * prisma ...` one-liner couldn't do on its own.
 *
 * ── Safety nets ───────────────────────────────────────────────────────
 * `migrate dev`, `migrate reset`, and `db push` can all drop or reset
 * real data (that's normal, expected behavior for local iteration) — they
 * must never run against production, under any target. This is not a
 * hypothetical concern: https://github.com/prisma/prisma/discussions/21207
 * is someone's own account of emptying their production tables this exact
 * way, from a stray environment variable silently taking precedence over
 * what they intended. Blocked outright, no override flag — if this is
 * ever genuinely necessary, run prisma manually outside this script, so
 * bypassing the guard rail is a deliberate, visible choice, not an
 * accidental one.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const USAGE = `Usage:
  npm run prisma:local -- <prisma command> [...args]
  npm run prisma:prod  -- <prisma command> [...args]
  npm run prisma:both  -- <prisma command> [...args]

Examples:
  npm run prisma:local -- migrate dev --name add_points_backfill
  npm run prisma:prod  -- migrate deploy
  npm run prisma:both  -- migrate deploy
  npm run prisma:local -- studio
  npm run prisma:prod  -- migrate status`;

const [target, ...prismaArgs] = process.argv.slice(2);

if (!["local", "production", "both"].includes(target) || prismaArgs.length === 0) {
    console.error(USAGE);
    process.exit(1);
}

// ── Production safety net (applies to target=production AND the
//    production half of target=both) ─────────────────────────────────────

/** @constant {string[][]} Subcommand prefixes blocked when target=production. */
const BLOCKED_IN_PRODUCTION = [
    ["migrate", "dev"],
    ["migrate", "reset"],
    ["db", "push"],
    ["db", "seed"], // not currently configured in package.json, blocked pre-emptively regardless
];

// ── "both" allowlist — much stricter. Only commands that are equally
//    safe/meaningful run twice in a row, non-interactively, with no
//    chance of the two runs disagreeing with each other. ─────────────────

/** @constant {string[][]} The ONLY subcommand prefixes allowed under target=both. */
const ALLOWED_FOR_BOTH = [
    ["migrate", "deploy"],
    ["migrate", "status"],
    ["migrate", "diff"],
    ["generate"],
    ["validate"],
    ["format"],
    ["version"],
];

function matchesPrefix(cmd) {
    return cmd.every((part, i) => prismaArgs[i] === part);
}

if (target === "both") {
    const allowed = ALLOWED_FOR_BOTH.some(matchesPrefix);
    if (!allowed) {
        const isDestructive = BLOCKED_IN_PRODUCTION.some(matchesPrefix);
        console.error(
            `\n✘ "prisma ${prismaArgs.join(" ")}" can't run against both databases at once.\n` +
            `  Allowed under --both: ${ALLOWED_FOR_BOTH.map((c) => `"${c.join(" ")}"`).join(", ")}.\n\n` +
            (isDestructive
                ? `  This one is deliberately excluded — it can drop or reset real data, and that's not\n` +
                `  a risk this wrapper takes on your behalf against production. If you genuinely mean\n` +
                `  to run it there, do so manually with .env.production loaded, outside this script —\n` +
                `  see .env.production's own header comment.\n`
                : `  If you're trying to create a new migration: that only ever happens locally.\n` +
                `    1. npm run prisma:local -- migrate dev --name your_migration_name\n` +
                `    2. Review the generated SQL, test it, commit the migration folder.\n` +
                `    3. When ready to ship: npm run prisma:both -- migrate deploy\n` +
                `       (applies that same already-created migration to local AND production)\n`)
        );
        process.exit(1);
    }
}

if (target === "production" || target === "both") {
    const blocked = BLOCKED_IN_PRODUCTION.find(matchesPrefix);
    if (blocked) {
        console.error(
            `\n✘ "prisma ${blocked.join(" ")}" is blocked against production — it can drop or reset real data.\n` +
            `  For local development: npm run prisma:local -- ${blocked.join(" ")}\n` +
            `  To apply already-created migrations safely: npm run prisma:prod -- migrate deploy\n`
        );
        process.exit(1);
    }
}

// ── Run ───────────────────────────────────────────────────────────────

if (target === "both") {
    console.log(`═══ Step 1/2 — LOCAL ═══`);
    const localCode = runOneTarget("local", prismaArgs);
    if (localCode !== 0) {
        console.error(`\n✘ Local run failed (exit ${localCode}) — stopping before touching production.\n`);
        process.exit(localCode);
    }

    console.log(`\n═══ Step 2/2 — PRODUCTION ═══`);
    const prodCode = runOneTarget("production", prismaArgs);
    if (prodCode !== 0) {
        console.error(
            `\n✘ Production run failed (exit ${prodCode}).\n` +
            `  Local already succeeded above — your local and production databases may now be` +
            ` out of sync until this is resolved. Check the error above and re-run` +
            ` "npm run prisma:prod -- ${prismaArgs.join(" ")}" once fixed.\n`
        );
        process.exit(prodCode);
    }

    console.log(`\n✓ Succeeded on both local and production.\n`);
    process.exit(0);
} else {
    process.exit(runOneTarget(target, prismaArgs));
}

// ── Core single-target runner — shared by target=local, target=production,
//    and each half of target=both. ───────────────────────────────────────

function runOneTarget(oneTarget, args) {
    let childEnv = process.env;

    if (oneTarget === "production") {
        const envPath = path.join(ROOT, ".env.production");
        if (!existsSync(envPath)) {
            console.error(
                `\n✘ .env.production not found at the project root.\n` +
                `  Copy .env.production.example to .env.production and fill in your real production DATABASE_URL.\n` +
                `  This file is gitignored — it never gets committed.\n`
            );
            return 1;
        }
        // File values are spread LAST (win over process.env) deliberately —
        // when you explicitly ask for target=production (directly, or as
        // the second half of target=both), this script's own
        // .env.production must be the final word, even if some stray
        // DATABASE_URL happens to already be set in your shell. That
        // stray-var scenario is exactly what caused the real incident
        // linked in this file's header comment.
        childEnv = { ...process.env, ...parseEnvFile(envPath) };
        console.log(`→ Running against PRODUCTION (.env.production)\n`);
    } else {
        console.log(`→ Running against LOCAL (.env)\n`);
    }

    const result = spawnSync("npx", ["prisma", ...args], {
        cwd: ROOT,
        env: childEnv,
        stdio: "inherit",
        shell: process.platform === "win32",
    });

    return result.status ?? 1;
}

// ── Minimal .env parser ───────────────────────────────────────────────
// Just KEY=VALUE lines, '#' comments, blank lines, optional quotes.
// Doesn't need dotenv's full feature set (variable expansion, multiline
// values, etc.) for a file that's realistically DATABASE_URL plus maybe
// one or two more — kept intentionally small and dependency-free.

function parseEnvFile(filePath) {
    const out = {};
    const lines = readFileSync(filePath, "utf-8").split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        out[key] = value;
    }
    return out;
}
# scripts/

## `prisma.js` — one command for local + production

Stop manually swapping `DATABASE_URL` in `.env` between local and production.

```bash
npm run prisma:local -- migrate dev --name add_points_backfill
npm run prisma:local -- studio
npm run prisma:prod  -- migrate deploy
npm run prisma:prod  -- migrate status
npm run prisma:both  -- migrate deploy
```

Shortcuts for the most common commands:

```bash
npm run db:studio        # = prisma:local -- studio
npm run db:deploy        # = prisma:prod  -- migrate deploy
npm run db:deploy:both   # = prisma:both  -- migrate deploy
```

**`both` runs local first, then production — and only a short allowlist (`migrate deploy`, `migrate status`, `generate`) is allowed.** `migrate dev` and `migrate reset` can never run under `both` (or under `production` at all) — `migrate dev` generates a brand-new migration from your current schema diff, which only ever makes sense locally; production must only apply migrations that already exist, reviewed and committed, via `migrate deploy`. The normal flow is sequential, not simultaneous:

1. `npm run prisma:local -- migrate dev --name your_migration_name` — creates + applies the migration locally.
2. Review the generated SQL, test it, commit the migration folder.
3. `npm run prisma:both -- migrate deploy` (or `prisma:prod`) once you're ready to ship it.

If the local half of a `both` run fails, the production half never runs — it stops immediately, so you're never left applying a migration to production that didn't even work locally.

**Setup:** copy `.env.production.example` to `.env.production` at the project root and fill in your real production `DATABASE_URL`. It's gitignored — never committed. Local development needs no setup change at all; it keeps using the existing `.env` exactly as before.

**Safety:** `migrate dev`, `migrate reset`, and `db push` are hard-blocked against production — they can drop or reset real data and must never run there. There's no override flag. If you ever genuinely need one of these against production, run `prisma` manually yourself, outside this script, so it's a deliberate choice.

This has nothing to do with the deployed app container's own `DATABASE_URL` — Railway injects that directly at runtime. `.env.production` is only for running one-off Prisma commands against production from your own machine.

## `test/` — testing the Points Backfill feature

```bash
npm test           # everything, including the DB-backed integration test
npm run test:unit  # only the pure-function tests — no database needed at all
```

| File | What it checks | Needs a DB? |
|---|---|---|
| `computePoints.test.js` | `computePoints()` / `currencyMatches()` — FIXED vs PER_AMOUNT math, floor-division, `maxPoints` cap, zero/negative spend, unknown `rateType` throws | No |
| `matchesAudience.test.js` | `matchesAudience()` — tag include (OR), tag exclude (AND-not), `createdBefore` cutoff, combinations, missing fields | No |
| `backfillIntegration.test.js` | The real thing, against a real local database: creates a throwaway test shop/session/customer/shadow rule, runs the exact pipeline `pointsBackfillJob.js` uses, then verifies — for real, not mocked — that the `@@unique` idempotency constraint rejects a duplicate award, that `createTransaction()` returns `null` (not a crash) if a ShadowRule id is ever mistakenly passed as `pointsRuleId`, and that the `Restrict` FK actually blocks deleting a ShadowRule that's already awarded points. Cleans up everything it creates, on both success and failure. | **Yes — local only.** Refuses to run against anything that doesn't look like `localhost`/`127.0.0.1` unless you pass `--allow-remote`. |

Run any single file directly too, e.g. `node scripts/test/computePoints.test.js`.

There's no test framework installed in this project (no jest/vitest/mocha — see `scripts/test/lib/assert.js`'s own header comment for why this is a small dependency-free runner instead of pulling one in). If the test suite grows a lot, that'd be a good time to reconsider.

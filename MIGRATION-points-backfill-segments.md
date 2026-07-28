# Points Backfill — segment-based rework

Replaces the tag-filter audience with Shopify customer segments, and adds a
frozen preview step between choosing an audience and awarding points.

---

## Why

The old run paged the shop's **entire** customer list and filtered each page in
application code. That was a correct response to a real constraint —
Shopify deprecated the `tag`, `tag_not`, `customer_date` and `total_spent`
Customer search filters in Admin API **2024-07**, so there was no supported way
to narrow the query server-side.

It was expensive, though. On a 100k-customer shop, at one 50-customer page per
30-second cycle, reaching an audience of ~2k people took roughly **16 hours**,
about 98% of it spent fetching and discarding customers who were never in scope.

Segments are the replacement Shopify itself points at. Membership is evaluated
by Shopify, so the run only ever sees the audience.

**Result: ~16 hours → under 5 minutes** for the same 2,000-customer backfill.

---

## What a merchant does now

1. Build a segment in Shopify admin (**Customers → Segments**)
2. On the Points Backfill page: pick a rule, pick that segment
3. See the live member count immediately (one cheap API call)
4. **Build preview** — freezes the member list and costs each one against the rule
5. Review: how many get points, how many points in total, who gets skipped and why
6. **Download the CSV** and check it
7. **Award points** — runs against exactly the frozen list, nothing else

---

## The two things that drove the design

### 1. `CustomerSegmentMember.id` is not documented as the Customer id

`customerSegmentMembers` returns ids shaped like:

```
gid://shopify/CustomerSegmentMember/8675309
                                    └─ this is the Customer id
```

The 1:1 relationship is confirmed by Shopify staff on the developer forum
(July 2025) and appears in Shopify's own segments guide example — but the API
reference documents `id` only as *"The member's ID"*, with no stated
relationship to `Customer`. The same staff reply noted the feedback had been
passed on to change the behaviour.

If it ever changes, the rewrite doesn't throw and doesn't return null. It
silently produces a valid-looking GID **for the wrong customer**, and awards
real points to them.

So every snapshot build samples five members, resolves their rewritten GIDs as
real `Customer` records, and compares email addresses. Mismatch → the snapshot
is marked `FAILED` and nothing runs. A snapshot where nothing could be verified
(no member has an email) also fails — *"nothing contradicted the assumption"* is
not the same as *"the assumption was confirmed"*.

See `app/controller/backfillAudience/verifyMemberGidMapping.js`.

### 2. Segments are live, and approval has to mean something

Segment membership isn't recomputed synchronously when customer data changes,
and it moves on its own between the moment a CSV is exported and the moment
someone clicks Start. Reading the segment live during a multi-cycle run would
mean the list that was approved and the list that was processed are two
different sets — which makes the CSV evidence of nothing.

A snapshot is frozen. A side benefit falls out of it: **the run makes zero
Shopify API calls.** No rate limiting, no mid-run network failure, and no
dependency on an opaque pagination cursor still being valid hours after it was
issued.

---

## ⚠️ Required: run the job poller in development

`shopify app dev` runs `react-router dev`, which starts the app only.
`initJobs()` lives in `server.js` and is never loaded — so **no background job
runs in development**. Not this feature, and not `BULK_CUSTOMER_SYNC`,
`ORDER_PAID`, or any maintenance cron either. Jobs queue as `PENDING` rows that
nothing picks up, and anything that enqueues one appears to hang with no error.

Run the poller in a second terminal:

```bash
npm run dev      # terminal 1 — the app
npm run jobs     # terminal 2 — the cron poller
```

`npm run jobs` is `server/jobsRunner.js`: `initJobs()` and nothing else. No
Express, no Vite, no second HTTP listener.

Don't use `npm run start` for this — it expects `NODE_ENV=production` and loads
`build/server/index.js`, so it needs a fresh `npm run build` after every change
and serves stale compiled code otherwise.

**Two pollers at once is safe.** Locking is distributed, not in-process:
`lockJob()` claims a row in the `JobLock` table with a conditional update, so a
second poller finds the lock held and skips the cycle. The jobs themselves claim
work with `updateMany({ where: { status: "PENDING" } })` rather than
read-then-write, so the same guarantee holds at row level. This also means
multiple server replicas in production are fine.

In production nothing changes — `npm start` runs `server.js`, which calls
`initJobs()` as it always has.

---

## Deploy steps

```bash
# 1. Generate and apply the migration (two new tables, no changes to existing ones)
npx prisma migrate dev --name add_backfill_audience_snapshot

# 2. Verify
npm run test:unit        # 27 tests, no DB needed
npm test                 # includes the DB integration test (needs local DATABASE_URL)
```

No data migration is needed. Existing `PointsBackfillEntry` rows are untouched
and the historical export still works.

### Access scope

`read_customers` covers `customerSegmentMembers` and `segments`. If the app
already reads customers — it does — nothing changes. No reinstall, no scope
prompt.

---

## Worth verifying once on your own store

Run this in GraphiQL against a real segment before the first production
backfill. The code checks it automatically on every build, but seeing it
yourself is worth five minutes:

```graphql
query {
  customerSegmentMembers(segmentId: "gid://shopify/Segment/YOUR_ID", first: 3) {
    totalCount
    edges { node { id defaultEmailAddress { emailAddress } } }
  }
}
```

Take the number from a returned `id`, then confirm the same person comes back:

```graphql
query {
  customer(id: "gid://shopify/Customer/THAT_NUMBER") {
    defaultEmailAddress { emailAddress }
  }
}
```

Same email → the mapping holds on your store.

---

## Files

### New

| File | Purpose |
|---|---|
| `app/graphql/mutation/segments/createSegment.js` | Create a segment from tags, in-app |
| `app/dev-config/points-backfill/components/ActiveWorkBanner.jsx` | Shop-wide "something is running" notice |
|---|---|
| `app/utils/backfill/normalizeSegmentMemberGid.js` | The GID rewrite, strict and idempotent |
| `app/graphql/query/shop/segments.js` | List / fetch segments |
| `app/graphql/query/customerSegmentMembers.js` | Member count + paginated members |
| `app/controller/backfillAudience/verifyMemberGidMapping.js` | The safety gate |
| `app/controller/backfillAudience/snapshot.js` | Snapshot lifecycle |
| `server/jobs/snapshotBuildJob.js` | Builds a snapshot, one page per cycle |
| `app/dev-config/points-backfill/components/SegmentSelector.jsx` | Segment picker |
| `app/dev-config/points-backfill/components/SnapshotPreview.jsx` | Review + start |
| `app/dev-config/points-backfill/preview-export/route.jsx` | Pre-run CSV |
| `scripts/test/normalizeSegmentMemberGid.test.js` | 12 unit tests |

### Creating segments from the app

The page has a "create one from tags" form covering the common backfill
audience — *anyone with at least one of these tags*:

```
customer_tags CONTAINS 'member:tier_one' OR customer_tags CONTAINS 'member:tier_two'
```

The ShopifyQL is built **server-side** from the tag values; the browser never
sends a raw segment query. Tags containing an apostrophe are rejected rather
than escaped — Shopify documents the segment query syntax but not its escape
sequence for a quote inside a quoted literal, and guessing wrong silently
produces a segment matching the wrong customers rather than an error.

Anything more involved is still better built in Shopify's own editor and picked
from the dropdown. A segment created here is an ordinary segment and can be
edited there.

### Rewritten

`server/jobs/pointsBackfillJob.js` · `app/controller/jobs/pointsBackfill.js` ·
the whole `app/dev-config/points-backfill/` page (loader, action, hooks, route,
guide modal)

### Removed

| File | Why |
|---|---|
| `app/utils/backfill/matchesAudience.js` | Shopify evaluates the audience now |
| `app/dev-config/points-backfill/components/AudienceForm.jsx` | Replaced by `SegmentSelector` |
| `scripts/test/matchesAudience.test.js` | Tested a deleted module |
| `customersPage` export in `app/graphql/query/customers.js` | Only POINTS_BACKFILL used it |

### Schema

Two new tables, `BackfillAudienceSnapshot` and `BackfillAudienceMember`, plus
back-relations on `Session` and `ShadowRule`. Nothing existing was altered.

---

## Leaving the page mid-job

Everything is DB-backed, so closing the tab changes nothing — the cron keeps
advancing the job, and the page reads current state on load.

Two things make that actually work in the UI:

- **`ActiveWorkBanner`** is shop-wide, not scoped to the selected rule. Someone
  who comes back through the nav menu with no `ruleId` in the URL still sees
  that work is running, with a jump link to the rule it belongs to.
- **Polling makes no Shopify calls.** The loader skips the live segment count
  whenever a job is active, so a 3-second poll over a long build is pure local
  DB reads. Without this it fired one Shopify API call every 3 seconds for a
  number nobody was looking at.

---

## Behaviour notes

- **A preview can only be used once.** Running the same rule again needs a fresh
  preview — membership has moved, and the merchant should approve what's true
  then.
- **The run recomputes points rather than trusting the preview.** A rule can be
  edited between preview and start; the award reflects the rule at award time. A
  divergence is logged (`logger.warn`), not silently reconciled — it means the
  approved CSV no longer describes what happened.
- **`amountSpent` is *not* recomputed.** It's frozen at snapshot time, so *"why
  did this customer get exactly N points"* stays answerable from stored rows
  alone.
- **Deactivating a rule still halts a run in flight**, checked every cycle. It
  now also halts a preview build.
- **Failed awards aren't marked processed**, so a later run retries them. The
  `@@unique([shadowRuleId, customerId])` constraint prevents double-awarding.

---

## Tuning

| Constant | File | Value | Note |
|---|---|---|---|
| `PAGE_SIZE` | `snapshotBuildJob.js` | 250 | Shopify allows 1000; smaller pages retry faster |
| `BATCH_SIZE` | `pointsBackfillJob.js` | 250 | Was 50 — the old cap existed for rate limits that no longer apply |
| `CONCURRENCY` | `pointsBackfillJob.js` | 10 | Unchanged; bounded by the connection pool |
| `SAMPLE_SIZE` | `verifyMemberGidMapping.js` | 5 | Guards a systemic change, not per-row corruption |
| `backfill_snapshot` cron | `jobConfig.js` | 10s | Faster than the run — someone is watching this one |
## Project Structure

This repo contains TWO SEPARATE PROJECTS with no code sharing between
them: `server/` and `client/`. Each runs fully independently with its
own package.json, its own dependency tree, its own tsconfig, and its
own test/build pipeline. The only connection between them is the HTTP
API (the client only talks to the server over the network). They are
kept in a single repo purely for review convenience and so the local
environment can be brought up with a single `docker compose up` — they
have no architectural or code-level dependency on each other.

# Panteon Leaderboard — Server

Weekly leaderboard system. Stack: Node.js + Express + TypeScript,
PostgreSQL (Prisma 7 + `@prisma/adapter-pg`), MongoDB (Mongoose), Redis
(ioredis).

## Bringing up the local development environment

1. Start the dependency services (Postgres, Redis, MongoDB) via Docker:

   ```bash
   docker compose up -d
   docker compose ps   # verify all three are "healthy"
   ```

2. Install the server project's dependencies:

   ```bash
   cd server
   npm install
   ```

3. Copy `server/.env.example` to `server/.env` and update the values if
   needed (e.g. in case of a port conflict):

   ```bash
   cp .env.example .env
   ```

4. Run the initial migration (with the Postgres container up):

   ```bash
   npx prisma migrate dev
   ```

   Connection config for the Prisma CLI (`generate`/`migrate`/`validate`)
   lives in `server/prisma.config.ts`, not in `schema.prisma` — this is
   required as of Prisma 7. It reads `DATABASE_URL` from `.env` the same
   way as before, so no extra setup is needed here. At runtime, the app
   itself connects via `@prisma/adapter-pg` (see `src/config/postgres.ts`).

5. Start the dev server:

   ```bash
   npm run dev
   ```

6. Verify:

   ```bash
   curl localhost:3000/health
   ```

   Should return a JSON payload with the connectivity status of
   Postgres, Redis, and MongoDB.

## Leaderboard architecture (Redis)

The weekly leaderboard is fully Redis-backed, driven by three atomic Lua
scripts under `server/src/lua/`, loaded as native ioredis commands via
`server/src/config/luaScripts.ts`.

- **`leaderboard:week:{weekId}`** (ZSET, e.g. `weekId = "2026-W31"`) —
  member is `userId`, score is a compound value:
  `score = earningsInCents * 20000 + (20000 - minutesSinceWeekStart)`.
  Earnings is the primary sort key; on a tie, the user who reached that
  total earlier in the week (closer to week start) ranks higher.
- **`earnings:week:{weekId}`** (hash, field `userId` → `earningsInCents`)
  — holds raw earnings so they can be recovered for score recalculation;
  the ZSET score alone can't be decomposed back into earnings + minutes.
  Only meaningful during the *active* week — explicitly deleted on
  cutover, not left to expire via TTL.
- **`config:currentWeekId`** — the currently active week.
- **`leaderboard:archive:{weekId}`** — where a week's leaderboard ends up
  after cutover (30-day TTL).

Scripts:
- `earnScore.lua` — atomically increments a user's weekly earnings and
  recomputes/writes their leaderboard score in one round-trip.
- `rankWindow.lua` — returns a user's rank plus up to 3 places above and
  2 below in a single round-trip, clamped at both ends of the
  leaderboard.
- `weekCutover.lua` — idempotently archives the outgoing week's
  leaderboard (rename + TTL), deletes its earnings hash, and advances
  `config:currentWeekId`.

Run the integration tests (require the Redis container from
`docker compose up -d` to be running):

```bash
cd server
npm run test tests/lua.test.ts
```

## Leaderboard module (`src/modules/leaderboard/`)

A thin, layered wrapper around the Redis primitives above:

- `leaderboard.repository.ts` — Redis-only, no business logic:
  `getTop100`, `getRankWindow`, `getUserEarnings`/`getUsersEarnings`
  (batched), `recordEarning`, `getCurrentWeekId`.
- `leaderboard.service.ts` — resolves the active `weekId` (falls back to
  a computed ISO week if `config:currentWeekId` isn't set yet), enriches
  Redis results with `username` from Postgres (batched `findMany`, no
  N+1), and shapes the HTTP response. `earn()` also writes a MongoDB
  `earning_event` document (`src/db/mongo/models/earningEvent.model.ts`,
  90-day TTL index on `createdAt`).
- `leaderboard.controller.ts` / `leaderboard.routes.ts` — HTTP + zod
  validation boundary.
- `week.util.ts` — Monday-start ISO 8601 week helpers, used to compute
  `earnScore.lua`'s `minutesSinceWeekStart` argument.

Routes (mounted in `server.ts`):

- `GET /leaderboard/top` — top 100 for the active (or `?weekId=`) week.
- `GET /leaderboard/me` — the caller's own rank: full row if inside the
  top 100, a ±3/±2 window around them if not, or an empty/`null` shape
  if they've never earned anything. Behind `requireAuth` (see the Auth
  section below).
- `POST /earnings/earn` — body `{ "amountInCents": number }` (positive
  integer, zod-validated), behind `requireAuth` and the per-user rate
  limiter (see below).

All three response shapes (`entries` always the same
`{ rank, userId, username, earningsInCents, isCurrentUser? }` object
list, `myRank`/`myEarningsInCents` kept at the top level) are documented
field-by-field in `AI_WORKFLOW.md`.

`earningsInCents` enrichment only works for the currently *active* week,
since `earnings:week:{weekId}` is deleted on cutover — querying an
archived week isn't supported by this module (that's Postgres's
`WeeklyResult`).

Run the leaderboard service tests (require Redis **and** Postgres from
`docker compose up -d`):

```bash
cd server
npm run test tests/leaderboard.service.test.ts
```

## Auth (`src/modules/auth/`, `src/middleware/auth.middleware.ts`)

There is no registration flow. `POST /auth/login` (body: `{ "username": string }`,
zod-validated) checks whether the username already exists in Postgres — if
so it returns a signed JWT (`{ token, userId, username, role }`), otherwise
404. Tokens carry `{ userId, username, role }` and are verified by
`requireAuth`, which sets `req.userId`/`req.userRole` for downstream
handlers; `requireAdmin` (chained after `requireAuth`) additionally 403s
non-`ADMIN` roles. `GET /leaderboard/me` and `POST /earnings/earn` both sit
behind `requireAuth`.

**JWT expiry is 2 hours** (`JWT_EXPIRY` in `.env`, defaults to `2h` if
unset) — a deliberate demo/review convenience, not a production setting,
since there is no refresh-token flow yet: a reviewer clicking through the
app for a while shouldn't get logged out mid-session. Production should use
a short-lived token (~15m) plus a refresh token instead.

## Rate limiting (`src/middleware/rateLimiter.ts`)

`POST /earnings/earn` is rate-limited to **60 requests/minute, per user**
(keyed on `req.userId`, not IP), backed by `express-rate-limit` +
`rate-limit-redis` so the limit is shared across instances. It's keyed on
the user rather than the client IP because the API is stateless and meant
to run behind a load balancer across multiple instances — an in-memory,
IP-keyed limiter would let an abusive user simply reset their count by
landing on a different instance, or would over-throttle many legitimate
users sharing one IP (NAT/proxy). 60/min was chosen because the client's
DevPanel "Hızlı Simülasyon" toggle fires roughly one earn call per second
(~20/min), so the limit leaves that flow comfortably unthrottled while
still catching a real abuse pattern (more than one fabricated earn per
second sustained for a minute).

## Seed script (`src/scripts/seed.ts`)

```bash
cd server
npm run seed
```

Populates the local environment with demo data so the system is testable
without a real game client:

- **10,000 fake users** (`@faker-js/faker`) with **power-law-distributed**
  weekly earnings (`Math.pow(Math.random(), 3) * maxEarningInCents`) —
  most users earn little, a handful of "whale" outliers earn a lot, mimicking
  a real idle/clicker game economy and making the top100 cutoff and the
  ±3/-2 "around me" window look like a real leaderboard instead of a flat,
  undifferentiated one. **This user count tests nothing about the system's
  scalability** — the architecture (Redis ZSET → O(log N) rank/insert/range
  queries, a stateless API, a cutover that only ever writes the top 100 into
  Postgres) is already designed for 2M+ active users regardless of how many
  rows exist in Redis/Postgres; 10,000 was picked purely for a richer demo
  experience, as the top of the case's suggested 5,000–10,000 range, since
  it costs virtually nothing extra at seed time.
- Plus three fixed accounts you can log in as:
  - `admin` — role `ADMIN`, no leaderboard entry.
  - `demo_top_player` — pinned to rank 1 in the active week (guaranteed
    inside the top 100).
  - `demo_regular_player` — pinned to roughly the median earnings value of
    the generated distribution (guaranteed outside the top 100, ~rank 5000).
- Seeds Redis directly (`ZADD`/`HSET`, not via `earnScore.lua` — no need for
  the atomicity guarantees at seed time since there's no concurrent writer
  yet) using the same compound score formula as the live system, and sets
  `config:currentWeekId` to the current ISO week.
- Also seeds 2 historical weeks' worth of Postgres `WeeklyResult` +
  `PrizeDistribution` rows and Mongo `WeeklySnapshot` documents, so a
  history screen has something to render immediately after seeding.
- **Idempotent**: re-running `npm run seed` clears all previously seeded
  data first (Postgres `deleteMany` in FK-safe order, Mongo `deleteMany`,
  Redis `SCAN`+`DEL` scoped to the `leaderboard:week:*` /
  `leaderboard:archive:*` / `earnings:week:*` key patterns plus
  `config:currentWeekId`) rather than accumulating duplicates. Redis
  clearing is pattern-scoped rather than `FLUSHDB` so the script only ever
  touches keys it owns; this is a local/demo-only script and would never
  run against a real environment.

At the end it prints the total user count, the current/historical week
ids, and the three login usernames with their resulting ranks.

## Prize distribution algorithm (`src/modules/prizes/prizes.util.ts`)

The case spec (assuming a full 100-player leaderboard): the weekly prize
pool is 2% of total weekly earnings; rank 1 gets 20% of the pool, rank 2
gets 15%, rank 3 gets 10%, and the remaining 55% is split across ranks
4-100 proportional to `1/rank`, with any rounding remainder added to
rank 4's share so the pool is distributed to the exact cent.

That formula is only defined for exactly 100 ranked players. Rather than
branching into separate N<4 / 4≤N<100 / N=100 cases, `prizes.util.ts`
computes a fixed `baseWeight` per rank (20/15/10 for ranks 1-3, `55 *
(1/rank) / Σ(1/r, r=4..100)` for ranks 4-100) and normalizes by the sum
of base weights for the ranks that actually exist, then applies the same
floor+remainder-to-rank-4 (or rank 1, if rank 4 doesn't exist) rounding
rule. At N=100 the base weights already sum to exactly 100, so the
normalization factor is 1 and the output is identical to the spec's
20%/15%/10%/55%-proportional formula — this is verified directly in
`tests/prizes.util.test.ts`. For N<100 (e.g. a week where fewer than 100
users have earned anything), it guarantees the entire pool still gets
distributed instead of leaving the undefined "ranks that don't exist"
share undistributed.

## Weekly reset job (`src/jobs/weeklyReset.job.ts`, `src/jobs/queue.ts`, `src/jobs/worker.ts`)

Runs **every Monday at 00:00 UTC** (`0 0 * * 1`, BullMQ repeatable job with
`tz: "UTC"`). This exact time was chosen because it lines up with the
`weekId` format itself (`"YYYY-Www"`, ISO 8601 week — see `week.util.ts`):
ISO weeks start on Monday, so the cron firing moment and the week-boundary
math agree on where a week begins and ends. UTC keeps that boundary fixed
regardless of which timezone the server process happens to run in.

The job (`resetWeek(weekId, nextWeekId)`) runs the exact flow specified for
this step:

1. `getOrCreateResetJob(weekId)` — reads/creates the Postgres
   `WeeklyResetJob` row for this week (unique on `weekId`); if it's already
   `COMPLETED`, `resetWeek` returns immediately (idempotent no-op).
2. If cutover hasn't happened yet (status isn't `DISTRIBUTING`), runs
   `weekCutover.lua` (archives the Redis leaderboard, drops the live
   earnings hash, advances `config:currentWeekId`) and marks the job
   `DISTRIBUTING`. `weekCutover.lua` is itself idempotent, so this is safe
   to re-run on a retry after a `FAILED` job even if it's unclear whether
   the previous attempt's cutover actually completed.
3. Reads the archived leaderboard's top 100 back out of Redis. The raw
   earnings hash is already gone at this point (cutover deletes it), so
   earnings are recovered by decoding the ZSET's compound score
   (`earningsInCents = floor((score - 1) / 20000)` — the `-1` corrects for
   the one tiebreak value, `20000`, that would otherwise carry into the
   next earnings unit).
4. Computes the prize pool (2% of *all* archived earnings, not just the top
   100 — scanned via `ZSCAN`) and runs it through step 5's
   `calculatePrizeDistribution` (the same normalized formula, unchanged).
5. Writes `WeeklyResult` + `PrizeDistribution` inside one Postgres
   `$transaction` (delete-then-recreate for the week, so a retry after a
   partial failure doesn't duplicate rows), then writes a Mongo
   `WeeklySnapshot` document. The Mongo write is **best-effort**: it's
   wrapped in its own try/catch and only logged on failure, since by that
   point the money-relevant Postgres write has already succeeded and
   Mongo only backs the history UI's point-in-time listing — a Mongo
   outage must not fail (or endlessly retry) an already-completed payout.
6. Marks the job `COMPLETED`, or `FAILED` (re-throwing) if anything above
   errors.

**Worker is a separate process** (`npm run worker`, `src/worker.ts`) from
the API (`npm run dev` / `src/server.ts`) — the API is stateless and meant
to scale horizontally, while the repeatable cron job must be scheduled/run
by exactly one worker role, not by every API instance.

**Demo shortcut:** `POST /admin/weeks/:weekId/force-reset` (behind
`requireAuth` + `requireAdmin`, login as `admin`) calls the *exact same*
`resetWeek()` the worker's cron job calls, so a reviewer can trigger a
given week's cutover + prize distribution on demand instead of waiting for
the real Monday 00:00 UTC boundary.

```bash
# terminal 1
npm run dev
# terminal 2
npm run worker
# force a specific week's reset without waiting for Monday:
curl -X POST localhost:3000/admin/weeks/2026-W31/force-reset -H "Authorization: Bearer <admin token>"
```

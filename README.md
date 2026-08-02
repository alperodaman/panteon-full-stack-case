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

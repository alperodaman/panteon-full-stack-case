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
  if they've never earned anything. Currently sits behind
  `src/middleware/placeholderAuth.ts`, which trusts an `x-user-id`
  header — a stand-in until real JWT auth (a later step) is wired in.
- `POST /earnings/earn` — body `{ "amountInCents": number }` (positive
  integer, zod-validated), also behind `placeholderAuth`.

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

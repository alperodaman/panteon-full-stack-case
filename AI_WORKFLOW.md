# AI Workflow Log

This file tracks which decisions were made by the user and which
boilerplate was produced by the AI during collaboration with Claude.
It will be updated at every step.

## Decisions made by the user

- **Repo skeleton:** Monorepo tooling (workspaces/lerna/turborepo) will
  NOT be used; `server/` and `client/` are fully independent projects,
  no root package.json.
- **Repo skeleton:** Stack: Express + TypeScript, PostgreSQL (Prisma),
  MongoDB (Mongoose), Redis (ioredis), BullMQ, JWT, Zod, Pino,
  express-rate-limit + rate-limit-redis, faker.
- **Repo skeleton:** Postgres/Redis/Mongo are not installed natively on
  the dev machine — everything runs via Docker.
- **Repo skeleton:** Prisma models (User, WeeklyResult,
  PrizeDistribution, WeeklyResetJob) were specified at the field and
  constraint (unique) level.
- **Repo skeleton:** The paragraph clarifying the project structure
  (referencing the case's "client and server code should be in separate
  projects" requirement) was added verbatim to the top of the README.
- **Repo skeleton:** `tsconfig.json`: using `moduleResolution: node`
  triggered TypeScript's "deprecated, will be removed in TS 7.0"
  warning. The AI first explained two options (silence the warning vs.
  switch to `node16`) with their pros/cons; the user chose `node16` —
  `module` was also updated to `Node16` (TypeScript requires this
  pairing). This is the non-deprecated algorithm that matches Node's
  actual resolution behavior.
- **Redis Lua scripts:** Full architecture was specified up front:
  `leaderboard:week:{weekId}` ZSET (weekId format e.g. `"2026-W31"`),
  compound score formula
  (`earningsInCents * 20000 + (20000 - minutesSinceWeekStart)`) with the
  priority rule stated explicitly — earnings is the first sort key, and
  on a tie the user who reached that total earlier in the week (closer
  to week start) ranks higher; `config:currentWeekId` holds the active
  week; and the separate `earnings:week:{weekId}` hash (field `userId` →
  `earningsInCents`) is needed because raw earnings can't be recovered
  from the ZSET score, exists solely to compute the score during the
  active week, has no function after cutover (results/prizes are
  derived from the archived ZSET), and must be explicitly deleted at
  cutover rather than left to a TTL.
- **Redis Lua scripts:** `earnScore.lua`'s exact contract and flow were
  specified: `KEYS[1]` = the `earnings:week:{weekId}` hash key; `ARGV[1]`
  userId, `ARGV[2]` amountInCents, `ARGV[3]` minutesSinceWeekStart,
  `ARGV[4]` weekId (the script builds the leaderboard key itself as
  `"leaderboard:week:" .. weekId` rather than taking it as a second
  `KEYS` entry); flow is `HINCRBY` the earnings → read the new total →
  compute the compound score → `ZADD` the leaderboard → return the new
  total earnings and score; the whole thing must be fully atomic with no
  inconsistent intermediate state.
- **Redis Lua scripts:** `rankWindow.lua`'s exact algorithm was
  specified: in a single round-trip, find the user's `ZREVRANK` (return
  empty if not found); if found, fetch their own rank plus the 3
  ranks above and 2 below via `ZREVRANGE` (userId+score pairs). Edge
  cases were called out explicitly: if the user is in the top 3 there
  aren't 3 people above them, and this must be clamped in Lua itself
  (not fall into a negative index); if the user is near the bottom
  there may not be 2 people below, clamped the same way.
- **Redis Lua scripts:** `weekCutover.lua`'s exact contract and flow
  were specified: `ARGV[1]` = old weekId, `ARGV[2]` = new weekId; check
  `EXISTS` on `leaderboard:week:{oldWeekId}` — if it exists, `RENAME` it
  to `leaderboard:archive:{oldWeekId}` and set a 30-day TTL (2592000
  seconds); if it doesn't exist (no `earn` calls happened that week),
  skip the rename silently. In the same script, explicitly `DEL` the
  `earnings:week:{oldWeekId}` hash (no `EXISTS` check needed first,
  since `DEL` is already a no-op on a missing key) — a deliberate choice
  over relying on a TTL, since the hash serves no purpose after cutover
  and, at 10M-registered/2M-active-user scale, letting these accumulate
  indefinitely wastes memory for no benefit; this reasoning must be
  written into the script itself as a comment. Also update
  `config:currentWeekId` to the new weekId. The whole script must be
  idempotent — re-calling it with the same `oldWeekId` must be a no-op
  (guaranteed by `DEL`'s natural idempotency and `RENAME`'s `EXISTS`
  guard).
- **Redis Lua scripts:** Script-loading mechanism was specified: load
  the three scripts via ioredis' `defineCommand` API (in `redis.ts`, or
  optionally a separate `luaScripts.ts` — left as an implementation
  choice) so they're callable as native-looking commands —
  `redis.earnScore(...)`, `redis.rankWindow(...)`,
  `redis.weekCutover(...)`; the `.lua` files themselves must be read
  from disk via `fs` at runtime (not inlined as strings), and if the
  build needs the `.lua` files copied into `dist/`, an appropriate copy
  step must be added to `package.json`.
- **Redis Lua scripts:** `server/tests/lua.test.ts` requirements were
  specified in full: Vitest integration tests against the real
  docker-compose Redis (not mocked). Required scenarios: (1) `earnScore`
  — call it twice for the same user and verify earnings accumulate
  correctly; (2) `rankWindow` — seed at least 10 users, verify the
  window returned for a middle user is correct, and separately test the
  clamp behavior for a user in the first 3 and for the last user; (3)
  `weekCutover` — verify the old leaderboard key is gone and the
  archive key exists after cutover, verify
  `earnings:week:{oldWeekId}` is COMPLETELY deleted (`EXISTS` returns
  `0`), verify `config:currentWeekId` was updated, and verify calling
  the script a second time with the same arguments doesn't error
  (idempotency). Every test must clean up the keys it used, before or
  after itself, for test isolation.
- **Redis Lua scripts:** Verification requirements were specified:
  `npm run test tests/lua.test.ts` must pass green, and manual
  `redis-cli` verification commands must be shown as comments —
  specifically including one example showing
  `EXISTS earnings:week:{oldWeekId}` returning `0` after cutover.
- **Prisma 7 upgrade:** the initial repo skeleton had pinned
  `prisma`/`@prisma/client` to `^6.5.0` without asking — this was
  flagged as a mistake by the user: Prisma 7 was already the current
  major/LTS line and should have been the default from the start, using
  `@prisma/adapter-pg` (driver adapters) rather than Prisma's legacy
  built-in connection handling.
- **Prisma 7 upgrade:** explicit instruction to upgrade to Prisma 7,
  wire up `@prisma/adapter-pg`, install whatever dependencies that
  requires, and run the tests — don't just note it and move on.
- **Leaderboard module:** Full response shapes for `GET /leaderboard/top`,
  `GET /leaderboard/me` (in-top-100 case, outside-top-100 ±3/±2-window
  case, and never-earned case) were specified up front, field-by-field,
  as a settled decision — not to be redesigned. The stated rationale: in
  every case `entries` is a list of the same object shape (`rank`,
  `userId`, `username`, `earningsInCents`, plus `isCurrentUser` on the
  `/me` variants), so the frontend can drive both the top-100 view and
  the "around me" view off one `LeaderboardRow` component with a single
  props shape; `myRank`/`myEarningsInCents` are kept at the top level
  (outside `entries`) specifically so a `MyRankCard` component can read
  them directly without parsing the entries list.
- **Leaderboard module:** Exact file layout was specified up front:
  `server/src/modules/leaderboard/leaderboard.repository.ts`,
  `leaderboard.service.ts`, `leaderboard.controller.ts` +
  `leaderboard.routes.ts`, and `server/src/db/mongo/models/earningEvent.model.ts`.
- **Leaderboard module:** `leaderboard.repository.ts` was specified as a
  Redis-only layer with no business logic, exposing exactly
  `getTop100(weekId)` (ZREVRANGE, top 100 as `[userId, score]` pairs),
  `getRankWindow(userId, weekId)` (wraps `rankWindow.lua`, `null` if the
  user isn't found), `getUserEarnings(userId, weekId)` (reads the
  earnings hash), and `recordEarning(userId, amountInCents, weekId)`
  (wraps `earnScore.lua`).
- **Leaderboard module:** `leaderboard.service.ts` logic flow was
  specified explicitly:
  - `getTopLeaderboard(weekId?)`: default to the active week via
    `config:currentWeekId` if `weekId` is omitted; enrich the top 100
    with `username` via a batched Postgres lookup (`IN` clause /
    `findMany`), explicitly not N+1.
  - `getMyPosition(userId, weekId?)`: check top 100 membership first;
    if inside, return the single-entry top100-shaped response; if
    outside, enrich `rankWindow`'s 3-above/2-below window with user
    info in the ±3/±2 shape with `isCurrentUser` set on the correct
    row; if the user has no rank at all, return the `myRank: null,
    entries: []` shape.
  - `earn(userId, amountInCents)`: resolve the active week, call
    `recordEarning`, and additionally write a MongoDB `earning_event`
    document.
- **Leaderboard module:** `earningEvent.model.ts` fields were specified
  exactly: `userId`, `weekId`, `amountInCents`, `source`, `createdAt`,
  with a TTL index on `createdAt` set to 90 days.
- **Leaderboard module:** Routes were specified exactly: `GET
  /leaderboard/top` → `getTopLeaderboard`; `GET /leaderboard/me` → reads
  `userId` from auth middleware and calls `getMyPosition`; `POST
  /earnings/earn` → validates `amountInCents` with zod (positive
  integer) and calls `service.earn`. Explicit instruction to bind these
  routes into `server/src/server.ts`.
- **Leaderboard module:** `GET /leaderboard/me` should sit behind a
  placeholder middleware that expects `req.userId` to already be set,
  since real JWT auth is a later step (step 4) — explicitly scoped as
  "wire the real thing later," not an oversight.
- **Leaderboard module:** Test file path and scenarios were specified
  exactly: `server/tests/leaderboard.service.test.ts`, using Vitest
  against the real docker-compose Redis (not a mock), covering at least
  (1) a top-100 user's response matches the in-top-100 shape exactly,
  (2) an outside-top-100 user's ±3/±2 window is correct and
  `isCurrentUser` is true on exactly one row, (3) a user with no record
  matches the `myRank: null, entries: []` shape exactly.
- **Leaderboard module:** Explicit verification instructions: run
  `npm run dev`, `curl` a few simulated earns, and show both
  `/leaderboard/top` and `/leaderboard/me` for one in-top-100 and one
  outside-top-100 user; `npm run test tests/leaderboard.service.test.ts`
  must pass.

## Decisions made / boilerplate produced by the AI

- **Repo skeleton:** `tsconfig.json`: `target: ES2022` was chosen;
  `module`/`moduleResolution` were initially `commonjs`/`node` (not
  asked, justified: to avoid ESM interop friction between ts-node-dev
  and CJS-heavy packages like bullmq/mongoose/prisma). Later updated to
  `Node16`/`Node16` — see the user decision above.
- **Repo skeleton:** Migration name: `init` (no preference specified in
  the case).
- **Repo skeleton:** `src/config/env.ts`: env validation with zod; the
  process crashes immediately on missing/invalid env vars (no silent
  fallback).
- **Repo skeleton:** `src/config/postgres.ts`, `redis.ts`, `mongo.ts`:
  singleton pattern (global cache) to prevent multiple instances on
  hot-reload; redis/mongo connect/error events are logged via pino.
- **Repo skeleton:** `src/server.ts`: a single `/health` endpoint —
  checks pg/redis/mongo connectivity in parallel and returns JSON.
- **Repo skeleton:** Docker Compose: healthcheck + named volumes + env
  variables read from `.env` (with sensible defaults, not hardcoded).
- **Redis Lua scripts:** Of the two loading locations the user offered
  (inline in `redis.ts` vs. a separate file), chose a dedicated
  `src/config/luaScripts.ts` so `redis.ts` stays a plain connection
  singleton. Added a `RedisCommander` module augmentation (not
  requested) so `redis.earnScore(...)` / `redis.rankWindow(...)` /
  `redis.weekCutover(...)` are fully typed instead of `any`.
- **Redis Lua scripts:** `rankWindow.lua` return shape:
  `{ selfRank, startRank, flatEntries }` (not just the entries) — the
  caller needs `startRank` to reconstruct absolute ranks for each entry
  in the window, and `ZREVRANGE` already clamps a too-large stop index
  for free, so only the start index needed explicit clamping in Lua.
- **Redis Lua scripts:** Determined the `.lua` files do need an explicit
  build-time copy step (`tsc`'s `rootDir: src` won't touch them), so per
  the user's conditional instruction added one: a plain
  `server/scripts/copy-lua.js` (no new dependency) wired into
  `npm run build` as `tsc && node scripts/copy-lua.js`.
- **Redis Lua scripts:** Within the required test scenarios, used a
  unique, namespaced `weekId` per test (e.g. `test-cutover-2026-W41`)
  and an `afterEach`-tracked key list for cleanup, as the concrete
  mechanism for the user's test-isolation requirement.
- **Prisma 7 upgrade:** Upgraded `prisma` and `@prisma/client` to
  `7.9.1` (latest stable at the time), added `@prisma/adapter-pg@7.9.1`,
  `pg`, and `@types/pg`.
- **Prisma 7 upgrade:** Prisma 7 removes `datasource.url` from
  `schema.prisma` entirely (hard `P1012` validation error, not just a
  lint warning — confirmed by actually running `prisma generate` before
  touching the schema). Connection config now lives in
  `prisma.config.ts` at the `server/` root (`defineConfig` +
  `env("DATABASE_URL")` from the `prisma/config` package), which the
  CLI (`generate`/`migrate`/`validate`) reads directly — `.env` itself
  didn't need to change.
- **Prisma 7 upgrade:** Kept the legacy `prisma-client-js` generator and
  the project's existing CommonJS (`module: Node16`) TypeScript setup
  rather than following Prisma's official upgrade guide's suggestion of
  a full ESM migration (`"type": "module"`, `moduleResolution:
  bundler`, new `prisma-client` generator with a custom `output` path).
  That ESM switch would ripple through `ts-node-dev`, `mongoose`,
  `bullmq`, and every existing import — verified empirically that
  Prisma 7.9.1's CLI loads `prisma.config.ts` independently of the
  app's own module system, so the larger migration wasn't required just
  to unblock the datasource error. Flagging this as a deliberate scope
  decision, not an oversight.
- **Prisma 7 upgrade:** `src/config/postgres.ts`: `PrismaClient` is now
  constructed with a `PrismaPg` adapter
  (`new PrismaPg({ connectionString: env.DATABASE_URL })`) instead of
  Prisma resolving the URL from the schema itself.
- **Prisma 7 upgrade:** Updated `allowScripts` in `package.json` from
  the old `6.19.3` pins to `7.9.1` (needed for `prisma`/
  `@prisma/engines` postinstall to run at all under this repo's
  install-script allowlisting).
- **Leaderboard module:** Within the user-specified `recordEarning(userId,
  amountInCents, weekId)` signature, the AI added `minutesSinceWeekStart`
  as an explicit fourth argument rather than computing it inside the
  repository, since deriving "now minus ISO-week-start" is time/business
  logic, not a Redis operation — keeping the repository a pure, thin
  wrapper per the "no business logic" instruction. Also added
  `getCurrentWeekId()` to the repository (not in the original four-method
  list) since reading `config:currentWeekId` is itself a Redis read, and
  keeping it in the repository avoids the service touching `redis`
  directly.
- **Leaderboard module:** Added `src/modules/leaderboard/week.util.ts`
  (`getIsoWeekId`, `getIsoWeekStart`, `getMinutesSinceWeekStart`) — not
  explicitly requested, but required to (a) compute `earnScore.lua`'s
  `minutesSinceWeekStart` argument and (b) give the service a fallback
  current week before `weekCutover.lua` has ever run once (i.e. before
  `config:currentWeekId` exists in a fresh Redis instance). Standard
  Monday-start ISO 8601 week math, UTC-only, no library dependency
  added.
- **Leaderboard module:** `getUsersEarnings` (batch `HMGET`) was added
  to the repository beyond the four methods explicitly listed, to avoid
  N+1 Redis round-trips when enriching top-100/window entries with
  `earningsInCents` — the ZSET score itself is a compound value
  (`earnings * 20000 + tiebreak`), not the raw earnings figure needed
  for display, so a separate lookup against the `earnings:week:{weekId}`
  hash is unavoidable; batching it was a deliberate scope decision, not
  asked for outright but staying inside "thin Redis layer."
- **Leaderboard module:** Because `earnings:week:{weekId}` is deleted on
  `weekCutover.lua`, `earningsInCents` enrichment only works for the
  currently active week — `getTopLeaderboard`/`getMyPosition` don't
  attempt to support querying an archived week's earnings by design;
  historical results are Postgres's `WeeklyResult`, out of this
  module's scope.
- **Leaderboard module:** `src/middleware/placeholderAuth.ts` reads
  `x-user-id` and 401s if absent, augmenting `Express.Request` with an
  optional `userId`. Meant to be swapped for real JWT verification in
  step 4 without touching the routes/controllers that depend on
  `req.userId`.
- **Leaderboard module:** `src/db/mongo/models/earningEvent.model.ts`:
  Mongoose TTL index via `{ expires: 60 * 60 * 24 * 90 }` on the
  `createdAt` field (90 days), matching the pattern already used for
  Redis's own TTL-based cleanup (`leaderboard:archive:{weekId}`).

## Verification

- **Repo skeleton:** `docker compose up -d` → `docker compose ps` shows
  postgres/redis/mongo all `healthy`.
- **Repo skeleton:** `npx prisma migrate dev --name init` ran
  successfully, Prisma Client was generated.
- **Repo skeleton:** `npm run dev` followed by
  `curl localhost:3000/health` →
  `{"status":"ok","services":{"postgres":"up","redis":"up","mongo":"up"}}`.
- **Redis Lua scripts:** `npm run test tests/lua.test.ts` → 9/9 tests
  passed (earnScore accumulation + tiebreak, rankWindow
  middle/top-clamp/bottom-clamp/not-found, weekCutover happy path +
  idempotency + no-op-when-no-prior-leaderboard).
- **Redis Lua scripts:** `npm run build` → `tsc` succeeds and
  `dist/lua/*.lua` is populated alongside `dist/config/luaScripts.js`.
- **Redis Lua scripts:** Manual `redis-cli` checks (documented as
  comments at the bottom of `lua.test.ts`), e.g.
  `EXISTS earnings:week:{oldWeekId}` → `0` after cutover.
- **Prisma 7 upgrade:** `npx prisma generate` — failed first with
  `P1012` (`url` no longer supported in schema files) before the fix,
  succeeded afterward (`Loaded Prisma config from prisma.config.ts` →
  `Generated Prisma Client (v7.9.1)`).
- **Prisma 7 upgrade:** `npx prisma migrate status` — reads the
  connection through `prisma.config.ts`, reports the existing `init`
  migration as applied, schema up to date.
- **Prisma 7 upgrade:** `npm run build` — `tsc` compiles cleanly
  (`prisma.config.ts` sits outside `src/`, so it isn't part of the
  app's compiled output; the CLI loads/transpiles it itself).
- **Prisma 7 upgrade:** `npm run test tests/lua.test.ts` — still 9/9
  passing (Redis layer is untouched by this change).
- **Prisma 7 upgrade:** `curl localhost:3000/health` →
  `{"status":"ok","services":{"postgres":"up",...}}`, confirming the
  app's own Postgres connection goes through the new `PrismaPg` adapter
  end-to-end, not just the CLI.
- **Leaderboard module:** `npm run test tests/leaderboard.service.test.ts`
  → 3/3 passing against real Redis + Postgres (in-top-100 shape,
  outside-top-100 ±3/±2 window shape with `isCurrentUser` set on exactly
  one row, no-record shape). Full `npm run test` → 12/12 (lua.test.ts +
  leaderboard.service.test.ts). `npm run build` and `tsc --noEmit` both
  clean.
- **Leaderboard module:** Manual `npm run dev` + `curl` walkthrough:
  seeded two real Postgres users (`whale_player`, `outsider_player`),
  `POST /earnings/earn` for both, then pushed 105 synthetic
  higher-scoring members directly into the week's Redis ZSET so
  `outsider_player` fell outside the top 100. `GET /leaderboard/top`
  returned `whale_player` at `rank: 1`. `GET /leaderboard/me` for the
  whale returned the in-top-100 shape (`myRank: 1`, single-entry
  `entries`). `GET /leaderboard/me` for the outsider returned the
  outside-top-100 shape (`myRank: 107`) — with only 4 entries instead of
  6 because the outsider was the very last member on the leaderboard,
  which also exercised `rankWindow.lua`'s bottom-edge clamp live. All
  seeded users/keys were cleaned up afterward.

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
- **Auth + seed:** Full scope for this step was specified up front: real
  JWT auth (replacing the step-3 placeholder) plus a seed script, since the
  case has no real client/game producing data and the system needs to be
  testable end-to-end.
- **Auth:** `login(username)` exact contract specified: no registration
  flow — check whether the username exists in Postgres, sign a JWT
  (payload `userId`, `username`, `role`) if so, 401/404 otherwise. Token
  expiry driven by `JWT_EXPIRY` (2h default) read from config.
- **Auth:** `requireAuth`/`requireAdmin` contract specified: `requireAuth`
  verifies `Authorization: Bearer <token>`, sets `req.userId`/`req.userRole`,
  401s otherwise; `requireAdmin` layers a role check on top, 403 if not
  `ADMIN`. Explicit instruction to replace the step-3 placeholder
  middleware with this real one, not run them side by side.
- **Auth:** Route specified exactly: `POST /auth/login`, zod-validated
  `{ username }` body.
- **Rate limiting:** Exact mechanism specified: `express-rate-limit` +
  `rate-limit-redis` (`RedisStore`), applied to `POST /earnings/earn` only,
  keyed on `req.userId` (not IP). Exact limit specified: 60 requests/minute
  per user. The rationale to document in-code was specified explicitly
  too: this comfortably clears the request rate the client's DevPanel
  "Hızlı Simülasyon" toggle produces (~1/sec, ~20/min) while still catching
  a real abuse pattern (>1 fabricated earn/sec sustained); and the reason
  for keying on `userId` rather than IP — a stateless, multi-instance API
  would make an in-memory IP-keyed limiter ineffective, since an abusive
  client can just get load-balanced to a different instance and reset its
  count.
- **Seed script:** Full strategy specified in complete detail up front
  (all of it treated as settled, not open for redesign):
  - Library: `@faker-js/faker` (already a dependency from step 1).
  - Exactly 10,000 fake users — explicitly stated to be a demo-richness
    choice, not a scalability test, since the Redis ZSET architecture's
    algorithmic guarantees (O(log N) rank/insert/range) don't depend on N;
    10,000 was picked as the top of the case's suggested 5,000–10,000
    range because it costs negligible extra seed time and gives a fuller
    demo. This reasoning was required to be written both in-code and in
    the README, not just decided silently.
  - Earnings distribution must be power-law/whale, not flat-random:
    `Math.pow(Math.random(), 3) * maxEarningInCents` (or an equivalent
    exponential/power-law formula) so most users earn little and a few
    "whales" earn a lot — explicitly justified as resembling a real
    idle/clicker game economy and making the top100/±3-2-window scenarios
    meaningful to review, rather than everyone clustering around the same
    value. This rationale was also required as an in-code comment.
  - Exact seed flow specified: (1) write the 10,000 users to Postgres, plus
    one fixed `ADMIN` user (e.g. `admin`) for testing the force-reset
    endpoint, plus 1-2 fixed "known" test users (e.g. `demo_top_player`
    inside top100, `demo_regular_player` outside) so the reviewer has an
    easy, reproducible login; (2) populate
    `leaderboard:week:{currentWeekId}` via a direct batched `ZADD` — not
    through `earnScore.lua` — applying the same compound-score formula,
    with `minutesSinceWeekStart` as 0 or a small random value; (3) set
    `config:currentWeekId` to the current week (computed the same way as
    `week.util.ts`); (4) optionally (but instructed to actually do it, not
    skip) write 1-2 historical weeks of Postgres `WeeklyResult` + Mongo
    `weekly_snapshots` data with a plausible rank/earnings/prize
    distribution, so the history screen isn't empty right after seeding.
  - Idempotency requirement specified exactly: `npm run seed` must be
    safely re-runnable — clear existing demo data first (Postgres
    `TRUNCATE` or equivalent, Redis `SCAN`+`DEL` or `FLUSHDB`, the choice
    left to the AI but required to be justified in-code, with an explicit
    note that `FLUSHDB` would never be used against a real/production
    environment), then reseed.
  - End-of-script console output requirement specified exactly: admin
    username, the 1-2 known test usernames with their top100/outside-top100
    positions, and the total seeded user count.
  - `npm run seed` needed to be wired into `package.json`.
- **Seed script:** Verification requirements were specified in full:
  run `npm run seed` and show the console output; log in as one top100 and
  one outside-top100 known test user and show both `/leaderboard/me`
  response shapes; run `npm run seed` a second time and confirm no
  duplication; unit-test `requireAdmin`'s 403 path; and load-test the rate
  limiter by sending 60+ rapid `/earnings/earn` requests as the same user
  and confirming a 429 appears.
- **Prize distribution:** Full case spec restated as the ground truth for
  N=100: prize pool = 2% of total weekly earnings; rank 1 = 20% of pool,
  rank 2 = 15%, rank 3 = 10%; remaining 55% split across ranks 4-100
  inversely proportional to rank (`w(rank) = 1/rank`); rounding remainder
  added to rank 4 so the pool is distributed to the exact cent.
- **Prize distribution:** Explicit decision on the N<100 case (fewer than
  100 ranked players in a given week): rather than writing separate
  if/else branches for N<4 / 4≤N<100 / N=100, use one normalized formula —
  define a fixed `baseWeight(rank)` (20/15/10 for ranks 1-3,
  `55 * (1/rank) / Σ(1/r, r=4..100)` for ranks 4-100), then for whatever
  ranks actually exist (1..min(N,100)), normalize:
  `normalizedWeight(rank) = baseWeight(rank) / Σ(baseWeight(r) over existing ranks)`,
  and `prizeAmountInCents(rank) = normalizedWeight(rank) * pool`. Explicitly
  justified as not being over-engineering: at N=100 the base weights already
  sum to exactly 100, so the normalization factor is mathematically 1 and the
  output is identical to the plain spec formula — zero behavioral difference
  at the case's own reference scenario, with the benefit of guaranteeing full
  pool distribution at any N. Rounding remainder rule: goes to rank 4 if it
  exists among the ranked players, otherwise to rank 1.
- **Prize distribution:** File scope specified exactly:
  `server/src/modules/prizes/prizes.util.ts` as a fully pure module (no DB/IO)
  exposing `calculatePrizePool`, `calculateBaseWeights`, and
  `calculatePrizeDistribution`; `server/tests/prizes.util.test.ts` covering
  N=100 (proving the normalized formula matches the spec's raw 20/15/10/55%
  percentages exactly), N=5, N=3 (no ranks 4-100 at all, checking the 20:15:10
  ratio is preserved), N=1 (single player takes the whole pool), and dedicated
  rounding-remainder tests for both the rank-4-exists and rank-4-absent cases.
- **Weekly reset job:** Cron schedule stated as a settled decision, not open
  for redesign: every Monday 00:00 UTC. Rationale given up front and
  required to be used verbatim as the BullMQ repeatable job's cron
  expression (`0 0 * * 1`, UTC): this is the natural boundary of the
  `weekId` format already in use (`"YYYY-Www"`, ISO 8601 week, which itself
  starts on Monday per the ISO spec) — so the moment the cron fires and the
  moment `week.util.ts`'s week-boundary math says a week starts/ends agree
  with each other. UTC was specified so the job's behavior doesn't depend on
  whichever timezone the server process happens to run in.
- **Weekly reset job:** Full pseudocode for `resetWeek(weekId)` given as the
  exact flow to implement, not a sketch to reinterpret:
  `getOrCreateResetJob` → if already `completed`, return; if `pending`, run
  cutover and mark `distributing`; then always read the archived
  leaderboard, run step 5's `calculatePrizeDistribution` over it, write the
  Postgres transaction, write the Mongo snapshot, mark `completed`.
- **Weekly reset job:** File/module scope specified exactly:
  `server/src/modules/weeks/weeklyResetJob.repository.ts` (`getOrCreateResetJob`,
  catching Postgres's `P2002` unique-violation on `weekId` and re-reading the
  existing row rather than erroring; `updateJobStatus`); `server/src/jobs/weeklyReset.job.ts`
  (`resetWeek` applying the pseudocode verbatim; `readArchiveLeaderboard`
  returning `[]` on an empty/never-earned week rather than erroring;
  `writePostgresTransaction` using one Prisma `$transaction` for
  `WeeklyResult` + `PrizeDistribution`, feeding step 5's
  `calculatePrizeDistribution` with the archived data; `writeMongoSnapshot`
  against `server/src/db/mongo/models/weeklySnapshot.model.ts`, explicitly
  required to be best-effort — a Mongo failure must not block the main flow,
  just get logged, with the reasoning written into the code as a comment);
  on any error, the job status must be set to `FAILED`.
- **Weekly reset job:** BullMQ wiring specified exactly:
  `server/src/jobs/queue.ts` (Queue definition), `server/src/jobs/worker.ts`
  (repeatable job registration using the Monday-00:00-UTC cron expression
  above, weekId computed via the project's existing ISO-week helpers), and a
  separate entry point `server/src/worker.ts` with its own `npm run worker`
  script — explicitly called out as needing to be a separate process from
  the API server, per the stateless-architecture decision already made in
  step 1.
- **Weekly reset job:** Admin demo endpoint specified exactly:
  `POST /admin/weeks/:weekId/force-reset`, behind `requireAdmin`, calling
  the *same* `resetWeek()` function the worker's cron job calls (not a
  parallel implementation) — explicitly framed as a README-documented "demo
  shortcut" so a reviewer isn't stuck waiting for the real Monday boundary
  to test the feature.
- **Weekly reset job:** Test file and scenarios specified exactly:
  `server/tests/weeklyReset.test.ts`, calling `resetWeek` against a seeded
  Redis leaderboard, verifying the resulting Postgres rows, cross-checking
  the prize amounts against step 5's normalized formula (not hand-computed
  numbers), and calling `resetWeek` a second time with the same `weekId` to
  prove idempotency.
- **Weekly reset job:** Verification requirements specified exactly:
  `npm run test tests/weeklyReset.test.ts` green; calling force-reset with
  an admin token and showing the resulting Postgres rows match the
  normalized formula; confirming the BullMQ repeatable job is registered
  with the correct cron expression.


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

- **Auth + seed:** Added `auth.controller.ts` alongside the requested
  `auth.service.ts`/`auth.routes.ts`, matching the existing
  controller/routes/service layering used by the leaderboard module, for
  consistency rather than putting zod validation directly in the route.
- **Auth:** `placeholderAuth.ts` was deleted outright (not kept as dead
  code / re-exported) once `requireAuth` replaced it in
  `leaderboard.routes.ts`; the `Express.Request.userId` global
  augmentation moved from that file into `auth.middleware.ts`, plus a new
  `userRole` field for `requireAdmin` to read.
- **Auth:** `InvalidCredentialsError` (a small custom error class) was
  added so the controller can distinguish "unknown username" (404) from
  unexpected failures (500 via `next(err)`), rather than having the service
  call `res` directly or returning a sentinel value.
- **Auth:** `env.ts`: `JWT_EXPIRY` changed from a required-no-default field
  to defaulting to `"2h"` when unset, and `.env`/`.env.example` updated to
  `2h` (from `15m`) to match, since a required env var can't express "2h
  default" on its own.
- **Rate limiting:** `rate-limit-redis`'s `RedisStore` needs a
  `sendCommand` bridging function; implemented as
  `redis.call(command, restArgs)` against the existing `ioredis` singleton
  (matching its `call(command, args[])` overload) rather than adding a
  second Redis connection.
- **Seed script:** Of the two idempotency-clearing options the user left
  open (Postgres `TRUNCATE` vs. `deleteMany`, Redis `FLUSHDB` vs.
  `SCAN`+`DEL`), chose `deleteMany` in FK-safe order (`PrizeDistribution` →
  `WeeklyResult` → `User`) for Postgres, and pattern-scoped `SCAN`+`DEL`
  (on `leaderboard:week:*`, `leaderboard:archive:*`, `earnings:week:*`,
  plus `config:currentWeekId`) rather than `FLUSHDB` for Redis — reasoning
  written into the script itself: this keeps the script from touching any
  non-seed keys that might coexist in the same local Redis instance (e.g.
  rate-limiter counters), while still being fully idempotent.
- **Seed script:** To make the two "known" demo accounts *reliably* land
  on the correct side of the top100 cutoff (rather than hoping the random
  power-law draw naturally puts them there), their earnings are pinned
  directly against the generated distribution after the fact:
  `demo_top_player` gets `max(generated) + 100_000` (guaranteed rank 1),
  `demo_regular_player` gets the distribution's median value (guaranteed
  ~5,000 users above it, safely outside top100).
- **Seed script:** The admin account is deliberately given no leaderboard
  entry at all (no `ZADD`/`HSET` row) since admins don't play the game;
  this follows naturally from the account's stated purpose (testing the
  force-reset endpoint, not earning).
- **Seed script:** Added `src/db/mongo/models/weeklySnapshot.model.ts`
  (`weekId`, `entries: [{ rank, userId, username, earningsInCents }]`,
  `createdAt`) since no `weekly_snapshots` model existed yet — needed to
  fulfill the "write historical data to Mongo weekly_snapshots" instruction
  literally.
- **Seed script:** Historical weeks additionally seed `PrizeDistribution`
  rows (top 10 ranks, weighted `1/rank` share of a fixed pool), read into
  the instruction's own wording ("rank/earnings/**prize** dağılımıyla") as
  implying prize data should be seeded too, since `PrizeDistribution`
  already exists in the schema and was otherwise unused by any seed path.
- **Seed script:** Added `ts-node` as an explicit `devDependency` (it was
  previously only a transitive dependency of `ts-node-dev`) so
  `npm run seed` (`ts-node --transpile-only src/scripts/seed.ts`) doesn't
  rely on an undeclared transitive package.
- **Auth test:** `requireAdmin`'s 403 path (and `requireAuth`'s 401/valid
  paths, as a natural adjacent addition) were tested with lightweight
  hand-mocked `req`/`res` objects rather than a full `supertest` HTTP
  round-trip, since the middleware functions have no external dependencies
  beyond `jsonwebtoken`/`env` and don't need a running server to exercise.
- **Prize distribution:** `calculateBaseWeights(maxRank)` computes the
  ranks-4-100 harmonic denominator (`Σ(1/r, r=4..100)`) as a fixed constant
  regardless of `maxRank` — it is not recomputed over a shorter range when
  fewer players exist, since the spec's per-rank weight for rank r is
  defined relative to the full 97-term harmonic series, not relative to
  however many of those ranks happen to be populated this week; only the
  *normalization* step (dividing by the sum of base weights for ranks that
  actually exist) adapts to N.
- **Prize distribution:** `calculatePrizeDistribution` computes each award as
  `Math.floor(normalizedWeight * pool)`, then adds `pool - sum(floors)` (the
  leftover from flooring every share) entirely onto rank 4's award if a rank-4
  player exists in the input, else onto rank 1's — this both implements the
  spec's "remainder to rank 4" rule and is what guarantees the sum of all
  awards equals `pool` exactly, to the cent, for any N.
- **Prize distribution:** `calculatePrizeDistribution` derives `maxRank` from
  `Math.min(Math.max(...ranks in the input), 100)` rather than trusting
  `rankedPlayers.length` — defensive against the input not being a dense
  `1..N` sequence (e.g. a future caller passing a sparse rank list), since
  `calculateBaseWeights` is keyed by actual rank value, not array position.
- **Prize distribution:** Test suite added floating-point tolerance (±1 cent)
  on the N=100 top-3-percentage assertions instead of exact equality — floats
  summed over 97 terms don't land on precisely `100.0`, so the plain
  `Math.floor(pool * 0.2)` comparison can be off by the same 1-cent rounding
  slack that the remainder-to-rank-4 rule is designed to absorb. Verified this
  is floating-point noise, not a logic bug, before relaxing the assertion.
- **Weekly reset job:** `readArchiveLeaderboard` needs earnings per player,
  but `weekCutover.lua` deletes `earnings:week:{weekId}` as part of cutover
  (by design, from step 2-3) before this function ever runs — so raw
  earnings can't be read back from a hash lookup post-cutover. Instead,
  earnings are decoded directly from the archived ZSET's compound score
  (`earningsInCents * 20000 + (20000 - minutesSinceWeekStart)`, from
  `earnScore.lua`). Discovered and fixed a genuine off-by-one in the naive
  decode: the tiebreak term can equal exactly `20000` (an earn at
  `minutesSinceWeekStart = 0`), which would make `floor(score / 20000)`
  overcount earnings by one in that single case; decoding as
  `floor((score - 1) / 20000)` corrects it losslessly for every valid
  tiebreak value. This was caught by reasoning through the score formula's
  value range, not by a failing test (the test's fixed `minutesSinceWeekStart`
  didn't happen to hit the edge case) — flagging it here since it's exactly
  the kind of silent, correctness-affecting bug that's easy to miss.
- **Weekly reset job:** The case spec's "2% of total weekly earnings" pool
  basis wasn't pinned down by the user's pseudocode to top-100-only vs. every
  earner that week. Chose *every* archived player (via a cursor-batched
  `ZSCAN` over the full archive ZSET, not `ZRANGE 0 -1`, so a weekly batch
  job never blocks Redis with one huge command at scale), since "total
  weekly earnings" reads as the whole week's economy, not just the leaderboard
  cutoff — while `WeeklyResult`/`PrizeDistribution` themselves still only
  ever cover the top 100, per the existing "cutover only ever writes the top
  100 into Postgres" design from the leaderboard module.
- **Weekly reset job:** The given pseudocode's `if (job.status === 'pending')`
  branch (run cutover, mark `distributing`) was widened to "run cutover
  whenever status isn't already `distributing`" (i.e. also on a `FAILED`
  retry), rather than implementing exactly the two-branch pseudocode
  verbatim. Justification: a `FAILED` job could have failed either before or
  after cutover actually ran, and there's no way to tell which from the
  status alone (`FAILED` overwrites whatever the prior status was) — but
  `weekCutover.lua` is already proven idempotent in `tests/lua.test.ts`, so
  it's always safe to re-run it on a `FAILED` retry rather than risk
  silently skipping a cutover that never actually happened.
- **Weekly reset job:** `writePostgresTransaction` deletes any existing
  `WeeklyResult`/`PrizeDistribution` rows for the `weekId` before
  `createMany`, rather than assuming a first-time insert — needed so a retry
  after a partial failure (cutover succeeded, Postgres write didn't) doesn't
  throw on the `[weekId, userId]` unique constraint or duplicate rows.
- **Weekly reset job:** `getNextWeekId(weekId)` was added to
  `week.util.ts` (not explicitly requested) — the admin force-reset endpoint
  needs to derive "the week after this one" for an arbitrary, possibly-past
  `weekId` a reviewer passes in, which is different from the worker's
  `resolveResetWeekIds()` (also added, in `weeklyReset.job.ts`), which
  derives both weekIds from "now" at the Monday-00:00-UTC cron boundary.
- **Weekly reset job:** The task description referenced `server/src/lib/weekUtils.ts`
  for weekId computation; no such file exists in this repo — the project's
  actual ISO-week helpers live in `server/src/modules/leaderboard/week.util.ts`
  (added in the leaderboard-module step). Reused that file (extended with
  `getNextWeekId`) rather than creating a duplicate `src/lib/weekUtils.ts`,
  treating the referenced path as shorthand rather than a literal
  instruction to fork the week-math logic into a second location.
- **Weekly reset job:** BullMQ needs its own Redis connection with
  `maxRetriesPerRequest: null` (its documented requirement for
  blocking/retry semantics) — added a dedicated `ioredis` connection in
  `src/jobs/queue.ts` rather than reusing the app's shared `redis` singleton,
  which is tuned for normal request/response use.
- **Weekly reset job:** Added `start:worker` (`node dist/worker.js`) to
  `package.json` alongside the requested `worker` (dev) script, mirroring
  the existing `dev`/`start` pairing for the API server, for production
  parity.
- **Weekly reset job:** `weeks.controller.ts` validates the `:weekId` route
  param against the `YYYY-Www` shape with zod before calling `resetWeek`,
  matching the existing validate-then-call pattern used by
  `auth.controller.ts`/`leaderboard.controller.ts`, rather than letting a
  malformed weekId fail deeper in the stack with a less clear error.

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
- **Auth + seed:** `npm run seed` → printed `Total users seeded: 10003`,
  `Current week: 2026-W31`, `Historical weeks seeded: 2026-W30, 2026-W29`,
  and the three login usernames (`admin`, `demo_top_player` at rank 1,
  `demo_regular_player` at rank 5001). Cross-checked directly against the
  databases: `SELECT COUNT(*) FROM "User"` → 10003, `"WeeklyResult"` → 200
  (100 × 2 historical weeks), `"PrizeDistribution"` → 20 (10 × 2 weeks),
  `ZCARD leaderboard:week:2026-W31` → 10002 (10,000 fake + 2 demo users,
  admin correctly excluded).
- **Auth + seed:** Ran `npm run seed` a second time — output was identical
  (`Total users seeded: 10003`) and the same DB counts held steady (no
  duplication), confirming idempotency.
- **Auth + seed:** `npm run dev` + `curl`: logged in as `demo_top_player`
  and `demo_regular_player` via `POST /auth/login`, then called
  `GET /leaderboard/me` with each token. `demo_top_player` → in-top-100
  shape (`inTop100: true`, `myRank: 1`, single-entry `entries`).
  `demo_regular_player` → outside-top-100 shape (`inTop100: false`,
  `myRank: 5002`, 6-entry ±3/-2 window with `isCurrentUser: true` on
  exactly its own row).
- **Auth + seed:** Rate limiter load test: sent 65 rapid
  `POST /earnings/earn` requests as `demo_regular_player`. Requests 1-60
  returned `201`, requests 61-65 returned `429` — matching the specified
  60/minute/user ceiling exactly.
- **Auth + seed:** `npm run test` → 17/17 passing (5 new
  `auth.middleware.test.ts` + existing 9 `lua.test.ts` + 3
  `leaderboard.service.test.ts`), covering `requireAdmin`'s 403 path for a
  non-admin user and its pass-through for an admin, plus `requireAuth`'s
  401 (missing/invalid token) and success (valid token sets
  `req.userId`/`req.userRole`) paths. `tsc --noEmit` clean.
- **Auth + seed:** Re-ran `npm run seed` once more after the manual
  `curl`/rate-limit testing above (which had written real earn events) to
  leave the environment in a clean, reviewable demo state.
- **Prize distribution:** `npm run test tests/prizes.util.test.ts` → 11/11
  passing, including: N=100 matching the case spec's 20%/15%/10% top-3 shares
  and the pool summing exactly (proving the normalized formula is
  behaviorally identical to the raw spec formula at N=100); N=5 and N=3 (no
  ranks 4-100 present) both summing exactly to the pool, with N=3 additionally
  checked to preserve the 20:15:10 ratio; N=1 awarding the entire pool to the
  single player; empty input returning `[]`; and two dedicated
  rounding-remainder tests confirming the leftover cent(s) land on rank 4 when
  present and on rank 1 when rank 4 doesn't exist (N=3 case).
- **Weekly reset job:** `npm run test tests/weeklyReset.test.ts` → 2/2
  passing: the main scenario (cutover ran, `WeeklyResult` ranks/earnings
  match exactly, `PrizeDistribution` amounts cross-checked against
  `calculatePrizeDistribution` directly rather than hand-computed numbers,
  the Mongo `WeeklySnapshot` document matches, then a second `resetWeek`
  call for the same `weekId` is proven to leave row counts unchanged) and a
  no-earn-calls-this-week scenario (empty archive, job still completes).
  Full `npm run test` → 30/30 (all prior suites unaffected). `tsc --noEmit`
  and `npm run build` both clean.
- **Weekly reset job:** Debugged an early 5s test timeout by isolating the
  hang to `writeMongoSnapshot`: the test file wasn't calling `connectMongo()`
  (unlike `leaderboard.service.test.ts`, which never touches Mongo), so
  Mongoose buffered the `findOneAndUpdate` call for its full 10s timeout
  before failing — longer than Vitest's 5s default. Fixed by adding
  `connectMongo()`/`mongoose.connection.close()` to the test's
  `beforeAll`/`afterAll`, not by increasing the test timeout, since the real
  bug was a missing connection, not a slow one.
- **Weekly reset job:** Manual end-to-end walkthrough against the seeded
  demo data (`npm run seed`, current week `2026-W31`, 10,003 users): started
  `npm run dev`, logged in as `admin`, called
  `POST /admin/weeks/2026-W31/force-reset` → `{"status":"COMPLETED"}`.
  Verified in Postgres: `WeeklyResult` has exactly 100 rows for
  `2026-W31`; `PrizeDistribution` ranks 1-3 are exactly 20%/15%/10% of
  `poolTotalInCents` and `SUM(prizeAmountInCents)` equals `poolTotalInCents`
  to the cent; `WeeklyResetJob.status` is `COMPLETED`. Called the same
  force-reset endpoint a second time — row counts stayed at 100 (no
  duplication), confirming idempotency live, not just in the test suite.
  Confirmed `demo_top_player` (a non-admin) gets `403 Admin role required`
  from the same endpoint. Stopped the API, started `npm run worker`
  separately, and confirmed via `redis-cli` (`HGETALL
  bull:weekly-reset:repeat:<hash>`) that the registered repeatable job has
  `pattern: "0 0 * * 1"`, `tz: "UTC"`, and a next-run timestamp that decodes
  to `2026-08-03T00:00:00.000Z` — a Monday, confirming the cron expression
  is wired correctly end-to-end through BullMQ. Cleaned up the
  worker-created `bull:weekly-reset:*` Redis keys and re-ran `npm run seed`
  afterward to leave the environment in a clean, reviewable demo state.

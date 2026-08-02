# AI Workflow Log

This file tracks which decisions were made by the user and which
boilerplate was produced by the AI during collaboration with Claude.
It will be updated at every step.

## Step 1 — Repo skeleton, Docker, Prisma schema

### Decisions made by the user
- Monorepo tooling (workspaces/lerna/turborepo) will NOT be used;
  `server/` and `client/` are fully independent projects, no root
  package.json.
- Stack: Express + TypeScript, PostgreSQL (Prisma), MongoDB (Mongoose),
  Redis (ioredis), BullMQ, JWT, Zod, Pino, express-rate-limit +
  rate-limit-redis, faker.
- Postgres/Redis/Mongo are not installed natively on the dev machine —
  everything runs via Docker.
- Prisma models (User, WeeklyResult, PrizeDistribution, WeeklyResetJob)
  were specified at the field and constraint (unique) level.
- The paragraph clarifying the project structure (referencing the case's
  "client and server code should be in separate projects" requirement)
  was added verbatim to the top of the README.
- `tsconfig.json`: using `moduleResolution: node` triggered TypeScript's
  "deprecated, will be removed in TS 7.0" warning. The AI first explained
  two options (silence the warning vs. switch to `node16`) with their
  pros/cons; the user chose `node16` — `module` was also updated to
  `Node16` (TypeScript requires this pairing). This is the non-deprecated
  algorithm that matches Node's actual resolution behavior.

### Decisions made / boilerplate produced by the AI
- `tsconfig.json`: `target: ES2022` was chosen; `module`/`moduleResolution`
  were initially `commonjs`/`node` (not asked, justified: to avoid ESM
  interop friction between ts-node-dev and CJS-heavy packages like
  bullmq/mongoose/prisma). Later updated to `Node16`/`Node16` — see the
  user decision above.
- Migration name: `init` (no preference specified in the case).
- `src/config/env.ts`: env validation with zod; the process crashes
  immediately on missing/invalid env vars (no silent fallback).
- `src/config/postgres.ts`, `redis.ts`, `mongo.ts`: singleton pattern
  (global cache) to prevent multiple instances on hot-reload;
  redis/mongo connect/error events are logged via pino.
- `src/server.ts`: a single `/health` endpoint — checks pg/redis/mongo
  connectivity in parallel and returns JSON.
- Docker Compose: healthcheck + named volumes + env variables read from
  `.env` (with sensible defaults, not hardcoded).

### Verification
- `docker compose up -d` → `docker compose ps` shows postgres/redis/mongo
  all `healthy`.
- `npx prisma migrate dev --name init` ran successfully, Prisma Client
  was generated.
- `npm run dev` followed by `curl localhost:3000/health` →
  `{"status":"ok","services":{"postgres":"up","redis":"up","mongo":"up"}}`.

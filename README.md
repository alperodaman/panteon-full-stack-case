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
PostgreSQL (Prisma), MongoDB (Mongoose), Redis (ioredis).

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

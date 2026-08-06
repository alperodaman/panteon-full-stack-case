# syntax=docker/dockerfile:1

# ---- builder ----------------------------------------------------------
# Compiles TypeScript, copies the Lua scripts into dist/, and generates
# the Prisma client (Prisma 7 + @prisma/adapter-pg connects at runtime,
# but the client code itself must exist before `tsc` / `node` can load it).
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# prisma.config.ts calls env("DATABASE_URL"), and Prisma 7 loads that config
# file even for `generate` — it never connects, but it still errors out if
# the variable is unset. There's no .env in the build context (excluded via
# .dockerignore on purpose, so real secrets never get baked into the image),
# so give it a throwaway placeholder just to satisfy that check. It has no
# effect at runtime: api/worker/migrate get the real DATABASE_URL from
# server/.env via docker-compose.prod.yml's `env_file:`, which overrides
# this build-time value entirely.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npm run build

# ---- runtime ------------------------------------------------------------
# Same image is used for the api container, the worker container, and the
# one-off `migrate` service — only the docker-compose `command:` differs.
#
# node_modules is carried over from the builder (not re-installed with
# --omit=dev) because the `migrate` service runs `npx prisma migrate
# deploy`, which needs the `prisma` CLI — a devDependency in
# server/package.json. Re-running `npm ci --omit=dev` here would strip it
# out and break migrations. The generated Prisma client also already
# lives inside this node_modules tree, so nothing needs regenerating.
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# node:20-alpine ships an unprivileged "node" user (uid 1000) out of the box.
RUN chown -R node:node /app
USER node

# No CMD/ENTRYPOINT here on purpose: docker-compose.prod.yml sets
# `command: node dist/server.js` / `node dist/worker.js` / `npx prisma
# migrate deploy` per service against this same image.

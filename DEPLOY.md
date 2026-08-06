# Deploying `server/` (production)

This covers the API + BullMQ worker only. `client/` is a separate static
Vite build meant for S3 + CloudFront and is not part of this flow.

## Files involved

- [server/Dockerfile](server/Dockerfile) — multi-stage build. One image,
  used for three different containers (`api`, `worker`, `migrate`) that
  only differ by the `command:` docker-compose gives them.
- [docker-compose.prod.yml](docker-compose.prod.yml) — overlay on top of
  the existing [docker-compose.yml](docker-compose.yml). Never run this
  file alone; it doesn't redefine postgres/redis/mongo, it only overrides
  their `ports:` (drops the host mapping so they're only reachable inside
  the compose network) and adds `api`, `worker`, `migrate`, and `caddy`.
- [Caddyfile](Caddyfile) — reverse proxy + automatic HTTPS in front of the
  `api` container. Nothing else is exposed to the internet.

`ports: !reset []` in the overlay requires Docker Compose v2.24.4+ (the
`!reset` merge tag). Check with `docker compose version` on the EC2 box.

## One-time EC2 setup

1. Point DNS (A record) for your API domain at the instance's public IP.
2. Install Docker + the Compose plugin.
3. Clone the repo.
4. Edit [Caddyfile](Caddyfile): replace `api.panteon.alperodaman.com` with
   your real domain — Caddy needs the real hostname both to route and to
   request the Let's Encrypt certificate.
5. Create `server/.env` on the box (**never commit this file** — see
   below) with production values for:
   - `DATABASE_URL` — production Postgres connection string
   - `MONGO_URI` — production MongoDB connection string
   - `REDIS_URL` — production Redis connection string
   - `JWT_SECRET` — a real random secret, not the repo default
   - `JWT_EXPIRY` — e.g. `15m` (the repo default `2h` is a demo
     convenience, see `server/.env.example`)
   - `PORT` — `3000` unless you changed the Dockerfile/compose command
   - `NODE_ENV` — `production`

   `server/.env.example` documents every one of these; copy it as a
   starting point (`cp server/.env.example server/.env`) and fill in real
   values.

## Bringing it up

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

What happens, in order:
1. postgres/redis/mongo start (host ports closed — only reachable inside
   the compose network).
2. `migrate` builds the server image, runs `prisma migrate deploy`, then
   exits (`restart: "no"` — it's a one-off, not a long-running service).
3. `api` and `worker` start only once `migrate` exits successfully
   (`service_completed_successfully`) and the three data stores report
   healthy.
4. `caddy` starts, terminates TLS, and reverse-proxies to `api:3000`.

Check status / logs:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api worker caddy
```

Re-deploying after a code change is the same command again — `--build`
rebuilds the image, `migrate` re-runs (idempotent: `prisma migrate deploy`
only applies pending migrations), and `api`/`worker` restart on the new
image.

## Secrets

`server/.env` holds real credentials and **must never be pushed to
GitHub**. The root [.gitignore](.gitignore) already ignores it via the
`**/.env` pattern (verified — `server/.env` and any other `.env` file
anywhere in the repo are excluded; only `server/.env.example`, which has
no real secrets, is tracked). Keep it that way: don't add `server/.env`
with `git add -f`, and don't put production secrets in
`docker-compose.prod.yml` or the Dockerfile — they're both committed
files.

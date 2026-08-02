# AI Workflow Log

Bu dosya, Claude ile yapılan işbirliğinde hangi kararların kullanıcı
tarafından verildiğini, hangi kısımların AI tarafından üretildiğini takip
eder. Her adımda güncellenecektir.

## Adım 1 — Repo iskeleti, Docker, Prisma şeması

### Kullanıcının verdiği kararlar
- Monorepo tooling (workspaces/lerna/turborepo) KULLANILMAYACAK; `server/`
  ve `client/` tamamen bağımsız projeler, kökte package.json yok.
- Stack: Express + TypeScript, PostgreSQL (Prisma), MongoDB (Mongoose),
  Redis (ioredis), BullMQ, JWT, Zod, Pino, express-rate-limit +
  rate-limit-redis, faker.
  services PG/Redis/Mongo native kurulu değil — hepsi Docker.
  - Prisma modelleri (User, WeeklyResult, PrizeDistribution,
  WeeklyResetJob) alan ve constraint (unique) düzeyinde verildi.
- README'nin başına proje yapısını netleştiren paragraf (case
  gereksinimine referansla) birebir eklendi.
- `tsconfig.json`: `moduleResolution: node` kullanımı TS'in "deprecated,
  TS 7.0'da kaldırılacak" uyarısını veriyordu. AI önce iki seçeneği
  (susturmak vs. `node16`'ya geçmek) artı/eksileriyle anlattı; kullanıcı
  `node16`'yı seçti — `module` de (TS'in zorunlu kıldığı eşleşme
  nedeniyle) `Node16` olarak güncellendi. Deprecated olmayan, Node'un
  gerçek çözümleme davranışıyla birebir örtüşen algoritma.

### AI'ın verdiği kararlar / ürettiği boilerplate
- `tsconfig.json`: `target: ES2022` seçildi; `module`/`moduleResolution`
  ilk aşamada `commonjs`/`node` idi (soruldu değil, gerekçelendirildi:
  ts-node-dev + bullmq/mongoose/prisma gibi CJS-ağırlıklı paketlerle ESM
  interop sürtünmesinden kaçınmak için). Sonradan `Node16`/`Node16`
  olarak güncellendi — bkz. kullanıcı kararı.
- Migration adı: `init` (case'de tercih belirtilmediği için).
- `src/config/env.ts`: zod ile env validation, hatalıysa process crash
  eder (sessiz fallback yok).
- `src/config/postgres.ts`, `redis.ts`, `mongo.ts`: singleton pattern
  (global cache) ile hot-reload'da çoklu instance önlendi; redis/mongo
  connect/error event'leri pino ile loglanıyor.
- `src/server.ts`: sadece `/health` endpoint'i — pg/redis/mongo
  bağlantı durumunu paralel kontrol edip JSON döner.
- Docker Compose: healthcheck + named volume + `.env`'den okunan (fakat
  sensible default'lu) env değişkenleri.

### Doğrulama
- `docker compose up -d` → `docker compose ps` ile postgres/redis/mongo
  üçü de `healthy`.
- `npx prisma migrate dev --name init` başarıyla çalıştı, Prisma Client
  generate edildi.
- `npm run dev` sonrası `curl localhost:3000/health` →
  `{"status":"ok","services":{"postgres":"up","redis":"up","mongo":"up"}}`.

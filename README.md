## Proje Yapısı

Bu repo, aralarında hiçbir kod paylaşımı olmayan İKİ AYRI PROJE içerir:
`server/` ve `client/`. Her biri kendi package.json'ı, kendi bağımlılık
ağacı, kendi tsconfig'i ve kendi test/build pipeline'ıyla tamamen bağımsız
çalışır. Aralarındaki tek bağlantı HTTP API'dir (client, server'a sadece
network üzerinden istek atar). Tek repo altında tutulmalarının sebebi
sadece review kolaylığı ve tek `docker compose up` ile local ortamın
ayağa kalkabilmesidir — mimari veya kod düzeyinde hiçbir bağımlılıkları
yoktur.

# Panteon Leaderboard — Server

Haftalık leaderboard sistemi. Stack: Node.js + Express + TypeScript,
PostgreSQL (Prisma), MongoDB (Mongoose), Redis (ioredis).

## Local geliştirme ortamını ayağa kaldırma

1. Bağımlılık servislerini (Postgres, Redis, MongoDB) Docker ile başlat:

   ```bash
   docker compose up -d
   docker compose ps   # üçünün de "healthy" olduğunu doğrula
   ```

2. Server projesinin bağımlılıklarını kur:

   ```bash
   cd server
   npm install
   ```

3. `server/.env.example` dosyasını `server/.env` olarak kopyala ve
   gerekirse (örn. port çakışması varsa) değerleri güncelle:

   ```bash
   cp .env.example .env
   ```

4. İlk migration'ı çalıştır (Postgres container'ı ayaktayken):

   ```bash
   npx prisma migrate dev
   ```

5. Dev server'ı başlat:

   ```bash
   npm run dev
   ```

6. Doğrula:

   ```bash
   curl localhost:3000/health
   ```

   Postgres, Redis ve MongoDB bağlantılarının durumunu içeren bir JSON
   dönmelidir.

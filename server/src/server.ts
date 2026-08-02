import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { logger } from "./logger";
import { prisma } from "./config/postgres";
import { redis } from "./config/redis";
import "./config/luaScripts";
import { connectMongo, mongoose } from "./config/mongo";
import { leaderboardRouter } from "./modules/leaderboard/leaderboard.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { weeksRouter } from "./modules/weeks/weeks.routes";
import { historyRouter } from "./modules/history/history.routes";
import { errorHandler } from "./middleware/errorHandler";

export const app = express();

app.use(cors());
app.use(express.json());
app.use(authRouter);
app.use(leaderboardRouter);
app.use(weeksRouter);
app.use(historyRouter);

app.get("/health", async (_req, res) => {
  const [postgres, redisStatus, mongo] = await Promise.all([
    prisma
      .$queryRaw`SELECT 1`
      .then(() => "up" as const)
      .catch(() => "down" as const),
    redis
      .ping()
      .then(() => "up" as const)
      .catch(() => "down" as const),
    Promise.resolve(mongoose.connection.readyState === 1 ? ("up" as const) : ("down" as const)),
  ]);

  const allUp = postgres === "up" && redisStatus === "up" && mongo === "up";

  res.status(allUp ? 200 : 503).json({
    status: allUp ? "ok" : "degraded",
    services: { postgres, redis: redisStatus, mongo },
  });
});

// Must be registered after all routes -- Express only routes errors to a
// handler with this 4-arg signature that comes later in the middleware chain.
app.use(errorHandler);

const start = async () => {
  await connectMongo();

  app.listen(env.PORT, () => {
    logger.info(`Server listening on port ${env.PORT}`);
  });
};

// Guarded so importing `app` (e.g. from tests/api.integration.test.ts via
// supertest, which drives the app in-process without a real listening port)
// doesn't also connect to Mongo / bind a port as a side effect -- only the
// entry point actually executed as `node dist/server.js` / `ts-node-dev
// src/server.ts` does.
if (require.main === module) {
  start().catch((err) => {
    logger.error({ err }, "Failed to start server");
    process.exit(1);
  });
}

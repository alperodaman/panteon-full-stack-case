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

const app = express();

app.use(cors());
app.use(express.json());
app.use(authRouter);
app.use(leaderboardRouter);
app.use(weeksRouter);

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

const start = async () => {
  await connectMongo();

  app.listen(env.PORT, () => {
    logger.info(`Server listening on port ${env.PORT}`);
  });
};

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});

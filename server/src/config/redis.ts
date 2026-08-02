import Redis from "ioredis";
import { env } from "./env";
import { logger } from "../logger";

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
}

export const redis = global.__redis ?? new Redis(env.REDIS_URL);

if (env.NODE_ENV !== "production") {
  global.__redis = redis;
}

redis.on("connect", () => {
  logger.info("Redis connected");
});

redis.on("error", (err) => {
  logger.error({ err }, "Redis connection error");
});

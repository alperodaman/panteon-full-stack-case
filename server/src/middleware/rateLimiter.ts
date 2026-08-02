import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../config/redis";

// Per-user (req.userId), not per-IP: the API is stateless and meant to run
// behind a load balancer across multiple instances, so an in-memory
// IP-keyed limiter would let a single abusive user reset their count just by
// landing on a different instance. Keying on userId + backing the counter
// with Redis (shared across instances) closes that gap. requireAuth must run
// before this middleware so req.userId is already set.
//
// Limit: 60 requests/minute/user. DevPanel's "Hızlı Simülasyon" toggle fires
// roughly one earn call per second (~20/min), so 60/min leaves that flow
// comfortably under the ceiling while still catching a real abuse pattern
// (more than one fabricated earn per second sustained for a minute).
export const earnRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId!,
  store: new RedisStore({
    sendCommand: (...args: string[]) => {
      const [command, ...rest] = args;
      return redis.call(command!, rest) as Promise<never>;
    },
  }),
});

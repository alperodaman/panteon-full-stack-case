import { Queue } from "bullmq";
import Redis from "ioredis";
import { env } from "../config/env";

// BullMQ requires maxRetriesPerRequest: null on its Redis connection (it
// manages blocking/retry semantics itself) -- a dedicated connection rather
// than reusing the app's shared `redis` singleton, which is tuned for normal
// request/response use.
export const bullConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const WEEKLY_RESET_QUEUE_NAME = "weekly-reset";

export const weeklyResetQueue = new Queue(WEEKLY_RESET_QUEUE_NAME, { connection: bullConnection });

// Cron decision (fixed, not configurable): every Monday 00:00 UTC. This
// lines up exactly with the ISO 8601 week boundary that weekId ("YYYY-Www",
// see week.util.ts) is already built around -- ISO weeks start on Monday --
// so the cron firing moment and the weekId math agree on where a week
// begins and ends. UTC keeps that boundary independent of whatever timezone
// the server happens to run in.
export const WEEKLY_RESET_CRON = "0 0 * * 1";

// BullMQ repeatable jobs are keyed by (name, repeat options, jobId), so
// calling this on every worker boot is idempotent -- it won't create a
// second schedule alongside an existing one.
export async function scheduleWeeklyReset(): Promise<void> {
  await weeklyResetQueue.add(
    "reset",
    {},
    {
      repeat: { pattern: WEEKLY_RESET_CRON, tz: "UTC" },
      jobId: "weekly-reset-cron",
    },
  );
}

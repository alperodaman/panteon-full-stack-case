import { env } from "./config/env";
import { logger } from "./logger";
import "./config/luaScripts";
import { connectMongo } from "./config/mongo";
import { startWeeklyResetWorker } from "./jobs/worker";

// Separate entry point/process from src/server.ts -- the API is designed to
// be stateless and horizontally scaled, and a BullMQ repeatable job must
// only be scheduled/consumed by a single logical worker role, not by every
// API instance that happens to be running.
async function start(): Promise<void> {
  await connectMongo();
  await startWeeklyResetWorker();
  logger.info({ env: env.NODE_ENV }, "Worker process started");
}

start().catch((err) => {
  logger.error({ err }, "Failed to start worker process");
  process.exit(1);
});

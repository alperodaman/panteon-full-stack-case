import { Job, Worker } from "bullmq";
import { bullConnection, scheduleWeeklyReset, WEEKLY_RESET_CRON, WEEKLY_RESET_QUEUE_NAME } from "./queue";
import { resetWeek, resolveResetWeekIds } from "./weeklyReset.job";
import { logger } from "../logger";

async function processWeeklyReset(_job: Job): Promise<void> {
  const { weekId, nextWeekId } = resolveResetWeekIds();
  logger.info({ weekId, nextWeekId }, "Running weekly reset job");
  await resetWeek(weekId, nextWeekId);
}

export const weeklyResetWorker = new Worker(WEEKLY_RESET_QUEUE_NAME, processWeeklyReset, {
  connection: bullConnection,
});

weeklyResetWorker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Weekly reset job completed");
});

weeklyResetWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Weekly reset job failed");
});

export async function startWeeklyResetWorker(): Promise<void> {
  await scheduleWeeklyReset();
  logger.info(
    { cron: WEEKLY_RESET_CRON, tz: "UTC" },
    "Weekly reset repeatable job scheduled",
  );
}

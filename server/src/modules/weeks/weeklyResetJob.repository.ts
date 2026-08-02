import { Prisma, WeeklyResetJob, WeeklyResetStatus } from "@prisma/client";
import { prisma } from "../../config/postgres";

// WeeklyResetJob.weekId is UNIQUE. If two callers race to create the row for
// the same week (e.g. the cron worker firing right as an admin triggers the
// force-reset demo endpoint), the loser's create() throws Postgres's unique
// violation (Prisma P2002) instead of erroring the caller -- it just re-reads
// the row the winner already created.
export async function getOrCreateResetJob(weekId: string): Promise<WeeklyResetJob> {
  try {
    return await prisma.weeklyResetJob.create({ data: { weekId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.weeklyResetJob.findUnique({ where: { weekId } });
      if (existing) {
        return existing;
      }
    }
    throw err;
  }
}

export async function updateJobStatus(
  weekId: string,
  status: WeeklyResetStatus,
): Promise<void> {
  await prisma.weeklyResetJob.update({ where: { weekId }, data: { status } });
}

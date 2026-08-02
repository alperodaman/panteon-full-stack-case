import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { resetWeek } from "../../jobs/weeklyReset.job";
import { getNextWeekId } from "../leaderboard/week.util";

const weekIdParamSchema = z.object({
  weekId: z.string().regex(/^\d{4}-W\d{2}$/, "weekId must look like YYYY-Www, e.g. 2026-W31"),
});

// Demo/review shortcut: lets a reviewer trigger a specific week's cutover +
// prize distribution on demand, without waiting for the real Monday 00:00
// UTC cron. Calls the exact same resetWeek() the worker's repeatable job
// calls, so it exercises the real path end-to-end, not a parallel one.
export async function postForceReset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = weekIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid weekId", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const { weekId } = parsed.data;
    const nextWeekId = getNextWeekId(weekId);

    await resetWeek(weekId, nextWeekId);

    res.json({ weekId, nextWeekId, status: "COMPLETED" });
  } catch (err) {
    next(err);
  }
}

import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import * as leaderboardService from "./leaderboard.service";

function weekIdFromQuery(req: Request): string | undefined {
  return typeof req.query.weekId === "string" ? req.query.weekId : undefined;
}

export async function getTop(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await leaderboardService.getTopLeaderboard(weekIdFromQuery(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await leaderboardService.getMyPosition(req.userId!, weekIdFromQuery(req));
    res.json(result);
  } catch (err) {
    next(err);
  }
}

const earnBodySchema = z.object({
  amountInCents: z.number().int().positive(),
});

export async function postEarn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = earnBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const result = await leaderboardService.earn(req.userId!, parsed.data.amountInCents);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

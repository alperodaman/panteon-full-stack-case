import { Router } from "express";
import { requireAdmin, requireAuth } from "../../middleware/auth.middleware";
import { getCurrentWeek, getWeekPrizes, getWeekResults, postForceReset } from "./weeks.controller";

export const weeksRouter = Router();

weeksRouter.get("/weeks/current", getCurrentWeek);
weeksRouter.get("/weeks/:weekId/results", getWeekResults);
weeksRouter.get("/weeks/:weekId/prizes", getWeekPrizes);
weeksRouter.post("/admin/weeks/:weekId/force-reset", requireAuth, requireAdmin, postForceReset);

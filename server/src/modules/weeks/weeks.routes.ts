import { Router } from "express";
import { requireAdmin, requireAuth } from "../../middleware/auth.middleware";
import { postForceReset } from "./weeks.controller";

export const weeksRouter = Router();

weeksRouter.post("/admin/weeks/:weekId/force-reset", requireAuth, requireAdmin, postForceReset);

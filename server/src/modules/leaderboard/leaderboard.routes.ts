import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { earnRateLimiter } from "../../middleware/rateLimiter";
import { getMe, getTop, postEarn } from "./leaderboard.controller";

export const leaderboardRouter = Router();

leaderboardRouter.get("/leaderboard/top", getTop);
leaderboardRouter.get("/leaderboard/me", requireAuth, getMe);
leaderboardRouter.post("/earnings/earn", requireAuth, earnRateLimiter, postEarn);

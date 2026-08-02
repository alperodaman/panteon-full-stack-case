import { Router } from "express";
import { placeholderAuth } from "../../middleware/placeholderAuth";
import { getMe, getTop, postEarn } from "./leaderboard.controller";

export const leaderboardRouter = Router();

leaderboardRouter.get("/leaderboard/top", getTop);
leaderboardRouter.get("/leaderboard/me", placeholderAuth, getMe);
leaderboardRouter.post("/earnings/earn", placeholderAuth, postEarn);

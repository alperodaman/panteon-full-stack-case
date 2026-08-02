import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { getMyHistory } from "./history.controller";

export const historyRouter = Router();

historyRouter.get("/users/me/history", requireAuth, getMyHistory);

import { NextFunction, Request, Response } from "express";
import * as historyService from "./history.service";

export async function getMyHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await historyService.getUserHistory(req.userId!);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

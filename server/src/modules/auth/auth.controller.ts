import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import * as authService from "./auth.service";

const loginBodySchema = z.object({
  username: z.string().min(1),
});

export async function postLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = loginBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten().fieldErrors });
      return;
    }

    const result = await authService.login(parsed.data.username);
    res.json(result);
  } catch (err) {
    if (err instanceof authService.InvalidCredentialsError) {
      res.status(404).json({ error: "Unknown username" });
      return;
    }
    next(err);
  }
}

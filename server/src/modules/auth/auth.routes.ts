import { Router } from "express";
import { postLogin } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/auth/login", postLogin);

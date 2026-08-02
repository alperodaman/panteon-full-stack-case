import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: "USER" | "ADMIN";
    }
  }
}

interface AccessTokenPayload {
  userId: string;
  username: string;
  role: "USER" | "ADMIN";
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
    req.userId = payload.userId;
    req.userRole = payload.role;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Must run after requireAuth in the chain -- relies on req.userRole already
// being set from the verified token.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.userRole !== "ADMIN") {
    res.status(403).json({ error: "Admin role required" });
    return;
  }
  next();
}

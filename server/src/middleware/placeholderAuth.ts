import { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

// Stand-in for the real JWT middleware (step 4). Trusts an x-user-id header
// so downstream routes can already be built against a stable req.userId
// contract; swap the body for real token verification later without
// touching the routes that depend on it.
export function placeholderAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = req.header("x-user-id");
  if (!userId) {
    res.status(401).json({ error: "Missing x-user-id header (placeholder auth)" });
    return;
  }
  req.userId = userId;
  next();
}

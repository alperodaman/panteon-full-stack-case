import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { logger } from "../logger";

// Central, last-resort error handler. Route/controller code already handles
// its own expected error paths inline (e.g. auth.controller's 404 on an
// unknown username, zod .safeParse() 400s) -- this only catches whatever
// reaches next(err): unexpected exceptions, and errors from libraries
// (Prisma, zod if a .parse() is ever used instead of .safeParse()) that
// don't already produce a client-safe response on their own.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: err.flatten().fieldErrors });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      res.status(409).json({ error: "Conflict: resource already exists" });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({ error: "Resource not found" });
      return;
    }
  }

  logger.error({ err }, "Unhandled request error");

  // Stack traces are only useful to us, and can leak internal file paths /
  // dependency versions to a client -- never send them outside development.
  const isProduction = process.env.NODE_ENV === "production";
  const message = err instanceof Error ? err.message : "Internal server error";

  res.status(500).json({
    error: isProduction ? "Internal server error" : message,
    ...(isProduction ? {} : { stack: err instanceof Error ? err.stack : undefined }),
  });
}

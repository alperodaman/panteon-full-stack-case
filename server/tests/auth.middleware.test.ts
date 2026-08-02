import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../src/config/env";
import { requireAdmin, requireAuth } from "../src/middleware/auth.middleware";

function mockRes() {
  const res = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & { statusCode?: number; body?: unknown };
}

function mockReq(overrides: Partial<Request> = {}): Request {
  return overrides as Request;
}

describe("requireAuth", () => {
  it("401s when there is no bearer token", () => {
    const req = mockReq({ header: () => undefined });
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("401s on an invalid token", () => {
    const req = mockReq({ header: () => "Bearer not-a-real-token" });
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("sets req.userId/userRole and calls next() for a valid token", () => {
    const token = jwt.sign({ userId: "user-1", username: "alice", role: "USER" }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRY as jwt.SignOptions["expiresIn"],
    });
    const req = mockReq({ header: () => `Bearer ${token}` });
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe("user-1");
    expect(req.userRole).toBe("USER");
    expect(res.statusCode).toBeUndefined();
  });
});

describe("requireAdmin", () => {
  it("403s a non-admin user", () => {
    const req = mockReq({ userId: "user-1", userRole: "USER" });
    const res = mockRes();
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Admin role required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() for an admin user", () => {
    const req = mockReq({ userId: "admin-1", userRole: "ADMIN" });
    const res = mockRes();
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
  });
});

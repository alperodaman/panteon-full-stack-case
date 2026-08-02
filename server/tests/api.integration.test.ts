import { randomUUID } from "crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import "../src/config/luaScripts";
import { app } from "../src/server";
import { redis } from "../src/config/redis";
import { prisma } from "../src/config/postgres";
import { connectMongo, mongoose } from "../src/config/mongo";
import { EarningEvent } from "../src/db/mongo/models/earningEvent.model";
import { WeeklySnapshot } from "../src/db/mongo/models/weeklySnapshot.model";
import { calculatePrizePool } from "../src/modules/prizes/prizes.util";
import { getIsoWeekStart } from "../src/modules/leaderboard/week.util";

// Far-future weekId so this suite never collides with real seeded data
// (npm run seed writes "current"/recent real weeks) or with
// tests/weeklyReset.test.ts's own fixed weekIds. Must still satisfy the
// "YYYY-Www" shape the controllers/week.util validate against.
describe("API integration: login -> earn -> leaderboard -> force-reset -> weeks -> history", () => {
  const testWeekId = "2099-W01";
  let nextWeekId: string;

  let normalUser: { id: string; username: string };
  let adminUser: { id: string; username: string };
  let normalToken: string;
  let adminToken: string;

  const leaderboardKey = `leaderboard:week:${testWeekId}`;
  const archiveKey = `leaderboard:archive:${testWeekId}`;
  const earningsKey = `earnings:week:${testWeekId}`;

  beforeAll(async () => {
    await connectMongo();

    const runSuffix = randomUUID().slice(0, 8);
    normalUser = await prisma.user.create({
      data: { username: `api-user-${runSuffix}`, email: `api-user-${runSuffix}@example.com` },
    });
    adminUser = await prisma.user.create({
      data: {
        username: `api-admin-${runSuffix}`,
        email: `api-admin-${runSuffix}@example.com`,
        role: "ADMIN",
      },
    });

    // Point the active week at our isolated testWeekId rather than relying
    // on whatever the real current ISO week happens to be, so this suite's
    // earn/leaderboard/reset flow never touches real seeded leaderboard data.
    await redis.set("config:currentWeekId", testWeekId);
  });

  afterAll(async () => {
    const weekIds = [testWeekId, nextWeekId].filter(Boolean) as string[];
    await prisma.prizeDistribution.deleteMany({ where: { weekId: { in: weekIds } } });
    await prisma.weeklyResult.deleteMany({ where: { weekId: { in: weekIds } } });
    await prisma.weeklyResetJob.deleteMany({ where: { weekId: { in: weekIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [normalUser.id, adminUser.id] } } });

    await EarningEvent.deleteMany({ userId: normalUser.id });
    await WeeklySnapshot.deleteMany({ weekId: { $in: weekIds } });

    const nextLeaderboardKey = nextWeekId ? `leaderboard:week:${nextWeekId}` : undefined;
    await redis.del(
      leaderboardKey,
      archiveKey,
      earningsKey,
      "config:currentWeekId",
      ...(nextLeaderboardKey ? [nextLeaderboardKey] : []),
    );

    await prisma.$disconnect();
    await redis.quit();
    await mongoose.connection.close();
  });

  it("logs in as the normal user and the admin user", async () => {
    const normalLogin = await request(app).post("/auth/login").send({ username: normalUser.username });
    expect(normalLogin.status).toBe(200);
    normalToken = normalLogin.body.token;

    const adminLogin = await request(app).post("/auth/login").send({ username: adminUser.username });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.token;
  });

  it("records an earning for the normal user", async () => {
    // testWeekId is a fictional far-future week (chosen for isolation from
    // real seeded/demo data), but leaderboard.service.earn() computes
    // minutesSinceWeekStart from the *real* wall clock relative to that
    // weekId's ISO week start -- against a genuinely future weekId that's a
    // deeply out-of-range (huge) value, which overflows earnScore.lua's
    // compound-score tiebreak term and corrupts the earnings decoded back
    // out of the archived score later. Faking only `Date` (not timers/IO)
    // for the duration of this one call makes "now" land a minute into
    // testWeekId's own start, so the tiebreak term stays in its valid
    // (0, 20000] range, matching how a real earn call during an actually
    // active week would behave. The already-issued normalToken (minted at
    // real, present-day time) would look expired once verified against a
    // 2099 clock, so a fresh token is minted inside the same faked window --
    // its exp lands 2h past the fake "now", and remains comfortably valid
    // once later tests revert to the real clock (real-now < fake-future-exp).
    const weekStart = getIsoWeekStart(testWeekId);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(weekStart.getTime() + 60_000));

    let res: request.Response;
    try {
      const loginRes = await request(app).post("/auth/login").send({ username: normalUser.username });
      res = await request(app)
        .post("/earnings/earn")
        .set("Authorization", `Bearer ${loginRes.body.token}`)
        .send({ amountInCents: 5000 });
    } finally {
      vi.useRealTimers();
    }

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ weekId: testWeekId, newEarnings: 5000 });
  });

  it("shows the earning on GET /leaderboard/top and GET /leaderboard/me", async () => {
    const top = await request(app).get("/leaderboard/top");
    expect(top.status).toBe(200);
    expect(top.body.entries[0]).toMatchObject({
      rank: 1,
      userId: normalUser.id,
      earningsInCents: 5000,
    });

    const me = await request(app).get("/leaderboard/me").set("Authorization", `Bearer ${normalToken}`);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ inTop100: true, myRank: 1, myEarningsInCents: 5000 });
  });

  it("GET /weeks/current reflects the active testWeekId and an estimated pool", async () => {
    const res = await request(app).get("/weeks/current");
    expect(res.status).toBe(200);
    expect(res.body.weekId).toBe(testWeekId);
    expect(res.body.estimatedPrizePoolInCents).toBe(calculatePrizePool(5000));
  });

  it("GET /weeks/:weekId/results returns status in_progress for the still-active week", async () => {
    const res = await request(app).get(`/weeks/${testWeekId}/results`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("in_progress");
    expect(res.body.entries[0]).toMatchObject({ rank: 1, userId: normalUser.id, earningsInCents: 5000 });
  });

  it("force-resets testWeekId as admin", async () => {
    const forbidden = await request(app)
      .post(`/admin/weeks/${testWeekId}/force-reset`)
      .set("Authorization", `Bearer ${normalToken}`);
    expect(forbidden.status).toBe(403);

    const res = await request(app)
      .post(`/admin/weeks/${testWeekId}/force-reset`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("COMPLETED");
    expect(res.body.weekId).toBe(testWeekId);
    nextWeekId = res.body.nextWeekId;
    expect(typeof nextWeekId).toBe("string");
  });

  it("GET /weeks/:weekId/results now returns status finalized for testWeekId, sourced from Postgres", async () => {
    const res = await request(app).get(`/weeks/${testWeekId}/results`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("finalized");
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0]).toMatchObject({
      rank: 1,
      userId: normalUser.id,
      username: normalUser.username,
      earningsInCents: 5000,
    });
  });

  it("GET /weeks/:weekId/prizes returns the finalized prize for testWeekId (whole pool, single player)", async () => {
    const res = await request(app).get(`/weeks/${testWeekId}/prizes`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("finalized");
    expect(res.body.prizes).toHaveLength(1);
    expect(res.body.prizes[0]).toMatchObject({
      rank: 1,
      userId: normalUser.id,
      prizeAmountInCents: calculatePrizePool(5000),
    });
  });

  it("GET /weeks/:nextWeekId/results and /prizes are in_progress and empty for the newly active week", async () => {
    const results = await request(app).get(`/weeks/${nextWeekId}/results`);
    expect(results.status).toBe(200);
    expect(results.body).toMatchObject({ weekId: nextWeekId, status: "in_progress", entries: [] });

    const prizes = await request(app).get(`/weeks/${nextWeekId}/prizes`);
    expect(prizes.status).toBe(200);
    expect(prizes.body).toMatchObject({ weekId: nextWeekId, status: "in_progress", prizes: [] });
  });

  it("GET /users/me/history includes the finalized testWeekId result", async () => {
    const res = await request(app).get("/users/me/history").set("Authorization", `Bearer ${normalToken}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(normalUser.id);
    expect(res.body.history).toContainEqual({
      weekId: testWeekId,
      rank: 1,
      earningsInCents: 5000,
    });
  });
});

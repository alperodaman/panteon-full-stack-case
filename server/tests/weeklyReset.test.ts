import { randomUUID } from "crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import "../src/config/luaScripts";
import { redis } from "../src/config/redis";
import { prisma } from "../src/config/postgres";
import { connectMongo, mongoose } from "../src/config/mongo";
import { WeeklySnapshot } from "../src/db/mongo/models/weeklySnapshot.model";
import { resetWeek } from "../src/jobs/weeklyReset.job";
import {
  calculatePrizeDistribution,
  calculatePrizePool,
  RankedPlayer,
} from "../src/modules/prizes/prizes.util";

const weekId = "test-reset-2026-W31";
const nextWeekId = "test-reset-2026-W32";
const leaderboardKey = `leaderboard:week:${weekId}`;
const archiveKey = `leaderboard:archive:${weekId}`;
const earningsKey = `earnings:week:${weekId}`;

const createdUserIds: string[] = [];

async function seedUser(label: string) {
  const suffix = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: { username: `${label}-${suffix}`, email: `${label}-${suffix}@example.com` },
  });
  createdUserIds.push(user.id);
  return user;
}

beforeAll(async () => {
  await connectMongo();
});

afterEach(async () => {
  await redis.del(leaderboardKey, archiveKey, earningsKey, "config:currentWeekId");
});

afterAll(async () => {
  await prisma.prizeDistribution.deleteMany({ where: { weekId } });
  await prisma.weeklyResult.deleteMany({ where: { weekId } });
  await prisma.weeklyResetJob.deleteMany({ where: { weekId } });
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await WeeklySnapshot.deleteMany({ weekId });
  await prisma.$disconnect();
  await redis.quit();
  await mongoose.connection.close();
});

describe("resetWeek", () => {
  it("cuts over, distributes normalized prizes, writes Postgres, and is idempotent on a second call", async () => {
    const users: Awaited<ReturnType<typeof seedUser>>[] = [];
    for (let i = 0; i < 5; i++) {
      users.push(await seedUser(`reset-${i}`));
    }
    // Descending, distinct earnings -- fixed minutesSinceWeekStart (60) so
    // every score's tiebreak term is comfortably inside its normal range,
    // ranking purely by earnings.
    const earnings = [50_000, 40_000, 30_000, 20_000, 10_000];
    for (let i = 0; i < users.length; i++) {
      await redis.earnScore(earningsKey, users[i]!.id, earnings[i]!, 60, weekId);
    }

    await resetWeek(weekId, nextWeekId);

    // Cutover happened: old key gone, archive present, active week advanced.
    expect(await redis.exists(leaderboardKey)).toBe(0);
    expect(await redis.exists(archiveKey)).toBe(1);
    expect(await redis.get("config:currentWeekId")).toBe(nextWeekId);

    const job = await prisma.weeklyResetJob.findUnique({ where: { weekId } });
    expect(job?.status).toBe("COMPLETED");

    const results = await prisma.weeklyResult.findMany({ where: { weekId }, orderBy: { rank: "asc" } });
    expect(results).toHaveLength(5);
    results.forEach((row, i) => {
      expect(row.userId).toBe(users[i]!.id);
      expect(row.rank).toBe(i + 1);
      expect(row.earningsInCents).toBe(earnings[i]);
    });

    // Cross-check against the same normalized formula from step 5
    // (prizes.util.ts) rather than hand-computed numbers, so this test
    // actually proves resetWeek's plumbing is consistent with it.
    const totalEarnings = earnings.reduce((sum, value) => sum + value, 0);
    const expectedPool = calculatePrizePool(totalEarnings);
    const rankedPlayers: RankedPlayer[] = users.map((user, i) => ({ userId: user.id, rank: i + 1 }));
    const expectedAwards = calculatePrizeDistribution(expectedPool, rankedPlayers);

    const prizeRows = await prisma.prizeDistribution.findMany({
      where: { weekId },
      orderBy: { rank: "asc" },
    });
    expect(prizeRows).toHaveLength(5);
    prizeRows.forEach((row, i) => {
      expect(row.userId).toBe(expectedAwards[i]!.userId);
      expect(row.prizeAmountInCents).toBe(expectedAwards[i]!.prizeAmountInCents);
      expect(row.poolTotalInCents).toBe(expectedPool);
    });

    const snapshot = await WeeklySnapshot.findOne({ weekId });
    expect(snapshot?.entries).toHaveLength(5);
    expect(snapshot?.entries[0]).toMatchObject({
      rank: 1,
      userId: users[0]!.id,
      username: users[0]!.username,
      earningsInCents: earnings[0],
    });

    // Idempotency: calling again for the same weekId must be a no-op --
    // COMPLETED short-circuits before touching Redis/Postgres/Mongo again.
    await resetWeek(weekId, nextWeekId);

    const resultsAfterRerun = await prisma.weeklyResult.findMany({ where: { weekId } });
    expect(resultsAfterRerun).toHaveLength(5);
    const prizeRowsAfterRerun = await prisma.prizeDistribution.findMany({ where: { weekId } });
    expect(prizeRowsAfterRerun).toHaveLength(5);
  });

  it("no-ops on a week that never had an earn call, without erroring", async () => {
    const emptyWeekId = "test-reset-empty-2026-W41";
    const emptyNextWeekId = "test-reset-empty-2026-W42";

    await resetWeek(emptyWeekId, emptyNextWeekId);

    const results = await prisma.weeklyResult.findMany({ where: { weekId: emptyWeekId } });
    expect(results).toHaveLength(0);
    const job = await prisma.weeklyResetJob.findUnique({ where: { weekId: emptyWeekId } });
    expect(job?.status).toBe("COMPLETED");

    await prisma.weeklyResetJob.deleteMany({ where: { weekId: emptyWeekId } });
    await redis.del("config:currentWeekId");
  });
});

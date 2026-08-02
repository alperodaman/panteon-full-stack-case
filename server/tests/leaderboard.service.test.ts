import { randomUUID } from "crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import "../src/config/luaScripts";
import { redis } from "../src/config/redis";
import { prisma } from "../src/config/postgres";
import * as leaderboardService from "../src/modules/leaderboard/leaderboard.service";

const weekId = "test-service-2026-W31";
const leaderboardKey = `leaderboard:week:${weekId}`;
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

afterEach(async () => {
  await redis.del(leaderboardKey, earningsKey);
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
  await redis.quit();
});

describe("leaderboard.service", () => {
  it("matches the top100 response shape for a user inside the top 100", async () => {
    const user = await seedUser("svc-top");
    await redis.zadd(leaderboardKey, 1000, user.id);
    await redis.hset(earningsKey, user.id, 50000);

    const result = await leaderboardService.getMyPosition(user.id, weekId);

    expect(result).toEqual({
      weekId,
      inTop100: true,
      myRank: 1,
      myEarningsInCents: 50000,
      entries: [
        {
          rank: 1,
          userId: user.id,
          username: user.username,
          earningsInCents: 50000,
          isCurrentUser: true,
        },
      ],
    });
  });

  it("matches the +-3/+-2 window shape for a user outside the top 100, with isCurrentUser only on their own row", async () => {
    // 103 anonymous filler members occupy 0-indexed ranks 0..102 (i.e. the
    // top 100 plus a couple more) so the 6 real users below land outside
    // the top 100, at 0-indexed ranks 103..108.
    const fillerMembers: (string | number)[] = [];
    for (let i = 0; i < 103; i++) {
      fillerMembers.push(1000 - i, `filler-${i}`);
    }

    const windowUsers = [];
    for (let i = 0; i < 6; i++) {
      windowUsers.push(await seedUser(`svc-window-${i}`));
    }
    const windowMembers: (string | number)[] = [];
    windowUsers.forEach((user, i) => {
      const rank = 103 + i;
      windowMembers.push(1000 - rank, user.id);
    });

    await redis.zadd(leaderboardKey, ...fillerMembers, ...windowMembers);

    const hsetArgs: (string | number)[] = [];
    windowUsers.forEach((user, i) => {
      const rank = 103 + i;
      hsetArgs.push(user.id, (1000 - rank) * 10);
    });
    await redis.hset(earningsKey, ...hsetArgs);

    // Target is the middle of the 6 window users: 0-indexed rank 106.
    const target = windowUsers[3];

    const result = await leaderboardService.getMyPosition(target.id, weekId);

    expect(result.weekId).toBe(weekId);
    expect(result.inTop100).toBe(false);
    expect(result.myRank).toBe(107);
    expect(result.myEarningsInCents).toBe((1000 - 106) * 10);

    expect(result.entries).toEqual(
      windowUsers.map((user, i) => ({
        rank: 104 + i,
        userId: user.id,
        username: user.username,
        earningsInCents: (1000 - (103 + i)) * 10,
        isCurrentUser: user.id === target.id,
      })),
    );

    const currentUserFlags = result.entries.map((entry) => entry.isCurrentUser);
    expect(currentUserFlags).toEqual([false, false, false, true, false, false]);
  });

  it("matches the no-record response shape for a user who has never earned", async () => {
    const user = await seedUser("svc-no-record");

    const result = await leaderboardService.getMyPosition(user.id, weekId);

    expect(result).toEqual({
      weekId,
      inTop100: false,
      myRank: null,
      myEarningsInCents: 0,
      entries: [],
    });
  });
});

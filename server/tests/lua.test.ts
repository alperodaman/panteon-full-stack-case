import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import "../src/config/luaScripts";
import { redis } from "../src/config/redis";

const cleanupKeys: string[] = [];

async function cleanup() {
  if (cleanupKeys.length > 0) {
    await redis.del(...cleanupKeys);
    cleanupKeys.length = 0;
  }
}

afterEach(cleanup);

afterAll(async () => {
  await redis.quit();
});

describe("earnScore.lua", () => {
  it("atomically accumulates earnings and writes a compound score", async () => {
    const weekId = "test-earn-2026-W31";
    const earningsKey = `earnings:week:${weekId}`;
    const leaderboardKey = `leaderboard:week:${weekId}`;
    cleanupKeys.push(earningsKey, leaderboardKey);
    const userId = "user-earn-1";

    const [total1, score1] = await redis.earnScore(earningsKey, userId, 500, 100, weekId);
    expect(total1).toBe(500);
    expect(score1).toBe(500 * 20000 + (20000 - 100));

    const [total2, score2] = await redis.earnScore(earningsKey, userId, 250, 150, weekId);
    expect(total2).toBe(750);
    expect(score2).toBe(750 * 20000 + (20000 - 150));

    const storedEarnings = await redis.hget(earningsKey, userId);
    expect(Number(storedEarnings)).toBe(750);

    const storedScore = await redis.zscore(leaderboardKey, userId);
    expect(Number(storedScore)).toBe(score2);
  });

  it("keeps independent totals per user on the same leaderboard", async () => {
    const weekId = "test-earn-2026-W32";
    const earningsKey = `earnings:week:${weekId}`;
    const leaderboardKey = `leaderboard:week:${weekId}`;
    cleanupKeys.push(earningsKey, leaderboardKey);

    await redis.earnScore(earningsKey, "user-a", 1000, 10, weekId);
    await redis.earnScore(earningsKey, "user-b", 1000, 20, weekId);

    // Same earnings, earlier minutesSinceWeekStart wins the tiebreak.
    const rank = await redis.zrevrank(leaderboardKey, "user-a");
    expect(rank).toBe(0);
  });
});

describe("rankWindow.lua", () => {
  const weekId = "test-rank-2026-W31";
  const leaderboardKey = `leaderboard:week:${weekId}`;
  const userIds = Array.from({ length: 10 }, (_, i) => `user-rank-${i}`);

  beforeAll(async () => {
    // Highest score = user-rank-0 ... lowest = user-rank-9
    const members: (string | number)[] = [];
    userIds.forEach((id, i) => {
      members.push(1000 - i, id);
    });
    await redis.zadd(leaderboardKey, ...members);
  });

  afterAll(async () => {
    await redis.del(leaderboardKey);
  });

  it("returns null for a user not on the leaderboard", async () => {
    const result = await redis.rankWindow(leaderboardKey, "user-does-not-exist");
    expect(result).toBeNull();
  });

  it("returns 3 above and 2 below for a user in the middle", async () => {
    const result = await redis.rankWindow(leaderboardKey, "user-rank-5");
    expect(result).not.toBeNull();
    const [selfRank, startRank, entries] = result!;
    expect(selfRank).toBe(5);
    expect(startRank).toBe(2);

    const ids = entries.filter((_, i) => i % 2 === 0);
    expect(ids).toEqual([
      "user-rank-2",
      "user-rank-3",
      "user-rank-4",
      "user-rank-5",
      "user-rank-6",
      "user-rank-7",
    ]);
  });

  it("clamps the top of the window when the user is in the first 3 ranks", async () => {
    const result = await redis.rankWindow(leaderboardKey, "user-rank-1");
    expect(result).not.toBeNull();
    const [selfRank, startRank, entries] = result!;
    expect(selfRank).toBe(1);
    expect(startRank).toBe(0);

    const ids = entries.filter((_, i) => i % 2 === 0);
    expect(ids).toEqual(["user-rank-0", "user-rank-1", "user-rank-2", "user-rank-3"]);
  });

  it("clamps the bottom of the window for the last user", async () => {
    const result = await redis.rankWindow(leaderboardKey, "user-rank-9");
    expect(result).not.toBeNull();
    const [selfRank, startRank, entries] = result!;
    expect(selfRank).toBe(9);
    expect(startRank).toBe(6);

    const ids = entries.filter((_, i) => i % 2 === 0);
    expect(ids).toEqual(["user-rank-6", "user-rank-7", "user-rank-8", "user-rank-9"]);
  });
});

describe("weekCutover.lua", () => {
  it("archives the leaderboard, wipes earnings, and advances the current week", async () => {
    const oldWeekId = "test-cutover-2026-W31";
    const newWeekId = "test-cutover-2026-W32";
    const oldLeaderboardKey = `leaderboard:week:${oldWeekId}`;
    const archiveKey = `leaderboard:archive:${oldWeekId}`;
    const oldEarningsKey = `earnings:week:${oldWeekId}`;
    cleanupKeys.push(oldLeaderboardKey, archiveKey, oldEarningsKey, "config:currentWeekId");

    await redis.zadd(oldLeaderboardKey, 100, "user-1", 200, "user-2");
    await redis.hset(oldEarningsKey, "user-1", 5, "user-2", 10);

    await redis.weekCutover(oldWeekId, newWeekId);

    expect(await redis.exists(oldLeaderboardKey)).toBe(0);
    expect(await redis.exists(archiveKey)).toBe(1);
    expect(await redis.zscore(archiveKey, "user-2")).toBe("200");

    const ttl = await redis.ttl(archiveKey);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(2592000);

    // redis-cli manual check: EXISTS earnings:week:test-cutover-2026-W31  => (integer) 0
    expect(await redis.exists(oldEarningsKey)).toBe(0);

    expect(await redis.get("config:currentWeekId")).toBe(newWeekId);
  });

  it("is idempotent when called twice with the same arguments", async () => {
    const oldWeekId = "test-cutover-2026-W41";
    const newWeekId = "test-cutover-2026-W42";
    const oldLeaderboardKey = `leaderboard:week:${oldWeekId}`;
    const archiveKey = `leaderboard:archive:${oldWeekId}`;
    const oldEarningsKey = `earnings:week:${oldWeekId}`;
    cleanupKeys.push(oldLeaderboardKey, archiveKey, oldEarningsKey, "config:currentWeekId");

    await redis.zadd(oldLeaderboardKey, 100, "user-1");
    await redis.hset(oldEarningsKey, "user-1", 5);

    await redis.weekCutover(oldWeekId, newWeekId);
    await expect(redis.weekCutover(oldWeekId, newWeekId)).resolves.toBe("OK");

    expect(await redis.exists(oldLeaderboardKey)).toBe(0);
    expect(await redis.exists(archiveKey)).toBe(1);
    expect(await redis.exists(oldEarningsKey)).toBe(0);
    expect(await redis.get("config:currentWeekId")).toBe(newWeekId);
  });

  it("no-ops the rename when the outgoing week never had an earn call", async () => {
    const oldWeekId = "test-cutover-2026-W51";
    const newWeekId = "test-cutover-2026-W52";
    const oldLeaderboardKey = `leaderboard:week:${oldWeekId}`;
    const archiveKey = `leaderboard:archive:${oldWeekId}`;
    const oldEarningsKey = `earnings:week:${oldWeekId}`;
    cleanupKeys.push(oldLeaderboardKey, archiveKey, oldEarningsKey, "config:currentWeekId");

    await expect(redis.weekCutover(oldWeekId, newWeekId)).resolves.toBe("OK");

    expect(await redis.exists(oldLeaderboardKey)).toBe(0);
    expect(await redis.exists(archiveKey)).toBe(0);
    expect(await redis.get("config:currentWeekId")).toBe(newWeekId);
  });
});

/*
Manual redis-cli verification (against docker compose's redis service):

  redis-cli EVALSHA ... # not needed, ioredis loads scripts via SCRIPT LOAD

  # After running the weekCutover test above (or any real cutover):
  redis-cli EXISTS earnings:week:test-cutover-2026-W31
  # -> (integer) 0

  redis-cli EXISTS leaderboard:archive:test-cutover-2026-W31
  # -> (integer) 1

  redis-cli TTL leaderboard:archive:test-cutover-2026-W31
  # -> (integer) <= 2592000

  redis-cli GET config:currentWeekId
  # -> "test-cutover-2026-W32"
*/

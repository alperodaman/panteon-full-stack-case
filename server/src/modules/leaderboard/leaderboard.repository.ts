import { redis } from "../../config/redis";

// Thin Redis-only layer for the leaderboard domain: no business logic, no
// Postgres/Mongo access, no week-id resolution. Callers pass an explicit
// weekId; the service layer decides which week that is.

export interface TopEntry {
  userId: string;
  rank: number;
}

export interface RankWindow {
  selfRank: number;
  startRank: number;
  userIds: string[];
}

function leaderboardKey(weekId: string): string {
  return `leaderboard:week:${weekId}`;
}

function earningsKey(weekId: string): string {
  return `earnings:week:${weekId}`;
}

export async function getCurrentWeekId(): Promise<string | null> {
  return redis.get("config:currentWeekId");
}

export async function getTop100(weekId: string): Promise<TopEntry[]> {
  const userIds = await redis.zrevrange(leaderboardKey(weekId), 0, 99);
  return userIds.map((userId, index) => ({ userId, rank: index + 1 }));
}

export async function getRankWindow(userId: string, weekId: string): Promise<RankWindow | null> {
  const result = await redis.rankWindow(leaderboardKey(weekId), userId);
  if (!result) {
    return null;
  }

  const [selfRank, startRank, flatEntries] = result;
  const userIds = flatEntries.filter((_, index) => index % 2 === 0);

  return { selfRank, startRank, userIds };
}

export async function getUserEarnings(userId: string, weekId: string): Promise<number> {
  const value = await redis.hget(earningsKey(weekId), userId);
  return value ? Number(value) : 0;
}

export async function getUsersEarnings(
  userIds: string[],
  weekId: string,
): Promise<Record<string, number>> {
  if (userIds.length === 0) {
    return {};
  }

  const values = await redis.hmget(earningsKey(weekId), ...userIds);
  const result: Record<string, number> = {};
  userIds.forEach((userId, index) => {
    result[userId] = values[index] ? Number(values[index]) : 0;
  });
  return result;
}

// Cursor-batched HSCAN rather than HGETALL: at 2M active users this hash can
// be large, and a single unbounded command shouldn't block Redis. Used by
// weeks.service.ts to estimate the active week's prize pool (2% of total
// earnings so far) -- unlike weeklyReset.job.ts's sumArchivedEarnings, this
// reads the raw earnings hash directly (still populated pre-cutover) rather
// than decoding the ZSET's compound score.
export async function getTotalEarnings(weekId: string): Promise<number> {
  const key = earningsKey(weekId);
  let cursor = "0";
  let total = 0;

  do {
    const [nextCursor, elements] = await redis.hscan(key, cursor, "COUNT", "1000");
    cursor = nextCursor;
    for (let i = 1; i < elements.length; i += 2) {
      total += Number(elements[i]);
    }
  } while (cursor !== "0");

  return total;
}

export async function recordEarning(
  userId: string,
  amountInCents: number,
  weekId: string,
  minutesSinceWeekStart: number,
): Promise<{ newEarnings: number; score: number }> {
  const [newEarnings, score] = await redis.earnScore(
    earningsKey(weekId),
    userId,
    amountInCents,
    minutesSinceWeekStart,
    weekId,
  );
  return { newEarnings, score };
}

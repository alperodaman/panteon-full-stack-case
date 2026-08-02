import { prisma } from "../config/postgres";
import { redis } from "../config/redis";
import { logger } from "../logger";
import { WeeklySnapshot } from "../db/mongo/models/weeklySnapshot.model";
import * as resetJobRepository from "../modules/weeks/weeklyResetJob.repository";
import { getIsoWeekId } from "../modules/leaderboard/week.util";
import {
  calculatePrizeDistribution,
  calculatePrizePool,
  PrizeAward,
  RankedPlayer,
} from "../modules/prizes/prizes.util";

// Matches earnScore.lua's compound score formula:
//   score = earningsInCents * COMPOUND_SCORE_MULTIPLIER + (COMPOUND_SCORE_MULTIPLIER - minutesSinceWeekStart)
const COMPOUND_SCORE_MULTIPLIER = 20000;

export interface ArchivedPlayer {
  userId: string;
  rank: number;
  earningsInCents: number;
}

function archiveLeaderboardKey(weekId: string): string {
  return `leaderboard:archive:${weekId}`;
}

// earnScore.lua's tiebreak term (COMPOUND_SCORE_MULTIPLIER - minutesSinceWeekStart)
// is always in (0, COMPOUND_SCORE_MULTIPLIER] -- it can equal
// COMPOUND_SCORE_MULTIPLIER exactly (an earn at minute 0 of the week), which
// would make a plain `Math.floor(score / COMPOUND_SCORE_MULTIPLIER)` overcount
// earnings by one in that case. Subtracting 1 before flooring corrects for
// that edge without affecting any other tiebreak value.
function decodeEarningsFromScore(score: number): number {
  return Math.floor((score - 1) / COMPOUND_SCORE_MULTIPLIER);
}

// The leaderboard's raw-earnings hash (earnings:week:{weekId}) is deleted by
// weekCutover.lua as part of cutover -- by the time this runs, earnings can
// only be recovered by decoding the archived ZSET's compound score. Only the
// top 100 are read here: WeeklyResult/PrizeDistribution (and therefore this
// module) only ever concern the ranks that are actually eligible for a
// result row or a prize, matching the leaderboard module's existing "cutover
// only ever writes the top 100 into Postgres" design.
export async function readArchiveLeaderboard(weekId: string): Promise<ArchivedPlayer[]> {
  const raw = await redis.zrevrange(archiveLeaderboardKey(weekId), 0, 99, "WITHSCORES");

  const players: ArchivedPlayer[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const userId = raw[i]!;
    const score = Number(raw[i + 1]);
    players.push({
      userId,
      rank: players.length + 1,
      earningsInCents: decodeEarningsFromScore(score),
    });
  }
  return players;
}

// The prize pool is 2% of *total* weekly earnings, not just the top 100's --
// so this scans the full archived ZSET (ZSCAN, cursor-batched rather than a
// single ZRANGE 0 -1, since at 2M active users this key can be large and a
// weekly batch job still shouldn't block Redis with one huge command).
async function sumArchivedEarnings(weekId: string): Promise<number> {
  const key = archiveLeaderboardKey(weekId);
  let cursor = "0";
  let total = 0;

  do {
    const [nextCursor, elements] = await redis.zscan(key, cursor, "COUNT", "1000");
    cursor = nextCursor;
    for (let i = 1; i < elements.length; i += 2) {
      total += decodeEarningsFromScore(Number(elements[i]));
    }
  } while (cursor !== "0");

  return total;
}

async function fetchUsernamesById(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map();
  }
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true },
  });
  return new Map(users.map((user) => [user.id, user.username]));
}

async function writePostgresTransaction(
  weekId: string,
  archiveData: ArchivedPlayer[],
  prizes: PrizeAward[],
  poolTotalInCents: number,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Delete-then-recreate (rather than assuming a fresh weekId) keeps this
    // safe to retry after a partial failure -- e.g. cutover + Postgres write
    // succeeded but the process crashed before the job was marked COMPLETED.
    await tx.prizeDistribution.deleteMany({ where: { weekId } });
    await tx.weeklyResult.deleteMany({ where: { weekId } });

    if (archiveData.length > 0) {
      await tx.weeklyResult.createMany({
        data: archiveData.map((player) => ({
          weekId,
          userId: player.userId,
          rank: player.rank,
          earningsInCents: player.earningsInCents,
        })),
      });
    }

    if (prizes.length > 0) {
      await tx.prizeDistribution.createMany({
        data: prizes.map((award) => ({
          weekId,
          userId: award.userId,
          rank: award.rank,
          prizeAmountInCents: award.prizeAmountInCents,
          poolTotalInCents,
        })),
      });
    }
  });
}

async function writeMongoSnapshot(weekId: string, archiveData: ArchivedPlayer[]): Promise<void> {
  // Best-effort and non-fatal: WeeklySnapshot only backs the history UI's
  // point-in-time top-N listing. The money-relevant writes (WeeklyResult,
  // PrizeDistribution) already landed in Postgres inside
  // writePostgresTransaction above, so a Mongo outage here must not fail the
  // whole reset or leave the job stuck retrying a payout that already
  // happened -- it's logged and swallowed instead.
  try {
    const usernamesById = await fetchUsernamesById(archiveData.map((player) => player.userId));
    await WeeklySnapshot.findOneAndUpdate(
      { weekId },
      {
        weekId,
        entries: archiveData.map((player) => ({
          rank: player.rank,
          userId: player.userId,
          username: usernamesById.get(player.userId) ?? "unknown",
          earningsInCents: player.earningsInCents,
        })),
      },
      { upsert: true },
    );
  } catch (err) {
    logger.error({ err, weekId }, "Mongo weekly snapshot write failed (best-effort, non-fatal)");
  }
}

// Given `now` (the Monday 00:00 UTC cron boundary), resolves the outgoing
// week (the one being cut over) and the incoming one. `now` sits exactly at
// the new week's first instant, so getIsoWeekId(now) already returns the new
// week; stepping one minute back lands safely inside the outgoing week
// regardless of DST-less UTC edge cases.
export function resolveResetWeekIds(now: Date = new Date()): { weekId: string; nextWeekId: string } {
  const nextWeekId = getIsoWeekId(now);
  const weekId = getIsoWeekId(new Date(now.getTime() - 60_000));
  return { weekId, nextWeekId };
}

export async function resetWeek(weekId: string, nextWeekId: string): Promise<void> {
  const job = await resetJobRepository.getOrCreateResetJob(weekId);

  if (job.status === "COMPLETED") {
    return;
  }

  try {
    // weekCutover.lua is idempotent (verified in tests/lua.test.ts), so it's
    // safe to re-run on a FAILED retry even if we can't tell whether the
    // previous attempt's cutover actually succeeded before it failed.
    // DISTRIBUTING means cutover already completed on a prior attempt --
    // only the write step needs retrying, so it's skipped then.
    if (job.status !== "DISTRIBUTING") {
      await redis.weekCutover(weekId, nextWeekId);
      await resetJobRepository.updateJobStatus(weekId, "DISTRIBUTING");
    }

    const archiveData = await readArchiveLeaderboard(weekId);
    const totalEarningsInCents = await sumArchivedEarnings(weekId);
    const pool = calculatePrizePool(totalEarningsInCents);

    const rankedPlayers: RankedPlayer[] = archiveData.map((player) => ({
      userId: player.userId,
      rank: player.rank,
    }));
    const prizes = calculatePrizeDistribution(pool, rankedPlayers);

    await writePostgresTransaction(weekId, archiveData, prizes, pool);
    await writeMongoSnapshot(weekId, archiveData);

    await resetJobRepository.updateJobStatus(weekId, "COMPLETED");
  } catch (err) {
    await resetJobRepository.updateJobStatus(weekId, "FAILED");
    throw err;
  }
}

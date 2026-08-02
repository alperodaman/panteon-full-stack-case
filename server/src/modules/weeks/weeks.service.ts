import { prisma } from "../../config/postgres";
import * as leaderboardRepository from "../leaderboard/leaderboard.repository";
import * as leaderboardService from "../leaderboard/leaderboard.service";
import { getIsoWeekId, getIsoWeekStart } from "../leaderboard/week.util";
import { calculatePrizePool } from "../prizes/prizes.util";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// config:currentWeekId is only set once weekCutover.lua has run at least
// once (same fallback used by leaderboard.service.ts's resolveWeekId).
async function resolveActiveWeekId(): Promise<string> {
  const currentWeekId = await leaderboardRepository.getCurrentWeekId();
  return currentWeekId ?? getIsoWeekId(new Date());
}

export interface CurrentWeekResponse {
  weekId: string;
  weekStart: string;
  weekEnd: string;
  estimatedPrizePoolInCents: number;
}

export async function getCurrentWeek(): Promise<CurrentWeekResponse> {
  const weekId = await resolveActiveWeekId();
  const weekStart = getIsoWeekStart(weekId);
  const weekEnd = new Date(weekStart.getTime() + WEEK_MS);
  const totalEarningsInCents = await leaderboardRepository.getTotalEarnings(weekId);

  return {
    weekId,
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    // "Estimated" because the active week's earnings still change until
    // cutover -- the real, final pool is only known once resetWeek() runs
    // and writes PrizeDistribution.poolTotalInCents.
    estimatedPrizePoolInCents: calculatePrizePool(totalEarningsInCents),
  };
}

export type WeekResultStatus = "in_progress" | "finalized";

export interface WeekResultEntry {
  rank: number;
  userId: string;
  username: string;
  earningsInCents: number;
}

export interface WeekResultsResponse {
  weekId: string;
  status: WeekResultStatus;
  entries: WeekResultEntry[];
}

// DECISION (user-specified): WeeklyResult in Postgres is only ever written
// by resetWeek() at cutover, so it has no row for the week that's currently
// in progress. Branch on whether the requested weekId is the active one:
//   - active week  -> live top100 from Redis (leaderboard.service's
//     getTopLeaderboard), status "in_progress"
//   - past week    -> Postgres WeeklyResult, status "finalized"
// Both branches return the identical { weekId, status, entries } shape (the
// same entries object as GET /leaderboard/top) so callers never have to
// special-case an empty/error response for a mid-week query -- they always
// get "the best known result for that week" plus a flag for whether it's
// still moving.
export async function getWeekResults(weekId: string): Promise<WeekResultsResponse> {
  const activeWeekId = await resolveActiveWeekId();

  if (weekId === activeWeekId) {
    const top = await leaderboardService.getTopLeaderboard(weekId);
    return { weekId, status: "in_progress", entries: top.entries };
  }

  const results = await prisma.weeklyResult.findMany({
    where: { weekId },
    orderBy: { rank: "asc" },
    include: { user: { select: { username: true } } },
  });

  const entries: WeekResultEntry[] = results.map((row) => ({
    rank: row.rank,
    userId: row.userId,
    username: row.user.username,
    earningsInCents: row.earningsInCents,
  }));

  return { weekId, status: "finalized", entries };
}

export interface WeekPrizeEntry {
  rank: number;
  userId: string;
  username: string;
  prizeAmountInCents: number;
}

export interface WeekPrizesResponse {
  weekId: string;
  status: WeekResultStatus;
  poolTotalInCents: number;
  prizes: WeekPrizeEntry[];
}

// Same in_progress/finalized split as getWeekResults, for consistency:
// prizes are only ever computed and written at cutover (resetWeek), so the
// active week has none yet -- returned as an empty array rather than a 404,
// matching the "never return an empty/error response" principle.
export async function getWeekPrizes(weekId: string): Promise<WeekPrizesResponse> {
  const activeWeekId = await resolveActiveWeekId();

  if (weekId === activeWeekId) {
    return { weekId, status: "in_progress", poolTotalInCents: 0, prizes: [] };
  }

  const prizeRows = await prisma.prizeDistribution.findMany({
    where: { weekId },
    orderBy: { rank: "asc" },
    include: { user: { select: { username: true } } },
  });

  const poolTotalInCents = prizeRows[0]?.poolTotalInCents ?? 0;
  const prizes: WeekPrizeEntry[] = prizeRows.map((row) => ({
    rank: row.rank,
    userId: row.userId,
    username: row.user.username,
    prizeAmountInCents: row.prizeAmountInCents,
  }));

  return { weekId, status: "finalized", poolTotalInCents, prizes };
}

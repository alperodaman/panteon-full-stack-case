import { prisma } from "../../config/postgres";
import { EarningEvent } from "../../db/mongo/models/earningEvent.model";

export interface UserHistoryEntry {
  weekId: string;
  rank: number | null;
  earningsInCents: number;
}

export interface UserHistoryResponse {
  userId: string;
  history: UserHistoryEntry[];
}

interface EarningsByWeekRow {
  _id: string;
  totalEarningsInCents: number;
}

// Combines two sources, per the user's spec: Postgres WeeklyResult for weeks
// the user actually made the top 100 (has a rank), and a Mongo
// earning_events aggregate for weeks they earned in but never ranked (no
// WeeklyResult row exists for those -- rank is reported as null). weekId's
// "YYYY-Www" format sorts lexicographically the same as chronologically, so
// a plain string sort (descending: most recent first) produces the combined
// chronological list without needing to parse each id into a date.
export async function getUserHistory(userId: string): Promise<UserHistoryResponse> {
  const [rankedWeeks, earningsByWeek] = await Promise.all([
    prisma.weeklyResult.findMany({
      where: { userId },
      select: { weekId: true, rank: true, earningsInCents: true },
    }),
    EarningEvent.aggregate<EarningsByWeekRow>([
      { $match: { userId } },
      { $group: { _id: "$weekId", totalEarningsInCents: { $sum: "$amountInCents" } } },
    ]),
  ]);

  const rankedWeekIds = new Set(rankedWeeks.map((row) => row.weekId));

  const history: UserHistoryEntry[] = [
    ...rankedWeeks.map((row) => ({
      weekId: row.weekId,
      rank: row.rank,
      earningsInCents: row.earningsInCents,
    })),
    ...earningsByWeek
      .filter((row) => !rankedWeekIds.has(row._id))
      .map((row) => ({
        weekId: row._id,
        rank: null,
        earningsInCents: row.totalEarningsInCents,
      })),
  ].sort((a, b) => b.weekId.localeCompare(a.weekId));

  return { userId, history };
}

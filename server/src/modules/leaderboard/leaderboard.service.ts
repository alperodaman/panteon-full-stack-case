import { prisma } from "../../config/postgres";
import { EarningEvent } from "../../db/mongo/models/earningEvent.model";
import * as leaderboardRepository from "./leaderboard.repository";
import { getIsoWeekId, getMinutesSinceWeekStart } from "./week.util";

export interface TopLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  earningsInCents: number;
}

export interface MyLeaderboardEntry extends TopLeaderboardEntry {
  isCurrentUser: boolean;
}

export interface TopLeaderboardResponse {
  weekId: string;
  entries: TopLeaderboardEntry[];
}

export interface MyPositionResponse {
  weekId: string;
  inTop100: boolean;
  myRank: number | null;
  myEarningsInCents: number;
  entries: MyLeaderboardEntry[];
}

// config:currentWeekId is only ever set by weekCutover.lua. Before the very
// first cutover ever runs, it doesn't exist yet, so fall back to computing
// the current ISO week directly.
async function resolveWeekId(weekId?: string): Promise<string> {
  if (weekId) {
    return weekId;
  }
  const currentWeekId = await leaderboardRepository.getCurrentWeekId();
  return currentWeekId ?? getIsoWeekId(new Date());
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

export async function getTopLeaderboard(weekId?: string): Promise<TopLeaderboardResponse> {
  const resolvedWeekId = await resolveWeekId(weekId);
  const top = await leaderboardRepository.getTop100(resolvedWeekId);

  if (top.length === 0) {
    return { weekId: resolvedWeekId, entries: [] };
  }

  const userIds = top.map((entry) => entry.userId);
  const [earningsByUser, usernamesById] = await Promise.all([
    leaderboardRepository.getUsersEarnings(userIds, resolvedWeekId),
    fetchUsernamesById(userIds),
  ]);

  const entries: TopLeaderboardEntry[] = top.map(({ userId, rank }) => ({
    rank,
    userId,
    username: usernamesById.get(userId) ?? "unknown",
    earningsInCents: earningsByUser[userId] ?? 0,
  }));

  return { weekId: resolvedWeekId, entries };
}

export async function getMyPosition(userId: string, weekId?: string): Promise<MyPositionResponse> {
  const resolvedWeekId = await resolveWeekId(weekId);

  const top100 = await leaderboardRepository.getTop100(resolvedWeekId);
  const topEntry = top100.find((entry) => entry.userId === userId);

  if (topEntry) {
    const [myEarnings, usernamesById] = await Promise.all([
      leaderboardRepository.getUserEarnings(userId, resolvedWeekId),
      fetchUsernamesById([userId]),
    ]);

    return {
      weekId: resolvedWeekId,
      inTop100: true,
      myRank: topEntry.rank,
      myEarningsInCents: myEarnings,
      entries: [
        {
          rank: topEntry.rank,
          userId,
          username: usernamesById.get(userId) ?? "unknown",
          earningsInCents: myEarnings,
          isCurrentUser: true,
        },
      ],
    };
  }

  const window = await leaderboardRepository.getRankWindow(userId, resolvedWeekId);
  if (!window) {
    return {
      weekId: resolvedWeekId,
      inTop100: false,
      myRank: null,
      myEarningsInCents: 0,
      entries: [],
    };
  }

  const { selfRank, startRank, userIds } = window;
  const [earningsByUser, usernamesById] = await Promise.all([
    leaderboardRepository.getUsersEarnings(userIds, resolvedWeekId),
    fetchUsernamesById(userIds),
  ]);

  const entries: MyLeaderboardEntry[] = userIds.map((id, index) => ({
    rank: startRank + index + 1,
    userId: id,
    username: usernamesById.get(id) ?? "unknown",
    earningsInCents: earningsByUser[id] ?? 0,
    isCurrentUser: id === userId,
  }));

  return {
    weekId: resolvedWeekId,
    inTop100: false,
    myRank: selfRank + 1,
    myEarningsInCents: earningsByUser[userId] ?? 0,
    entries,
  };
}

export async function earn(
  userId: string,
  amountInCents: number,
  source = "gameplay",
): Promise<{ weekId: string; newEarnings: number }> {
  const weekId = await resolveWeekId();
  const minutesSinceWeekStart = getMinutesSinceWeekStart(weekId);

  const { newEarnings } = await leaderboardRepository.recordEarning(
    userId,
    amountInCents,
    weekId,
    minutesSinceWeekStart,
  );

  await EarningEvent.create({ userId, weekId, amountInCents, source });

  return { weekId, newEarnings };
}

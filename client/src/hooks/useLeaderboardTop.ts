import { useQuery } from '@tanstack/react-query'
import { getTopLeaderboard } from '../api/leaderboard.api'

const REFETCH_INTERVAL_MS = 5_000

export function useLeaderboardTop(weekId?: string) {
  return useQuery({
    queryKey: ['leaderboard', 'top', weekId ?? 'current'],
    queryFn: () => getTopLeaderboard(weekId),
    refetchInterval: REFETCH_INTERVAL_MS,
  })
}

import { useQuery } from '@tanstack/react-query'
import { getMyPosition } from '../api/leaderboard.api'
import { useAuth } from '../context/AuthContext'

const REFETCH_INTERVAL_MS = 5_000

export function useMyRank(weekId?: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['leaderboard', 'me', weekId ?? 'current', user?.userId],
    queryFn: () => getMyPosition(weekId),
    enabled: Boolean(user),
    refetchInterval: REFETCH_INTERVAL_MS,
  })
}

import { useQuery } from '@tanstack/react-query'
import { getCurrentWeek } from '../api/weeks.api'

export function useCurrentWeek() {
  return useQuery({
    queryKey: ['weeks', 'current'],
    queryFn: getCurrentWeek,
    refetchInterval: 30_000,
  })
}

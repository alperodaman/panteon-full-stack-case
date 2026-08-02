import { useQuery } from '@tanstack/react-query'
import { getMyHistory } from '../api/history.api'
import { useAuth } from '../context/AuthContext'

export function useWeeklyHistory() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['history', 'me', user?.userId],
    queryFn: getMyHistory,
    enabled: Boolean(user),
  })
}

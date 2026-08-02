import { apiClient } from './client'
import type { UserHistoryResponse } from '../types/api'

export function getMyHistory(): Promise<UserHistoryResponse> {
  return apiClient.get('users/me/history').json<UserHistoryResponse>()
}

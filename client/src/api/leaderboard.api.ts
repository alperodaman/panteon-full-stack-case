import { apiClient } from './client'
import type { EarnResponse, MyPositionResponse, TopLeaderboardResponse } from '../types/api'

export function getTopLeaderboard(weekId?: string): Promise<TopLeaderboardResponse> {
  return apiClient
    .get('leaderboard/top', { searchParams: weekId ? { weekId } : undefined })
    .json<TopLeaderboardResponse>()
}

export function getMyPosition(weekId?: string): Promise<MyPositionResponse> {
  return apiClient
    .get('leaderboard/me', { searchParams: weekId ? { weekId } : undefined })
    .json<MyPositionResponse>()
}

export function earn(amountInCents: number): Promise<EarnResponse> {
  return apiClient.post('earnings/earn', { json: { amountInCents } }).json<EarnResponse>()
}

import { apiClient } from './client'
import type {
  CurrentWeekResponse,
  ForceResetResponse,
  WeekPrizesResponse,
  WeekResultsResponse,
} from '../types/api'

export function getCurrentWeek(): Promise<CurrentWeekResponse> {
  return apiClient.get('weeks/current').json<CurrentWeekResponse>()
}

export function getWeekResults(weekId: string): Promise<WeekResultsResponse> {
  return apiClient.get(`weeks/${weekId}/results`).json<WeekResultsResponse>()
}

export function getWeekPrizes(weekId: string): Promise<WeekPrizesResponse> {
  return apiClient.get(`weeks/${weekId}/prizes`).json<WeekPrizesResponse>()
}

export function forceResetWeek(weekId: string): Promise<ForceResetResponse> {
  return apiClient.post(`admin/weeks/${weekId}/force-reset`).json<ForceResetResponse>()
}

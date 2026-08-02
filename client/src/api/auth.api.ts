import { apiClient } from './client'
import type { LoginResult } from '../types/api'

export function login(username: string): Promise<LoginResult> {
  return apiClient.post('auth/login', { json: { username } }).json<LoginResult>()
}

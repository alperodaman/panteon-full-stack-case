export type Role = 'USER' | 'ADMIN'

export interface LoginResult {
  token: string
  userId: string
  username: string
  role: Role
}

export interface TopLeaderboardEntry {
  rank: number
  userId: string
  username: string
  earningsInCents: number
}

export interface TopLeaderboardResponse {
  weekId: string
  entries: TopLeaderboardEntry[]
}

export interface MyLeaderboardEntry extends TopLeaderboardEntry {
  isCurrentUser: boolean
}

export interface MyPositionResponse {
  weekId: string
  inTop100: boolean
  myRank: number | null
  myEarningsInCents: number
  entries: MyLeaderboardEntry[]
}

export interface EarnResponse {
  weekId: string
  newEarnings: number
}

export interface CurrentWeekResponse {
  weekId: string
  weekStart: string
  weekEnd: string
  estimatedPrizePoolInCents: number
}

export type WeekResultStatus = 'in_progress' | 'finalized'

export interface WeekResultEntry {
  rank: number
  userId: string
  username: string
  earningsInCents: number
}

export interface WeekResultsResponse {
  weekId: string
  status: WeekResultStatus
  entries: WeekResultEntry[]
}

export interface WeekPrizeEntry {
  rank: number
  userId: string
  username: string
  prizeAmountInCents: number
}

export interface WeekPrizesResponse {
  weekId: string
  status: WeekResultStatus
  poolTotalInCents: number
  prizes: WeekPrizeEntry[]
}

export interface ForceResetResponse {
  weekId: string
  nextWeekId: string
  status: 'COMPLETED'
}

export interface UserHistoryEntry {
  weekId: string
  rank: number | null
  earningsInCents: number
}

export interface UserHistoryResponse {
  userId: string
  history: UserHistoryEntry[]
}

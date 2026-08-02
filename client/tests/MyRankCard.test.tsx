import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '../src/context/AuthContext'
import { MyRankCard } from '../src/components/rank/MyRankCard'
import * as leaderboardApi from '../src/api/leaderboard.api'
import type { MyPositionResponse } from '../src/types/api'

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MyRankCard />
      </AuthProvider>
    </QueryClientProvider>,
  )
}

function loginAsStoredUser() {
  localStorage.setItem('panteon.token', 'test-token')
  localStorage.setItem('panteon.userId', 'user-1')
  localStorage.setItem('panteon.username', 'demo_top_player')
  localStorage.setItem('panteon.role', 'USER')
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MyRankCard', () => {
  it('renders nothing when no user is logged in', () => {
    const { container } = renderWithProviders()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the top100 rank when the user is inside the top 100', async () => {
    loginAsStoredUser()
    const response: MyPositionResponse = {
      weekId: '2026-W31',
      inTop100: true,
      myRank: 1,
      myEarningsInCents: 500_000,
      entries: [{ rank: 1, userId: 'user-1', username: 'demo_top_player', earningsInCents: 500_000, isCurrentUser: true }],
    }
    vi.spyOn(leaderboardApi, 'getMyPosition').mockResolvedValue(response)

    renderWithProviders()

    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument())
    expect(screen.getByText('Your Rank')).toBeInTheDocument()
    expect(screen.getByText('$5,000.00')).toBeInTheDocument()
  })

  it('shows the outside-top100 label when the user is outside the top 100', async () => {
    loginAsStoredUser()
    const response: MyPositionResponse = {
      weekId: '2026-W31',
      inTop100: false,
      myRank: 5231,
      myEarningsInCents: 1_200,
      entries: [],
    }
    vi.spyOn(leaderboardApi, 'getMyPosition').mockResolvedValue(response)

    renderWithProviders()

    await waitFor(() => expect(screen.getByText('#5231')).toBeInTheDocument())
    expect(screen.getByText('Outside Top 100')).toBeInTheDocument()
  })
})

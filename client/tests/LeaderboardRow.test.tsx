import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LeaderboardRow } from '../src/components/leaderboard/LeaderboardRow'

const entry = { rank: 42, username: 'demo_regular_player', earningsInCents: 123_450 }

describe('LeaderboardRow', () => {
  it('renders a plain top100 row without the current-user highlight', () => {
    render(<LeaderboardRow entry={entry} />)

    const row = screen.getByTestId('leaderboard-row')
    expect(row).toHaveAttribute('data-current-user', 'false')
    expect(screen.getByText('demo_regular_player')).toBeInTheDocument()
    expect(screen.getByText('$1,234.50')).toBeInTheDocument()
    expect(screen.queryByText(/\(you\)/)).not.toBeInTheDocument()
  })

  it('highlights the row when isCurrentUser is true (rank-window context)', () => {
    render(<LeaderboardRow entry={entry} isCurrentUser />)

    const row = screen.getByTestId('leaderboard-row')
    expect(row).toHaveAttribute('data-current-user', 'true')
    expect(row.className).toContain('bg-me-bg')
    expect(screen.getByText(/demo_regular_player \(you\)/)).toBeInTheDocument()
  })
})

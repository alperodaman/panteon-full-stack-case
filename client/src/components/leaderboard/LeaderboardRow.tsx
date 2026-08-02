import { forwardRef } from 'react'
import { Avatar } from '../common/Avatar'
import { RankBadge } from './RankBadge'
import { formatCents } from '../../lib/format'

export interface LeaderboardRowEntry {
  rank: number
  username: string
  earningsInCents: number
}

interface LeaderboardRowProps {
  entry: LeaderboardRowEntry
  isCurrentUser?: boolean
}

export const LeaderboardRow = forwardRef<HTMLDivElement, LeaderboardRowProps>(function LeaderboardRow(
  { entry, isCurrentUser = false },
  ref,
) {
  return (
    <div
      ref={ref}
      data-testid="leaderboard-row"
      data-current-user={isCurrentUser}
      className={`flex items-center gap-3 rounded-row border px-3 py-2 ${
        isCurrentUser ? 'border-accent bg-me-bg' : 'border-transparent'
      }`}
    >
      <RankBadge rank={entry.rank} />
      <Avatar username={entry.username} size={32} />
      <span
        className={`flex-1 truncate font-body text-sm ${
          isCurrentUser ? 'font-semibold text-accent' : 'text-text-primary'
        }`}
      >
        {entry.username}
        {isCurrentUser ? ' (you)' : ''}
      </span>
      <span className="tabular-nums font-body text-sm text-text-primary">
        ${formatCents(entry.earningsInCents)}
      </span>
    </div>
  )
})

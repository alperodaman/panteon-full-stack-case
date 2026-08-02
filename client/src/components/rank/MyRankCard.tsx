import { Avatar } from '../common/Avatar'
import { Skeleton } from '../common/Skeleton'
import { formatCents } from '../../lib/format'
import { useAuth } from '../../context/AuthContext'
import { useMyRank } from '../../hooks/useMyRank'

export function MyRankCard() {
  const { user } = useAuth()
  const { data, isPending, isError } = useMyRank()

  if (!user) return null

  if (isPending) {
    return <Skeleton className="h-20 w-full" />
  }

  if (isError || !data) {
    return (
      <div className="rounded-card border border-border bg-bg-surface p-4 font-body text-sm text-text-secondary">
        Failed to load your rank.
      </div>
    )
  }

  return (
    <div
      data-testid="my-rank-card"
      className="flex items-center gap-4 rounded-card border-2 border-accent bg-bg-surface p-4 shadow-lg"
    >
      <Avatar username={user.username} size={44} />
      <div className="flex flex-1 flex-col">
        <span className="font-body text-xs uppercase tracking-wide text-text-secondary">
          {data.inTop100 ? 'Your Rank' : 'Outside Top 100'}
        </span>
        <span className="font-display text-lg font-bold text-accent">
          {data.myRank !== null ? `#${data.myRank}` : 'Unranked'}
        </span>
      </div>
      <div className="flex flex-col items-end">
        <span className="font-body text-xs text-text-secondary">This week's earnings</span>
        <span className="tabular-nums font-display text-lg font-semibold text-text-primary">
          ${formatCents(data.myEarningsInCents)}
        </span>
      </div>
    </div>
  )
}

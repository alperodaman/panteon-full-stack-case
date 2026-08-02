import { SkeletonRows } from '../common/Skeleton'
import { formatCents } from '../../lib/format'
import { useWeeklyHistory } from '../../hooks/useWeeklyHistory'

export function WeeklyHistoryPanel() {
  const { data, isPending, isError } = useWeeklyHistory()

  if (isPending) {
    return <SkeletonRows count={4} />
  }

  if (isError || !data) {
    return (
      <div className="rounded-card border border-border bg-bg-surface p-4 font-body text-sm text-text-secondary">
        Failed to load history.
      </div>
    )
  }

  if (data.history.length === 0) {
    return (
      <div className="rounded-card border border-border bg-bg-surface p-4 font-body text-sm text-text-secondary">
        No past week data yet.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {data.history.map((entry) => (
        <div
          key={entry.weekId}
          className="flex items-center justify-between rounded-row border border-border bg-bg-surface px-4 py-3"
        >
          <span className="font-display text-sm font-medium text-text-primary">{entry.weekId}</span>
          <span className="font-body text-sm text-text-secondary">
            {entry.rank !== null ? `Top 100 · #${entry.rank}` : 'Outside Top 100'}
          </span>
          <span className="tabular-nums font-body text-sm font-semibold text-text-primary">
            ${formatCents(entry.earningsInCents)}
          </span>
        </div>
      ))}
    </div>
  )
}

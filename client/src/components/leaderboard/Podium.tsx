import { Avatar } from '../common/Avatar'
import { formatCents } from '../../lib/format'
import type { LeaderboardRowEntry } from './LeaderboardRow'

interface PodiumProps {
  entries: LeaderboardRowEntry[]
}

const PODIUM_STYLES: Record<number, { border: string; text: string; order: string; height: string }> = {
  1: { border: 'border-rank-gold', text: 'text-rank-gold', order: 'order-2', height: 'pt-0' },
  2: { border: 'border-rank-silver', text: 'text-rank-silver', order: 'order-1', height: 'pt-6' },
  3: { border: 'border-rank-bronze', text: 'text-rank-bronze', order: 'order-3', height: 'pt-8' },
}

export function Podium({ entries }: PodiumProps) {
  const top3 = entries.filter((entry) => entry.rank <= 3)
  if (top3.length === 0) return null

  return (
    <div className="flex items-end gap-3">
      {top3.map((entry) => {
        const style = PODIUM_STYLES[entry.rank]
        return (
          <div
            key={entry.rank}
            className={`flex flex-1 flex-col items-center gap-2 rounded-card border-2 ${style.border} bg-bg-surface p-4 ${style.order} ${style.height}`}
          >
            <span className={`font-display text-xl font-bold ${style.text}`}>#{entry.rank}</span>
            <Avatar username={entry.username} size={44} />
            <span className="truncate font-body text-sm font-medium text-text-primary">
              {entry.username}
            </span>
            <span className="tabular-nums font-body text-sm text-text-secondary">
              ${formatCents(entry.earningsInCents)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

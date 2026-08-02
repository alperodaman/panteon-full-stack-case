import { Avatar } from '../common/Avatar'
import { formatCents } from '../../lib/format'
import type { LeaderboardRowEntry } from './LeaderboardRow'

interface PodiumProps {
  entries: LeaderboardRowEntry[]
}

// Visual hierarchy is keyed by rank, not by array/layout position — rank 1
// is always the tallest/most prominent card regardless of where it sits in
// the row order.
const PODIUM_STYLES: Record<
  number,
  { border: string; text: string; order: string; mobileOrder: string; card: string; avatarSize: string }
> = {
  1: {
    border: 'border-rank-gold',
    text: 'text-rank-gold',
    order: 'order-2',
    mobileOrder: 'max-[480px]:order-1 max-[480px]:col-span-2',
    card: 'h-60 border-4 shadow-lg shadow-rank-gold/10 max-[480px]:h-44',
    avatarSize: 'clamp(36px, 11vw, 48px)',
  },
  2: {
    border: 'border-rank-silver',
    text: 'text-rank-silver',
    order: 'order-1',
    mobileOrder: 'max-[480px]:order-2',
    card: 'h-48 border-2 max-[480px]:h-36',
    avatarSize: 'clamp(28px, 9vw, 40px)',
  },
  3: {
    border: 'border-rank-bronze',
    text: 'text-rank-bronze',
    order: 'order-3',
    mobileOrder: 'max-[480px]:order-3',
    card: 'h-48 border-2 max-[480px]:h-36',
    avatarSize: 'clamp(28px, 9vw, 40px)',
  },
}

export function Podium({ entries }: PodiumProps) {
  const top3 = entries.filter((entry) => entry.rank <= 3)
  if (top3.length === 0) return null

  return (
    <div className="flex items-end gap-3 max-[480px]:grid max-[480px]:grid-cols-2 max-[480px]:items-stretch max-[480px]:gap-2">
      {top3.map((entry) => {
        const style = PODIUM_STYLES[entry.rank]
        return (
          <div
            key={entry.rank}
            className={`flex min-w-0 flex-1 flex-col items-center justify-end gap-2 rounded-card ${style.border} bg-bg-surface p-4 max-[480px]:p-2 ${style.order} ${style.mobileOrder} ${style.card}`}
          >
            <span className={`font-display text-xl font-bold ${style.text} max-[480px]:text-base`}>
              #{entry.rank}
            </span>
            <Avatar username={entry.username} size={style.avatarSize} />
            <span className="w-full min-w-0 truncate text-center font-body text-sm font-medium text-text-primary max-[480px]:text-xs">
              {entry.username}
            </span>
            <span className="tabular-nums font-body text-sm text-text-secondary max-[480px]:text-xs">
              ${formatCents(entry.earningsInCents)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

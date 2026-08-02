import { Crown } from 'lucide-react'

const RANK_STYLES: Record<number, { border: string; text: string }> = {
  1: { border: 'border-rank-gold', text: 'text-rank-gold' },
  2: { border: 'border-rank-silver', text: 'text-rank-silver' },
  3: { border: 'border-rank-bronze', text: 'text-rank-bronze' },
}

interface RankBadgeProps {
  rank: number
}

export function RankBadge({ rank }: RankBadgeProps) {
  const style = RANK_STYLES[rank]

  if (style) {
    return (
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${style.border} ${style.text}`}
      >
        <Crown size={14} aria-hidden="true" />
      </div>
    )
  }

  return (
    <span className="w-8 shrink-0 text-center font-display text-sm text-text-secondary tabular-nums">
      {rank}
    </span>
  )
}

import { useState } from 'react'
import { Countdown } from '../common/Countdown'
import { Skeleton } from '../common/Skeleton'
import { formatCents } from '../../lib/format'
import { useCurrentWeek } from '../../hooks/useCurrentWeek'
import { PrizeBreakdownModal } from './PrizeBreakdownModal'

export function PrizePoolBanner() {
  const { data, isPending } = useCurrentWeek()
  const [showBreakdown, setShowBreakdown] = useState(false)

  if (isPending || !data) {
    return <Skeleton className="h-16 w-full" />
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-bg-surface-alt p-4">
      <div className="flex flex-col">
        <span className="font-body text-xs uppercase tracking-wide text-text-secondary">
          Estimated prize pool
        </span>
        <span className="tabular-nums font-display text-lg font-semibold text-accent-gold">
          ${formatCents(data.estimatedPrizePoolInCents)}
        </span>
      </div>
      <div className="flex flex-col items-end">
        <span className="font-body text-xs uppercase tracking-wide text-text-secondary">
          Time until week ends
        </span>
        <Countdown targetIso={data.weekEnd} className="text-lg font-semibold text-text-primary" />
      </div>
      <button
        type="button"
        onClick={() => setShowBreakdown(true)}
        className="rounded-row border border-border px-3 py-1.5 font-body text-sm text-text-secondary hover:text-text-primary"
      >
        How does distribution work?
      </button>
      {showBreakdown ? (
        <PrizeBreakdownModal onClose={() => setShowBreakdown(false)} />
      ) : null}
    </div>
  )
}

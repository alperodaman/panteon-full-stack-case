interface PrizeBreakdownModalProps {
  onClose: () => void
}

export function PrizeBreakdownModal({ onClose }: PrizeBreakdownModalProps) {
  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-w-md flex-col gap-3 rounded-card border border-border bg-bg-surface p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="font-display text-lg font-bold text-text-primary">How does the prize distribution work?</h2>
        <p className="font-body text-sm text-text-secondary">
          The weekly prize pool is calculated as 2% of the total points earned that week.
        </p>
        <ul className="flex flex-col gap-1 font-body text-sm text-text-secondary">
          <li>
            <span className="font-semibold text-rank-gold">1st</span> gets 20% of the pool
          </li>
          <li>
            <span className="font-semibold text-rank-silver">2nd</span> gets 15% of the pool
          </li>
          <li>
            <span className="font-semibold text-rank-bronze">3rd</span> gets 10% of the pool
          </li>
          <li>Ranks 4-100 split the remaining 55%, weighted by rank (1/rank)</li>
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 self-end rounded-row border border-border px-3 py-1.5 font-body text-sm text-text-primary hover:text-accent"
        >
          Close
        </button>
      </div>
    </div>
  )
}

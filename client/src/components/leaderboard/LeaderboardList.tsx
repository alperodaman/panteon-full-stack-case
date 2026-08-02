import { LeaderboardRow, type LeaderboardRowEntry } from './LeaderboardRow'
import { Podium } from './Podium'

interface SurroundingEntry extends LeaderboardRowEntry {
  isCurrentUser: boolean
}

interface LeaderboardListProps {
  entries: LeaderboardRowEntry[]
  currentUsername?: string
  rowRefs?: React.MutableRefObject<Map<number, HTMLDivElement>>
  surroundingEntries?: SurroundingEntry[]
}

// No virtualization: top100 is a fixed, small list (100 rows max), so a
// plain .map() is simplest and fast enough — see AI_WORKFLOW.md.
export function LeaderboardList({
  entries,
  currentUsername,
  rowRefs,
  surroundingEntries,
}: LeaderboardListProps) {
  const podiumEntries = entries.filter((entry) => entry.rank <= 3)
  const restEntries = entries.filter((entry) => entry.rank > 3)

  return (
    <div className="flex flex-col gap-4">
      <Podium entries={podiumEntries} />

      <div className="relative">
        <div className="leaderboard-scroll flex max-h-90 flex-col gap-1 overflow-y-auto pr-1 sm:max-h-120">
          {restEntries.map((entry) => (
            <LeaderboardRow
              key={entry.rank}
              entry={entry}
              isCurrentUser={entry.username === currentUsername}
              ref={
                rowRefs
                  ? (node) => {
                      if (node) rowRefs.current.set(entry.rank, node)
                      else rowRefs.current.delete(entry.rank)
                    }
                  : undefined
              }
            />
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-6 rounded-t-card bg-linear-to-b from-bg-surface to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 rounded-b-card bg-linear-to-t from-bg-surface to-transparent" />
      </div>

      {surroundingEntries && surroundingEntries.length > 0 ? (
        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <div className="text-center font-display text-lg tracking-widest text-text-secondary">
            · · ·
          </div>
          {surroundingEntries.map((entry) => (
            <LeaderboardRow key={entry.rank} entry={entry} isCurrentUser={entry.isCurrentUser} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

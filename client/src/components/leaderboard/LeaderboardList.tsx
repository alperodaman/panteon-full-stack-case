import { LeaderboardRow, type LeaderboardRowEntry } from './LeaderboardRow'
import { Podium } from './Podium'

interface LeaderboardListProps {
  entries: LeaderboardRowEntry[]
  currentUsername?: string
  rowRefs?: React.MutableRefObject<Map<number, HTMLDivElement>>
}

// No virtualization: top100 is a fixed, small list (100 rows max), so a
// plain .map() is simplest and fast enough — see AI_WORKFLOW.md.
export function LeaderboardList({ entries, currentUsername, rowRefs }: LeaderboardListProps) {
  const podiumEntries = entries.filter((entry) => entry.rank <= 3)
  const restEntries = entries.filter((entry) => entry.rank > 3)

  return (
    <div className="flex flex-col gap-4">
      <Podium entries={podiumEntries} />
      <div className="flex flex-col gap-1">
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
    </div>
  )
}

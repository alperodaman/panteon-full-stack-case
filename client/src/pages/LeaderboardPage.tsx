import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '../components/common/ThemeToggle'
import { Countdown } from '../components/common/Countdown'
import { SkeletonRows } from '../components/common/Skeleton'
import { MyRankCard } from '../components/rank/MyRankCard'
import { JumpToMyRankButton } from '../components/rank/JumpToMyRankButton'
import { PrizePoolBanner } from '../components/prize/PrizePoolBanner'
import { DevPanel } from '../components/demo/DevPanel'
import { LeaderboardList } from '../components/leaderboard/LeaderboardList'
import { useAuth } from '../context/AuthContext'
import { useCurrentWeek } from '../hooks/useCurrentWeek'
import { useLeaderboardTop } from '../hooks/useLeaderboardTop'
import { useMyRank } from '../hooks/useMyRank'

export function LeaderboardPage() {
  const { user } = useAuth()
  const { data: week } = useCurrentWeek()
  const { data: top, isPending: isTopPending } = useLeaderboardTop()
  const { data: myRank } = useMyRank()
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const showRankWindow = user && myRank && !myRank.inTop100 && myRank.entries.length > 0

  return (
    <div className="min-h-screen bg-bg-page pb-16 text-text-primary">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-bg-page/95 px-4 py-3 backdrop-blur sm:px-8">
        <div className="flex items-center gap-3">
          <span className="font-display text-sm font-semibold text-text-primary">
            {week ? week.weekId : '…'}
          </span>
          {week ? (
            <span className="font-body text-xs text-text-secondary">
              Ends in: <Countdown targetIso={week.weekEnd} />
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <Link to="/history" className="font-body text-sm text-text-secondary hover:text-text-primary">
            History
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-4 sm:px-8">
        <MyRankCard />
        <DevPanel />
        <PrizePoolBanner />

        {user && myRank ? (
          <div className="flex justify-end">
            <JumpToMyRankButton myRank={myRank.inTop100 ? myRank.myRank : null} rowRefs={rowRefs} />
          </div>
        ) : null}

        <section className="rounded-card border border-border bg-bg-surface p-4">
          <h1 className="mb-4 font-display text-xl font-bold">Top 100</h1>
          {isTopPending || !top ? (
            <SkeletonRows count={8} />
          ) : (
            <LeaderboardList
              entries={top.entries}
              currentUsername={user?.username}
              rowRefs={rowRefs}
              surroundingEntries={showRankWindow ? myRank.entries : undefined}
            />
          )}
        </section>
      </div>
    </div>
  )
}

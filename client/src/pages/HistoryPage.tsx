import { Link } from 'react-router-dom'
import { ThemeToggle } from '../components/common/ThemeToggle'
import { WeeklyHistoryPanel } from '../components/history/WeeklyHistoryPanel'
import { DevPanel } from '../components/demo/DevPanel'
import { useAuth } from '../context/AuthContext'

export function HistoryPage() {
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-bg-page pb-16 text-text-primary">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-bg-page/95 px-4 py-3 backdrop-blur sm:px-8">
        <Link to="/" className="font-display text-sm font-semibold text-text-primary">
          ← Leaderboard
        </Link>
        <ThemeToggle />
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-4 sm:px-8">
        <h1 className="font-display text-xl font-bold">My Weekly History</h1>

        {!user ? (
          <div className="rounded-card border border-border bg-bg-surface p-4 font-body text-sm text-text-secondary">
            Log in first to see your history.
          </div>
        ) : (
          <WeeklyHistoryPanel />
        )}

        <DevPanel />
      </div>
    </div>
  )
}

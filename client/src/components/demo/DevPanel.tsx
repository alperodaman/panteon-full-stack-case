import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { login as loginRequest } from '../../api/auth.api'
import { earn } from '../../api/leaderboard.api'
import { useAuth } from '../../context/AuthContext'

const KNOWN_USERNAMES = ['admin', 'demo_top_player', 'demo_regular_player']
const QUICK_SIM_INTERVAL_MS = 3_000

function randomAmountInCents(): number {
  return Math.floor(Math.random() * 50_000) + 1_000
}

export function DevPanel() {
  const { user, login, logout } = useAuth()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState(KNOWN_USERNAMES[0])
  const [loginError, setLoginError] = useState<string | null>(null)
  const [quickSimOn, setQuickSimOn] = useState(false)

  const loginMutation = useMutation({
    mutationFn: (name: string) => loginRequest(name),
    onSuccess: (result) => {
      login(result)
      setLoginError(null)
    },
    onError: () => setLoginError('Login failed — check the username.'),
  })

  const earnMutation = useMutation({
    mutationFn: () => earn(randomAmountInCents()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
      queryClient.invalidateQueries({ queryKey: ['weeks'] })
    },
  })

  useEffect(() => {
    if (!quickSimOn || !user) return
    const interval = setInterval(() => {
      earnMutation.mutate()
    }, QUICK_SIM_INTERVAL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickSimOn, user])

  useEffect(() => {
    if (!user) setQuickSimOn(false)
  }, [user])

  return (
    <div className="flex flex-col gap-3 rounded-card border border-dashed border-accent-gold bg-bg-surface-alt p-4">
      <span className="font-display text-xs font-semibold uppercase tracking-wide text-accent-gold">
        Dev Panel
      </span>

      {!user ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            loginMutation.mutate(username)
          }}
        >
          <select
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="rounded-row border border-border bg-bg-surface px-2 py-1.5 font-body text-sm text-text-primary"
          >
            {KNOWN_USERNAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="rounded-row bg-accent px-3 py-1.5 font-body text-sm font-semibold text-bg-page disabled:opacity-50"
          >
            {loginMutation.isPending ? 'Logging in…' : 'Log in'}
          </button>
          {loginError ? <span className="font-body text-xs text-accent">{loginError}</span> : null}
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-body text-sm text-text-primary">
            Logged in as: <span className="font-semibold">{user.username}</span>
          </span>
          <button
            type="button"
            onClick={() => earnMutation.mutate()}
            disabled={earnMutation.isPending}
            className="rounded-row bg-accent px-3 py-1.5 font-body text-sm font-semibold text-bg-page disabled:opacity-50"
          >
            Simulate Earning
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={quickSimOn}
            onClick={() => setQuickSimOn((v) => !v)}
            className={`rounded-row border px-3 py-1.5 font-body text-sm ${
              quickSimOn
                ? 'border-accent-gold bg-accent-gold text-bg-page'
                : 'border-border bg-bg-surface text-text-secondary'
            }`}
          >
            Quick Simulation {quickSimOn ? 'On' : 'Off'}
          </button>
          <button
            type="button"
            onClick={logout}
            className="rounded-row border border-border px-3 py-1.5 font-body text-sm text-text-secondary hover:text-text-primary"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  )
}

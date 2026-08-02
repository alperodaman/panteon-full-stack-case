import { useEffect, useState } from 'react'

export interface CountdownParts {
  totalMs: number
  days: number
  hours: number
  minutes: number
  seconds: number
}

function toParts(totalMs: number): CountdownParts {
  const clamped = Math.max(0, totalMs)
  const seconds = Math.floor(clamped / 1000) % 60
  const minutes = Math.floor(clamped / (1000 * 60)) % 60
  const hours = Math.floor(clamped / (1000 * 60 * 60)) % 24
  const days = Math.floor(clamped / (1000 * 60 * 60 * 24))
  return { totalMs: clamped, days, hours, minutes, seconds }
}

export function useCountdown(targetIso: string | undefined): CountdownParts {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!targetIso) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [targetIso])

  if (!targetIso) {
    return toParts(0)
  }

  return toParts(new Date(targetIso).getTime() - now)
}

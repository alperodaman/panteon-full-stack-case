import { useCountdown } from '../../hooks/useCountdown'

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

interface CountdownProps {
  targetIso: string | undefined
  className?: string
}

export function Countdown({ targetIso, className }: CountdownProps) {
  const { days, hours, minutes, seconds } = useCountdown(targetIso)

  return (
    <span className={`tabular-nums font-body ${className ?? ''}`}>
      {days > 0 ? `${days}g ` : ''}
      {pad(hours)}:{pad(minutes)}:{pad(seconds)}
    </span>
  )
}

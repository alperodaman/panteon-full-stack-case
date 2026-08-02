// Derives an accent-to-accent-gold hue from the username so avatars stay
// on-theme without a hardcoded color palette.
function hashToUnit(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return (Math.abs(hash) % 1000) / 1000
}

interface AvatarProps {
  username: string
  // Either a fixed pixel size, or a CSS size expression (e.g. a clamp()
  // string) for avatars that need to shrink fluidly on narrow viewports.
  size?: number | string
}

export function Avatar({ username, size = 36 }: AvatarProps) {
  const t = hashToUnit(username)
  const initial = username.charAt(0).toUpperCase()
  const sizeValue = typeof size === 'number' ? `${size}px` : size

  return (
    <div
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-bg-page"
      style={{
        width: sizeValue,
        height: sizeValue,
        fontSize: `calc(${sizeValue} * 0.42)`,
        backgroundColor: `color-mix(in srgb, var(--accent) ${Math.round((1 - t) * 100)}%, var(--accent-gold) ${Math.round(t * 100)}%)`,
      }}
    >
      {initial}
    </div>
  )
}

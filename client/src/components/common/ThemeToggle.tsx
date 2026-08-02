import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Toggle color theme"
      onClick={toggleTheme}
      className="flex items-center gap-2 rounded-row border border-border bg-bg-surface px-3 py-2 text-text-secondary transition-colors hover:text-text-primary"
    >
      {isDark ? <Moon size={16} /> : <Sun size={16} />}
      <span className="text-sm font-body">{isDark ? 'Dark' : 'Light'}</span>
    </button>
  )
}

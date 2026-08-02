import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-page': 'var(--bg-page)',
        'bg-surface': 'var(--bg-surface)',
        'bg-surface-alt': 'var(--bg-surface-alt)',
        accent: 'var(--accent)',
        'accent-gold': 'var(--accent-gold)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        border: 'var(--border)',
        'me-bg': 'var(--me-bg)',
        'rank-gold': 'var(--rank-gold)',
        'rank-silver': 'var(--rank-silver)',
        'rank-bronze': 'var(--rank-bronze)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        body: 'var(--font-body)',
      },
      borderRadius: {
        card: 'var(--radius-card)',
        row: 'var(--radius-row)',
      },
    },
  },
  plugins: [],
} satisfies Config

import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Backgrounds ─────────────────────────────
        'bg-base':     '#030a06',
        'bg-elevated': '#051009',
        'bg-surface':  '#091a0f',
        'bg-surface2': '#0d2215',
        'bg-overlay':  '#12291a',
        // ── Borders ─────────────────────────────────
        'border':        '#163824',
        'border-subtle': '#0e2518',
        'border-focus':  '#22c55e',
        // ── Brand ───────────────────────────────────
        'primary':       '#22c55e',   // green-500
        'primary-dim':   '#16a34a',   // green-600
        'accent':        '#4ade80',   // green-400
        // ── Semantic ────────────────────────────────
        'success':  '#4ade80',
        'warning':  '#fbbf24',
        'danger':   '#f87171',
        'info':     '#60a5fa',
        // ── Text ────────────────────────────────────
        'text-primary':   '#f0fdf4',
        'text-secondary': '#86efac',
        'text-muted':     '#3a7a52',
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        ui:      ['Inter', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'glow-green': '0 0 20px rgba(34,197,94,0.25)',
        'glow-sm':    '0 0 8px rgba(34,197,94,0.15)',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.5s infinite',
      },
    },
  },
  plugins: [],
} satisfies Config

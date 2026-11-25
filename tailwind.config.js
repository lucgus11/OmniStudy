const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        subtle: token('subtle'),
        line: token('line'),
        fg: token('fg'),
        muted: token('muted'),
        accent: token('accent'),
        'accent-fg': token('accent-fg'),
        ok: token('ok'),
        warn: token('warn'),
        bad: token('bad'),
      },
      fontFamily: {
        // Pile système : zéro requête réseau, parfait pour l'offline
        sans: [
          'ui-sans-serif',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Inter',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      keyframes: {
        shake: {
          '0%,100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-4px)' },
          '75%': { transform: 'translateX(4px)' },
        },
        'fade-in': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: {
        shake: 'shake 0.25s ease-in-out 2',
        'fade-in': 'fade-in 0.18s ease-out',
      },
    },
  },
  plugins: [],
};

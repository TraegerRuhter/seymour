import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic tokens driven by CSS variables (see globals.css) so the
        // whole palette flips in dark mode while alpha utilities keep working.
        cream: 'rgb(var(--color-bg) / <alpha-value>)',
        charcoal: 'rgb(var(--color-ink) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        terracotta: {
          DEFAULT: '#E07A5F',
          dark: '#C96547',
          light: '#F2A48D',
        },
        olive: {
          DEFAULT: '#81B29A',
          dark: '#6A9A83',
        },
      },
      fontFamily: {
        // Inter is loaded via next/font in layout.tsx and exposed as
        // --font-inter; the system stack is the fallback until it swaps in.
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 20px rgb(0 0 0 / 0.06)',
        'card-hover': '0 8px 30px rgb(0 0 0 / 0.10)',
      },
    },
  },
  plugins: [],
};

export default config;

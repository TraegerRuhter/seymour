import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Every token is driven by a CSS variable (see globals.css) so the
        // whole palette flips in dark mode while alpha utilities keep working.
        // `-strong` is the text weight of a hue; the base is its fill weight.
        bone: 'rgb(var(--color-bg) / <alpha-value>)',
        charcoal: 'rgb(var(--color-ink) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        moss: {
          DEFAULT: 'rgb(var(--color-moss) / <alpha-value>)',
          strong: 'rgb(var(--color-moss-strong) / <alpha-value>)',
        },
        zest: {
          DEFAULT: 'rgb(var(--color-zest) / <alpha-value>)',
          strong: 'rgb(var(--color-zest-strong) / <alpha-value>)',
          ink: 'rgb(var(--color-zest-ink) / <alpha-value>)',
        },
        clay: 'rgb(var(--color-clay) / <alpha-value>)',
      },
      fontFamily: {
        // All three are loaded via next/font in layout.tsx; the stacks after
        // each variable are the fallback until the webfont swaps in.
        sans: ['var(--font-text)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'ui-serif', 'serif'],
        typewriter: ['var(--font-typewriter)', 'ui-monospace', 'Menlo', 'monospace'],
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

import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#FAF7F2',
        terracotta: {
          DEFAULT: '#E07A5F',
          dark: '#C96547',
          light: '#F2A48D',
        },
        charcoal: '#2D2D2A',
        olive: {
          DEFAULT: '#81B29A',
          dark: '#6A9A83',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 20px rgb(45 45 42 / 0.06)',
        'card-hover': '0 8px 30px rgb(45 45 42 / 0.10)',
      },
    },
  },
  plugins: [],
};

export default config;

/** @type {import('tailwindcss').Config} */
// Farm Passport v4.5 — the home page's look, everywhere.
// The greens and greys every page already uses are re-tuned to the home page palette,
// so buttons, cards and text change look without changing what they do.
// Orange, blue, red and amber stay as Tailwind made them (they mean "action", "info", "problem" and "careful").
import defaultTheme from 'tailwindcss/defaultTheme';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Farm Passport green (the home page's #2F6B3A is 600)
        green: { 50: '#F1F6F0', 100: '#E3EDE3', 200: '#CFE0CF', 300: '#A9C8AA', 400: '#6FA273', 500: '#46824D', 600: '#2F6B3A', 700: '#1F5A2E', 800: '#18472A', 900: '#123521' },
        // warm greys, like the home page's paper background (#F6F6F2) and ink (#141414)
        gray: { 50: '#F6F6F2', 100: '#ECECE6', 200: '#E2E2DB', 300: '#CFCFC7', 400: '#A3A39B', 500: '#6A6A63', 600: '#55554F', 700: '#3F3F3A', 800: '#232320', 900: '#141414' },
      },
      fontFamily: { sans: ['Manrope', ...defaultTheme.fontFamily.sans] },
      borderRadius: { lg: '0.875rem' },
      boxShadow: {
        md: '0 1px 2px rgba(20,20,20,.04), 0 8px 20px -6px rgba(20,20,20,.08)',
        lg: '0 1px 2px rgba(20,20,20,.04), 0 14px 34px -10px rgba(20,20,20,.10)',
      },
      keyframes: {
        'bounce-once': { '0%': { transform: 'scale(.9)', opacity: '0' }, '60%': { transform: 'scale(1.03)', opacity: '1' }, '100%': { transform: 'scale(1)' } },
      },
      animation: { 'bounce-once': 'bounce-once .5s cubic-bezier(.34,1.56,.64,1)' },
    },
  },
  plugins: [],
};
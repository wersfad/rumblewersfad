/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: { 1: '#8B5CF6', 2: '#A78BFA' }
      },
      fontFamily: {
        display: ['var(--font-display)'],
        ui: ['var(--font-ui)']
      },
      borderRadius: { theme: '16px' }
    }
  },
  plugins: []
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FAF9F5',
        ink: '#1C2430',
        slate: {
          650: '#425064',
        },
        accent: {
          DEFAULT: '#2F5D6B',
          dark: '#204450',
          light: '#E4EEF0',
        },
        line: '#DEDBD1',
        warn: '#9A5B12',
        warnbg: '#FBF0DF',
      },
      fontFamily: {
        serif: ['"Source Serif 4"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['Newsreader', '"PT Serif"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        arc: {
          50: '#F2F9F5',
          100: '#E8F5E9',
          200: '#C8E6C9',
          300: '#81C784',
          400: '#4CAF50',
          500: '#137A43',
          600: '#0F6536',
          700: '#0B4D29',
          800: '#08371C',
          900: '#052211',
        },
      },
    },
  },
  plugins: [],
}


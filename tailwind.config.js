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
          50: '#F0F9F2',
          100: '#DCF2E2',
          200: '#BCE5C6',
          300: '#8FD2A1',
          400: '#55B872',
          500: '#1A863A',
          600: '#147230',
          700: '#105B27',
          800: '#0F4821',
          900: '#0D3C1D',
        },
      },
    },
  },
  plugins: [],
}


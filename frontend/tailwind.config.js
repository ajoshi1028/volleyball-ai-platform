/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'ppu-navy': '#0f1923',
        'ppu-panel': '#1a2332',
        'ppu-card': '#232d3f',
        'ppu-border': '#2e3d52',
        'ppu-orange': '#ff6300',
        'ppu-orange-dim': 'rgba(255, 99, 0, 0.15)',
      },
    },
  },
  plugins: [],
}

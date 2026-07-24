/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{jsx,js,html}', './index.src.html'],
  theme: {
    extend: {
      colors: {
        base: '#0b0f17',
        panel: '#111827',
        panel2: '#0f1623',
        edge: '#1f2937',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

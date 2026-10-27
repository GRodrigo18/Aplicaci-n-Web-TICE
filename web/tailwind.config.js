/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // índigo de la interfaz del informe (Figuras 23 a 32)
        marca: { 50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc', 400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 900: '#1e1b4b' },
        fondo: '#f5f6fb',
      },
      boxShadow: {
        suave: '0 1px 2px rgba(16,24,40,.04), 0 4px 16px -8px rgba(16,24,40,.08)',
        brillo: '0 8px 24px -8px rgba(99,102,241,.55)',
      },
    },
  },
  plugins: [],
};

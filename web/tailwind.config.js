/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        marca: { 50: '#eef5ff', 100: '#d9e8ff', 500: '#2f6fdb', 600: '#1f5bc4', 700: '#1a4a9e', 900: '#14284d' },
      },
    },
  },
  plugins: [],
};

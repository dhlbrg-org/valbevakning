/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        mp: {
          green: '#83CF39',
          dark: '#004B23',
          light: '#F4F9F2',
          accent: '#5B9E2B'
        }
      }
    },
  },
  plugins: [],
}

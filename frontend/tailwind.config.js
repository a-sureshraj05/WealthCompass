/** @type {import('tailwindcss').Config} */
// Tailwind v3, matching what cdn.tailwindcss.com served before the build was
// made real. v4 was avoided on purpose: it changes the default border colour and
// renames the shadow scale, both of which would silently restyle existing markup.
export default {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './types.ts',
    './{components,contexts,hooks,utils,services,src}/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // .font-display was a hand-written rule in index.html's <style> block.
        // Declaring it here makes `font-display` a real utility instead.
        display: ['Hanken Grotesk', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

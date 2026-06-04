import { defineConfig } from 'vitest/config'

// Vitest-only config. Kept out of tsconfig.node's build graph so the nested
// vite that vitest ships doesn't type-clash with the app's vite at `tsc -b`.
// Tests are pure-logic (no DOM needed) but happy-dom is set for any component
// test we add later.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['{src,functions}/**/*.test.ts'],
  },
})

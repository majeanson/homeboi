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
    // Vitest defaults to ~one fork per core. On a 16-core box that's 16 happy-dom
    // forks, whose aggregate peak intermittently exceeds 16 GB → OOM mid-run. Cap
    // the LOCAL pool to bound peak memory; the suite is fast (~3 s of test work),
    // so fewer forks costs little. CI has more headroom (green today) → default.
    maxWorkers: process.env.CI ? undefined : 6,
  },
})

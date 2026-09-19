import { defineConfig } from 'vitest/config'

// Vitest-only config. Kept out of tsconfig.node's build graph so the nested
// vite that vitest ships doesn't type-clash with the app's vite at `tsc -b`.
// Tests are pure-logic (no DOM needed) but happy-dom is set for any component
// test we add later.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    //  so the CI-facing scripts are held too — the trailer parser
    // reads commit messages, which is untrusted text on a runner with deploy credentials.
    // .mjs keeps them out of  entirely, and knip's  entry covers them.
    include: ['{src,functions,worker}/**/*.test.ts', 'scripts/**/*.test.mjs'],
    // The real-runtime suite (*.d1.test.ts) imports `cloudflare:test` and runs under
    // vitest.d1.config.ts only — see that file.
    exclude: ['**/node_modules/**', '**/*.d1.test.ts'],
    // Vitest defaults to ~one fork per core. On a 16-core box that's 16 happy-dom
    // forks, whose aggregate peak intermittently exceeds 16 GB → OOM mid-run. Cap
    // the LOCAL pool to bound peak memory; the suite is fast (~3 s of test work),
    // so fewer forks costs little. CI has more headroom (green today) → default.
    maxWorkers: process.env.CI ? undefined : 6,
  },
})

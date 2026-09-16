import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// The REAL-RUNTIME test harness (STATE.md §4-L, item L3): the Worker in workerd, with a
// real D1 (every migration applied), a real R2 and the Durable Object — the same
// bindings wrangler.toml declares, read from that file so the two cannot drift.
//
// Kept as a SECOND vitest config, not merged into vitest.config.ts: the 2 300 pure
// tests keep their happy-dom pool untouched, and this one only picks `*.d1.test.ts`.
// `npm run test:d1` runs it; CI runs it after `build` because wrangler.toml's
// `[assets]` block points at dist/ (the plugin resolves it at start).
//
// Until 2026-09-16 no handler had ever run against a real D1 in a test: route.test.ts
// stubs the database with one row, and all 150+ Playwright specs stub every /api/*.
// 132 migrations and ~520 SQL statements were validated by hand probes on the local
// Worker and by production. The first customer is worker/isolation.d1.test.ts — a
// household walking every route with another household's ids.
export default defineConfig(async () => {
  const migrations = await readD1Migrations('functions/db/migrations')
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.toml' },
        // Never reach a real account from a test (AI, the rate limiters): every binding
        // is the local simulation or absent.
        remoteBindings: false,
        miniflare: {
          bindings: {
            // Applied by functions/test/apply-migrations.ts before the tests run.
            TEST_MIGRATIONS: migrations,
            // auth.ts refuses a secret under 32 chars — a real one, not "undefined".
            SESSION_SECRET: 'd1-test-secret-d1-test-secret-d1-test-secret',
            // Skips the force-HTTPS bounce in worker/index.ts, exactly as .dev.vars does.
            ENVIRONMENT: 'development',
            AI: '',
            MISTRAL_API_KEY: '',
            RESEND_API_KEY: '',
            NASA_APOD_KEY: '',
            LOGIN_PASSWORD: '',
          },
        },
      }),
    ],
    test: {
      include: ['{functions,worker}/**/*.d1.test.ts'],
      setupFiles: ['./functions/test/apply-migrations.ts'],
      // A whole-app sweep is hundreds of requests; give it room.
      testTimeout: 120_000,
      hookTimeout: 60_000,
    },
  }
})

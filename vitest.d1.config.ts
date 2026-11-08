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
          // A second, empty database for the task-merge drill (worker/taskMerge.d1.test.ts):
          // it is migrated only up to the migration before the merge, seeded in the OLD shape,
          // then handed the merge migration itself. The Worker never sees it.
          d1Databases: ['DRILL_DB'],
          bindings: {
            // Applied by functions/test/apply-migrations.ts before the tests run.
            TEST_MIGRATIONS: migrations,
            // auth.ts refuses a secret under 32 chars — a real one, not "undefined".
            SESSION_SECRET: 'd1-test-secret-d1-test-secret-d1-test-secret',
            // Skips the force-HTTPS bounce in worker/index.ts, exactly as .dev.vars does.
            ENVIRONMENT: 'development',
            // AI and BROWSER are NOT listed: wrangler.toml's [ai] and [browser] blocks win
            // over an entry here, so the `AI: ''` that sat here did nothing. The real AI
            // binding answers `.run` with « Binding AI needs to be run remotely », which
            // reads as a model failure and costs nothing. A test that wants a model scripts
            // one with functions/test/fakes.ts, which also unbinds BROWSER.
            MISTRAL_API_KEY: '',
            RESEND_API_KEY: '',
            NASA_APOD_KEY: '',
            INVITE_CODE: '',
            // The deploy callback's secret (0136). ≥32 chars, because deployHook.ts
            // treats anything shorter as unconfigured. Bound here so the d1 suite
            // exercises the CONFIGURED path end to end; the unconfigured one — the half
            // that must fail CLOSED — is held purely in _lib/deployHook.test.ts, which
            // is why that gate is a separate pure module: a binding cannot be unset
            // per-test from here.
            DEPLOY_NOTIFY_SECRET: 'd1-deploy-secret-d1-deploy-secret-32',
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

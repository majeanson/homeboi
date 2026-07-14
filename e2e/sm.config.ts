import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

// The STATE-MATRIX harness (`npm run e2e:matrix`) — on-demand, never in the
// per-push e2e run. Same frontend-only Vite dev server + fully-stubbed /api as
// playwright.config.ts; only e2e/state-matrix.spec.ts runs, and a global
// teardown merges the per-state fragments into screenshots/matrix/manifest.json.
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  testDir: './',
  testMatch: /state-matrix\.spec\.ts/,
  globalTeardown: './sm.teardown.ts',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : Number(process.env.PW_WORKERS) || 4,
  timeout: 45_000,
  reporter: [['list']],
  outputDir: 'test-results-matrix',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    navigationTimeout: 20_000,
    actionTimeout: 15_000,
    timezoneId: 'America/Toronto',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    cwd: REPO_ROOT,
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})

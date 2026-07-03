import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

// This config lives in e2e/, so Playwright spawns webServer with cwd = e2e/ by
// default. `vite build`/`preview` need the repo root (where index.html + vite.config
// live), so pin cwd there.
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))

// Service-worker precache sweep (REVIEW-PASS §931). Unlike playwright.config.ts,
// which drives the frontend-only Vite DEV server, the SW is a BUILD artifact: the
// babillard-sw plugin emits dist/sw.js only on `vite build`, and registerSw()
// registers it only in a PROD bundle (import.meta.env.PROD). So this harness builds
// the app and serves the built dist/ via `vite preview` — the only way to exercise
// the real offline app shell (a kiosk rebooting with no network).
//
//   npm run e2e:sw            # build + preview + run e2e/sw.spec.ts
//
// The /api proxy is irrelevant here: sw.spec.ts stubs every /api/* with page.route,
// so preview never needs a Worker/D1. This spec is testIgnore'd from the default
// config (it would fail under the DEV server, where no SW is registered).
const PORT = Number(process.env.BB_SW_PORT) || 4178

export default defineConfig({
  testDir: './',
  testMatch: /sw\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: [['list']],
  outputDir: 'test-results-sw',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    navigationTimeout: 20_000,
    actionTimeout: 15_000,
    timezoneId: 'America/Toronto',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Build the PROD bundle (emits dist/sw.js) then serve it. `vite build` alone is
    // enough for the artifact — CI already typechecks separately, so we skip the
    // tsc -b half of `npm run build` to keep this harness fast. strictPort so a
    // collision fails loudly instead of silently drifting to another port.
    command: `npx vite build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    cwd: REPO_ROOT,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})

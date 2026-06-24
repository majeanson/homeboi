import { defineConfig, devices } from '@playwright/test'

// Separate Playwright project for PROMO CAPTURE (not the e2e suite). It reuses the
// frontend-only Vite dev server + the deterministic /api stubs from e2e/mocks.ts to
// shoot retina stills for the Remotion compositions. Run from the repo root:
//   npm run promo:capture
// Output frames + manifest land in promo/remotion/public/captures/<scriptId>/.
export default defineConfig({
  testDir: '.',
  testMatch: /capture\.spec\.ts/,
  // One worker: the spec spins its own contexts per beat and writes files to disk;
  // serial keeps the dev-server cold-compile from starving parallel navigations and
  // keeps console output readable.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [['list']],
  outputDir: '../.pw-output',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    // Freeze the zone like the e2e suite so time-of-day surfaces render a fixed bucket.
    timezoneId: 'America/Toronto',
    navigationTimeout: 25_000,
    actionTimeout: 15_000,
    // Retina capture. The spec also sets this per-context, but keep it here for any
    // default-fixture use.
    deviceScaleFactor: 2,
  },
  projects: [{ name: 'capture', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    // cwd is resolved relative to this config file's directory → repo root.
    cwd: '../../',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})

import { defineConfig, devices } from '@playwright/test'

// E2E + visual screenshots. We drive the frontend-only Vite dev server (no
// wrangler/D1 needed) and stub every /api/* call from the test, so screenshots
// are deterministic and offline. The matrix lives in e2e/screenshots.spec.ts:
// every surface × theme (day/night) × format (phone/wall) × language.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Cap workers: the first hit on each lazy route triggers a Vite transform, and
  // too much parallel cold-compile starves navigations. 4 is a good balance.
  workers: process.env.CI ? 1 : 4,
  timeout: 45_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/report' }]],
  outputDir: 'e2e/test-results',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    navigationTimeout: 20_000,
    actionTimeout: 15_000,
    // Fonts come off Google Fonts; freeze the clock so time-of-day surfaces
    // (Board, Aujourd'hui) render the same bucket every run.
    timezoneId: 'America/Toronto',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Plain `vite` — frontend only. The API is stubbed per-test via page.route,
  // so the 8788 proxy target never needs to be up.
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})

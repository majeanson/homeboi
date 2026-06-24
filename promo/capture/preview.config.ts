import { defineConfig, devices } from '@playwright/test'

// FAST preview harness (NOT the video capture): boots the same frontend-only Vite +
// e2e /api stubs and shoots ONE still of each tour beat's END STATE (after its
// choreography) so we can judge content/framing/emphasis without a full webm capture
// + Remotion render. Run from repo root:
//   npx playwright test -c promo/capture/preview.config.ts
// Stills land in the scratchpad dir set by PREVIEW_OUT (or promo/.pw-output/preview).
export default defineConfig({
  testDir: '.',
  testMatch: /preview\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [['list']],
  outputDir: '../.pw-output',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    timezoneId: 'America/Toronto',
    navigationTimeout: 25_000,
    actionTimeout: 15_000,
    deviceScaleFactor: 2,
  },
  projects: [{ name: 'preview', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    cwd: '../../',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})

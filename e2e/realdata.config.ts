import { defineConfig, devices } from '@playwright/test'

// Real-data visual sweep. Unlike playwright.config.ts (frontend-only + mocked
// /api), this boots the dev server with BABILLARD_API_PROXY pointed at the
// deployed Worker, so the app renders the REAL household (members, list, recipes,
// meals). Used to catch layout bugs that only show with real content volume —
// long lists, many recipes — that the deterministic mocks can't reproduce.
//
//   BABILLARD_API_PROXY=https://babillard.marc-jeanson.workers.dev \
//   BB_EMAIL=... BB_PASSWORD=... npx playwright test -c e2e/realdata.config.ts
//
// NOT part of CI (no secrets there); a local, on-demand pass only.
export default defineConfig({
  testDir: './',
  testMatch: /realdata\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [['list']],
  outputDir: 'test-results-realdata',
  use: {
    baseURL: `http://127.0.0.1:${process.env.BB_PORT || '5219'}`,
    navigationTimeout: 30_000,
    actionTimeout: 20_000,
    timezoneId: 'America/Toronto',
  },
  // Target with `--project`. WebKit is the same engine as Safari, and the iphone
  // descriptor emulates mobile iOS Safari (viewport + touch + UA) — the closest
  // headless proxy for Marc's live iOS apps. Caveat: Playwright WebKit does NOT
  // simulate the iOS dynamic toolbar / true safe-area insets, so a pixel-perfect
  // toolbar-overlap repro still needs the Xcode Simulator or a real device.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'safari', use: { ...devices['Desktop Safari'] } },
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    // A dedicated port (not the default 5173) so a parallel session's dev server
    // never collides with this real-data run on the shared worktree.
    command: `npm run dev -- --host 127.0.0.1 --port ${process.env.BB_PORT || '5219'}`,
    url: `http://127.0.0.1:${process.env.BB_PORT || '5219'}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      BABILLARD_API_PROXY: process.env.BABILLARD_API_PROXY || 'https://babillard.marc-jeanson.workers.dev',
    },
  },
})

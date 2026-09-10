import { defineConfig, devices } from '@playwright/test'

// THE FLIPP LIVE CONTRACT (`npm run e2e:flipp`) — on-demand + weekly, never in the
// per-push run. Unlike every other harness here it boots NO Vite server and stubs
// NOTHING: it drives the real flipp.com in a real Chromium, because what it guards
// is THEIR side of a contract we cannot pin any other way — the list-storage shape
// `lib/flippList` writes, the bare `/liste_dachats` route, the item page's postal
// rule. A private schema on someone else's site is exactly the kind of fact that
// stays "true" in a comment for months after it stopped being true.
//
// Network-bound by nature: one retry, one worker, generous timeouts. A red run
// names WHICH fact moved; see e2e/flipp-live.spec.ts for what each test pins.
export default defineConfig({
  testDir: './',
  testMatch: /flipp-live\.spec\.ts/,
  fullyParallel: false,
  retries: 1,
  workers: 1,
  timeout: 120_000,
  reporter: [['list']],
  outputDir: 'test-results-flipp',
  use: {
    trace: 'on-first-retry',
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    locale: 'fr-CA',
    timezoneId: 'America/Toronto',
    viewport: { width: 390, height: 844 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } }],
})

import { defineConfig, devices } from '@playwright/test'

// THE STRANGER'S WALK (`npm run e2e:stranger`) — on-demand + weekly, never per-push.
//
// Like the Flipp contract it boots NO Vite and stubs NOTHING: it drives the DEPLOYED
// app as a first-time visitor would, on a laptop and on an iPhone profile, because what
// it guards cannot be seen from a stubbed harness — how long the door takes on a real
// connection, whether the demo mint really lands on a usable board, whether anything
// 4xxs or throws in the console on the way. The scripted version of this walk found
// four defects in one afternoon (STATE §4-K wave 1: a first screen no tab could escape,
// a socket opening with no credential on the marketing page, a « what's new » notice
// about a rename the visitor never saw); it lived in a session scratchpad, which is
// where findings go to be lost. This is that walk, kept.
//
// Target: BABILLARD_URL, else production. Each run mints one 24 h demo sandbox, which
// the nightly sweep removes (functions/_lib/nightly.ts).
export const BASE_URL = process.env.BABILLARD_URL || 'https://babillard.marcportal.com'

export default defineConfig({
  testDir: './',
  testMatch: /stranger-live\.spec\.ts/,
  fullyParallel: false,
  // Network-bound against a real deployment: one retry absorbs a cold Worker start,
  // and a second failure is a real one.
  retries: 1,
  workers: 1,
  timeout: 180_000,
  reporter: [['list']],
  outputDir: 'test-results-stranger',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    locale: 'fr-CA',
    timezoneId: 'America/Toronto',
  },
  projects: [
    { name: 'laptop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['iPhone 13'] } },
  ],
})

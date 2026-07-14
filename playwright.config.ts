import { defineConfig, devices } from '@playwright/test'

// E2E + visual screenshots. We drive the frontend-only Vite dev server (no
// wrangler/D1 needed) and stub every /api/* call from the test, so screenshots
// are deterministic and offline. The matrix lives in e2e/screenshots.spec.ts:
// every surface × theme (day/night) × format (phone/wall) × language.
export default defineConfig({
  testDir: './e2e',
  // sw.spec.ts needs the built PROD bundle served by `vite preview` (the SW is a
  // build artifact + registers only in a PROD build) — it runs under its own harness
  // (e2e/sw.config.ts, `npm run e2e:sw`) and would fail against this DEV server.
  // state-matrix.spec.ts is the ON-DEMAND visual state sweep (e2e/sm.config.ts,
  // `npm run e2e:matrix`) — kept out of the per-push run by design.
  testIgnore: ['**/sw.spec.ts', '**/state-matrix.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // CI runs serially (workers:1 below) and is the authoritative, strict run.
  // Locally we fan out to 4 workers for speed, where the first hit on a lazy
  // route cold-compiles in Vite and can briefly starve a parallel navigation —
  // a one-shot retry absorbs that environmental flake without masking real ones
  // (a genuine failure fails both attempts).
  retries: process.env.CI ? 0 : 1,
  // Cap workers: the first hit on each lazy route triggers a Vite transform, and
  // too much parallel cold-compile starves navigations (mitigated by vite.config
  // `server.warmup`, which pre-transforms the routes at boot). 4 is a good balance;
  // override with PW_WORKERS=2 for a flaky full-suite run on a constrained box.
  workers: process.env.CI ? 1 : Number(process.env.PW_WORKERS) || 4,
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
  // Chromium is the authoritative CI engine. Set PW_WEBKIT=1 locally to also get
  // WebKit (Safari's engine) + an iPhone-emulated mobile WebKit project — Marc's
  // live apps run iOS Safari, so this catches WebKit-only rendering bugs Chromium
  // hides. Opt-in (not in CI, which has no webkit binary). Pick one with
  // `--project=iphone`. NB: Playwright WebKit does not emulate the iOS dynamic
  // toolbar / safe-area, so a real toolbar-overlap still needs a device/simulator.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(process.env.PW_WEBKIT
      ? [
          { name: 'safari', use: { ...devices['Desktop Safari'] } },
          { name: 'iphone', use: { ...devices['iPhone 13'] } },
        ]
      : []),
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

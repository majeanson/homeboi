import { defineConfig } from '@playwright/test'

// THE RECIPE LIVE CONTRACT (`npm run e2e:recipes`) — on-demand + weekly, never in the
// per-push run. No Vite server, no browser, no stubs: it fetches the corpus pages from
// the live sites the way the Worker does and reads them through the production seam
// (e2e/recipe-live.spec.ts says what a red means). Network-bound: one worker, a long
// timeout, one retry for a site that hiccups.
export default defineConfig({
  testDir: './',
  testMatch: /recipe-live\.spec\.ts/,
  fullyParallel: false,
  retries: 1,
  workers: 1,
  timeout: 600_000,
  reporter: [['list']],
  outputDir: 'test-results-recipes',
})

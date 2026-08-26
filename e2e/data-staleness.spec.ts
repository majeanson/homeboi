import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// bmad/10 B-7 — "La ligne de vérité." The board must flag stale data even when
// navigator.onLine still reads true — a captive portal, a dead uplink past the
// router, or a Worker outage all leave the interface "online" while nothing
// actually refreshes. `context.setOffline(true)` (offline-outbox.spec.ts) only
// covers the OTHER half (the interface itself going down); this covers the half
// unit tests can't reach: real TanStack Query state + the real poll gear, wired
// through OfflineBanner's second condition.
test('data staleness — a captive-portal outage (still "online", nothing refreshing) surfaces the calm stale bar', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })
  await page.goto('/board')
  await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })

  // Fresh load, genuinely online, data just landed → no bar of either kind.
  await expect(page.locator('.offline-bar')).toHaveCount(0)

  // Simulate the outage: every further /api/* request fails at the network layer
  // (a dropped connection, not a 4xx) — registered AFTER mockApi's own route, so
  // it wins for anything from this point on. navigator.onLine is left untouched
  // (still true) — that's the whole point of this scenario.
  await page.route('**/api/**', (route) => route.abort('failed'))

  // Install the fake clock only NOW (after the app has already booted on the real
  // clock — installing it before navigation freezes React's own real-timer-driven
  // bootstrap and the page never finishes rendering). `fastForward` (not
  // `setFixedTime`) both moves Date.now() AND actually fires the pending
  // setInterval ticks (our useDataFreshness check + TanStack's own
  // refetchInterval), which is what makes the staleness re-evaluate without
  // waiting on real wall-clock time.
  await page.clock.install()

  // Fast-forward the clock 7 minutes with no successful fetch able to land in
  // between. Past the 60 s "asleep" cutoff, the poll settles into the idle gear
  // (120 s), whose stale threshold is 3× = 6 min — 7 min is comfortably past it
  // (the exact boundary math is exhaustively covered by src/lib/online.test.ts;
  // this only proves the real wiring — the setInterval check + live TanStack
  // Query state — actually fires).
  await page.clock.fastForward('07:00')

  await expect(page.locator('.offline-bar--stale')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.offline-bar__stamp', { hasText: 'en attente' })).toHaveCount(0)
  // The stale bar is calm, not an alarm — it never claims to BE the offline banner.
  await expect(page.locator('.offline-bar')).not.toContainText('Hors ligne')
})

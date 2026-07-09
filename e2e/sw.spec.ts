import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Service-worker offline app shell, end-to-end (REVIEW-PASS §931). The promise of
// NFR-OFFLINE-1 is that a cheap always-on wall tablet REBOOTS with no network and
// still boots the board. That relies on the build-time SW (vite.config babillard-sw)
// precaching the shell on install and, on a later navigate, falling back to the
// cached '/' when the network is gone. This can only be observed against the built
// PROD bundle served by `vite preview` (see sw.config.ts) — the DEV server registers
// no SW at all. Runs under that dedicated harness only.
//
// The /api/* mocks are synthetic (page.route fulfils without touching the network),
// so they still answer while offline; the shell itself must come from the SW cache.

test('the service worker precaches the shell and reboots offline', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })

  await page.goto('/board')

  // The SW installs (addAll(PRECACHE) → skipWaiting) then activates and claims this
  // page, at which point navigator.serviceWorker.controller is set. A non-null
  // controller therefore also means the precache addAll already resolved.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
    timeout: 20_000,
  })

  // The precache holds the app shell: the entry '/' plus at least one hashed JS
  // bundle. Its name is versioned (babillard-<djb2 of the asset list>), so match by
  // prefix and skip the 'babillard-share' side cache the share-target uses.
  const precached = await page.evaluate(async () => {
    const name = (await caches.keys()).find((k) => k.startsWith('babillard-') && k !== 'babillard-share')
    if (!name) return null
    const cache = await caches.open(name)
    return (await cache.keys()).map((r) => new URL(r.url).pathname)
  })
  expect(precached, 'a versioned babillard-<hash> precache exists').not.toBeNull()
  expect(precached).toContain('/')
  expect(precached!.some((p) => /\.js$/.test(p)), 'precache holds a hashed JS bundle').toBe(true)

  // Kill the network and reboot the tablet: the navigation can't reach the server, so
  // the SW must serve the cached shell — and the board still boots.
  await page.context().setOffline(true)
  await page.reload()

  // page.reload() itself already gets this config's generous navigationTimeout
  // (20s) for a loaded CI runner; the render that follows — mount, plus restoring
  // the persisted TanStack Query cache from IndexedDB before first paint
  // (src/lib/persist.ts, OFFLINE.md) — was left on Playwright's silent 5s default,
  // the only wait in this spec not already sized for CI (every other wait here is
  // an explicit 15–20s). Match that budget instead of the tool default.
  await expect(page.locator('.hub')).toBeVisible({ timeout: 15_000 })
  // Still SW-controlled after the offline reboot (the shell came from cache, not a
  // live server round-trip).
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)

  await page.context().setOffline(false)
})

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

  // The SW installs (the critical precache, then the optional one → skipWaiting)
  // then activates and claims this page, at which point navigator.serviceWorker
  // .controller is set. Since install() now REJECTS on a critical entry it could
  // not cache, a non-null controller means the whole shell is in the cache — not
  // merely that install ran.
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

  // EVERY entry this build called critical, not merely "at least one .js" — the
  // guarantee install() now owes. A hole in that set is invisible while the tablet
  // is online and surfaces later as a blank screen on the first offline reboot; it
  // surfaced here once as a bare "'.hub' never appeared" timeout further down, with
  // nothing pointing at the cause. Read the promise back out of /sw.js and check the
  // cache kept it, so the next failure names itself: a missing entry (install lied)
  // rather than a stall in mount/paint.
  const promised = await page.evaluate(async () => {
    const src = await fetch('/sw.js').then((r) => r.text())
    const from = src.indexOf('[', src.indexOf('const PRECACHE_CRITICAL ='))
    const to = src.indexOf(']', from)
    return from < 0 || to < 0 ? null : (JSON.parse(src.slice(from, to + 1)) as string[])
  })
  expect(promised, '/sw.js exposes the critical list it was built with').not.toBeNull()
  expect(
    promised!.filter((u) => u.endsWith('.js')).length,
    'the build baked hashed JS bundles into PRECACHE_CRITICAL',
  ).toBeGreaterThan(0)
  expect(
    promised!.filter((u) => !precached!.includes(u)),
    'every critical entry actually landed in the cache',
  ).toEqual([])

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

// The retry that install() gained with SW_POLICY v3. A precache write can fail
// transiently — a blip mid-install, a loaded server refusing one connection — and
// the old code swallowed that (allSettled) and activated anyway, leaving a shell
// with a hole in it that nothing would notice until the tablet next rebooted
// offline. Prove the recovery rather than trust it: fail one critical bundle's
// FIRST request, let the second through, and require the entry to be in the cache.
//
// The victim is a lazy route chunk the board itself never imports, so the only
// requests for it come from the precache — aborting it can't break the page load
// and muddy what's being tested.
test('a transient failure on a critical entry is retried, not swallowed', async ({ context, page }) => {
  const VICTIM = /\/assets\/Kitchen-[^/]*\.js$/
  let attempts = 0
  await context.route(VICTIM, (route) => {
    attempts += 1
    return attempts === 1 ? route.abort('failed') : route.continue()
  })

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })
  await page.goto('/board')

  // install() must still finish — the retry is what gets it there.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20_000 })

  // Guard against a FALSE pass: if Playwright never intercepted the worker's own
  // fetch, nothing was ever failed and the assertion below would prove nothing.
  expect(attempts, "the victim bundle's precache request was intercepted").toBeGreaterThan(0)
  expect(attempts, 'and it was requested again after the first attempt failed').toBeGreaterThan(1)

  const cached = await page.evaluate(async () => {
    const name = (await caches.keys()).find((k) => k.startsWith('babillard-') && k !== 'babillard-share')
    if (!name) return null
    const cache = await caches.open(name)
    return (await cache.keys()).map((r) => new URL(r.url).pathname)
  })
  expect(cached, 'a versioned precache exists').not.toBeNull()
  expect(
    cached!.some((p) => VICTIM.test(p)),
    'the entry whose first fetch failed is in the cache anyway',
  ).toBe(true)

  await page.context().setOffline(false)
})

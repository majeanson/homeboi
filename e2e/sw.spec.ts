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

  // What the entry module was stored WITH — printed on EVERY run, asserted never.
  // This is the line that finally named the blank-board bug: « vary: "Origin" ».
  // The preview/origin sends Vary: Origin on assets; a <script type="module"> is
  // fetched with CORS semantics and sends an Origin header, while cacheOne() stored
  // the entry under a bare string URL whose Request has none — so the Cache Query
  // algorithm compared that header, differed, and reported no match for an entry
  // sitting right there. Keep it: it costs one log line and it is how anyone reading
  // a future failure sees the variant the cache actually holds.
  // (hitWithoutIgnoreVary is the platform tell — true on Windows, which is why this
  // never reproduced locally while failing ~50% of the time on the Linux runner.)
  const storedHeaders = await page.evaluate(async () => {
    const name = (await caches.keys()).find((k) => k.startsWith('babillard-') && k !== 'babillard-share')
    if (!name) return null
    const c = await caches.open(name)
    const entry = (await c.keys()).find((r) => /\/assets\/index-[^/]*\.js$/.test(r.url))
    if (!entry) return null
    const res = await c.match(entry.url, { ignoreVary: true })
    return {
      url: new URL(entry.url).pathname,
      vary: res?.headers.get('vary') ?? null,
      contentEncoding: res?.headers.get('content-encoding') ?? null,
      contentType: res?.headers.get('content-type') ?? null,
      hitWithoutIgnoreVary: !!(await c.match(entry.url)),
    }
  })
  console.log('[sw] entry module as stored: ' + JSON.stringify(storedHeaders))

  // Anything the offline boot logs — the only witness when the shell doesn't come
  // back and there is no trace to open (see the throw below).
  const consoleErrors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200))
  })
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message.slice(0, 200)))

  // …and WHICH requests failed. Chrome's console line ("status of 504") carries no
  // URL, and the SW answers 504 for two different reasons — a cache miss whose
  // network fallback died offline, and the « Stale asset » refusal (an HTML body
  // under a .js URL, the grey-screen trap). Recording url+status here, and reading
  // each one back against `promised` (the precache list this build baked in), says
  // which of the two it is: a failing URL that IS precached means the cache lookup
  // missed something it holds; one that is NOT means the shell references an asset
  // the precache never covered — a very different bug, and check-bundle.mjs would
  // be wrong about it.
  const failed: { url: string; status: number; statusText: string }[] = []
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push({ url: r.url(), status: r.status(), statusText: r.statusText() })
  })

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
  // This is THE assertion of NFR-OFFLINE-1 ("a cheap always-on wall tablet reboots
  // with no network and still boots the board"), and it fails intermittently on CI
  // while passing 10/10 locally in ~2s each. Widening the wait (15s → 30s) did NOT
  // fix it — it then failed at the full 30s — so the margin was never the cause.
  //
  // The harness gave us nothing to look at: this config uses the plain-list reporter and
  // its own output folder (test-results-sw), which the e2e workflow did not upload, so a
  // CI failure arrived as a bare "element(s) not found". Both halves are fixed — the
  // workflow now uploads that folder, and this throw carries the state of the page
  // into the log, which is the half that survives even when artifacts don't.
  try {
    await expect(page.locator('.hub')).toBeVisible({ timeout: 30_000 })
  } catch (err) {
    const diag = await page
      .evaluate(async () => ({
        url: location.href,
        title: document.title,
        controlled: navigator.serviceWorker.controller !== null,
        rootChildren: document.getElementById('root')?.childElementCount ?? -1,
        bodyText: (document.body?.innerText ?? '(no body)').replace(/\s+/g, ' ').slice(0, 300),
        cacheNames: await caches.keys(),
      }))
      .catch((e) => ({ evaluateFailed: String(e).slice(0, 200) }))
    const base = new URL(page.url()).origin
    // Ask the cache ITSELF about the asset that failed. caches.match(req) returning
    // undefined for an entry the install-time check just verified is present is the
    // whole mystery; these four lookups separate the possibilities — a key-shape
    // mismatch (byString hits, byRequest doesn't), a Vary effect (ignoreVary hits
    // where the others don't), or the entry genuinely being gone by now (none hit,
    // and keysSample shows what IS there under that prefix).
    const cacheProbe = await page
      .evaluate(async (paths: string[]) => {
        const name = (await caches.keys()).find((k) => k.startsWith('babillard-') && k !== 'babillard-share')
        if (!name) return { noCache: true }
        const c = await caches.open(name)
        const keys = (await c.keys()).map((r) => r.url)
        const out: Record<string, unknown> = { cache: name, entries: keys.length }
        for (const p of paths) {
          const abs = new URL(p, location.origin).href
          const stored = await c.match(abs, { ignoreVary: true })
          out[p] = {
            byString: !!(await c.match(abs)),
            byRequest: !!(await c.match(new Request(abs))),
            ignoreVary: !!stored,
            vary: stored?.headers.get('vary') ?? null,
            contentType: stored?.headers.get('content-type') ?? null,
            inKeys: keys.includes(abs),
          }
        }
        out.keysSample = keys.filter((u) => u.includes('/assets/index-')).slice(0, 5)
        return out
      }, failed.map((f) => new URL(f.url)).filter((u) => u.origin === base).map((u) => u.pathname))
      .catch((e) => ({ probeFailed: String(e).slice(0, 200) }))

    // Cross-reference every failed request against what this build promised to
    // precache — that single column is what turns "something 504'd" into a cause.
    const promisedSet = new Set(promised ?? [])
    const failures = failed.slice(0, 12).map((f) => {
      const path = (() => {
        try {
          return new URL(f.url).pathname
        } catch {
          return f.url
        }
      })()
      return `${f.status} ${f.statusText || ''} ${path} ${promisedSet.has(path) ? '[PRECACHED]' : '[not in precache]'}`
    })
    throw new Error(
      'offline reboot never rendered .hub\n' +
        'page: ' + JSON.stringify(diag, null, 2) + '\n' +
        'failed requests: ' + JSON.stringify(failures, null, 2) + '\n' +
        'cache probe: ' + JSON.stringify(cacheProbe, null, 2) + '\n' +
        'precache held ' + (promised?.length ?? 0) + ' entries\n' +
        'console: ' + JSON.stringify(consoleErrors.slice(0, 8), null, 2) + '\n' +
        (err as Error).message,
    )
  }
  // Still SW-controlled after the offline reboot (the shell came from cache, not a
  // live server round-trip).
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)

  await page.context().setOffline(false)
})

// The retry that install() gained with SW_POLICY v3. A precache write can fail
// transiently — a blip mid-install, a loaded server refusing one connection — and
// the old code swallowed that (allSettled) and activated anyway, leaving a shell
// THE REGRESSION GUARD for the blank-board bug. A cached response that carries Vary
// must still be SERVED.
//
// The mechanism, finally named: the preview/origin sends **Vary: Origin** on assets
// (read straight off the stored response — see the "[sw] entry module as stored" line
// the reboot case logs). cacheOne() stores with c.put(url, res), a bare string URL,
// so the STORED request has no Origin header; a <script type="module"> is fetched
// with CORS semantics and DOES send one. The Cache Query algorithm compares that
// header, finds them different, and reports no match for an entry sitting right
// there — so the SW fell through to fetch(), which offline answered its own 504, and
// React never mounted.
//
// Two honest corrections to what this comment used to say. It first claimed Vary was
// NOT the cause: that conclusion came from a version of this test using
// Accept-Encoding, a forbidden header name added below the Cache API and therefore
// absent from both sides of the comparison — the wrong header, so a true hypothesis
// looked false. And { ignoreVary: true } was labelled "hardening, not a fix": after
// it, the reboot case went 20/20 on the Linux runner where it had been failing ~50%
// of the time (workflow "SW offline repro"). It is the fix.
test('a precached response carrying Vary is still served offline', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })
  await page.goto('/board')
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 20_000 })

  // Re-store one real precached asset with the header a compressing origin adds.
  // Same URL, same bytes — only the Vary header is new, which is the whole point.
  const target = await page.evaluate(async () => {
    const name = (await caches.keys()).find((k) => k.startsWith('babillard-') && k !== 'babillard-share')
    if (!name) return null
    const cache = await caches.open(name)
    const keys = await cache.keys()
    const entry = keys.find((r) => /\/assets\/index-[^/]*\.js$/.test(r.url)) ?? keys.find((r) => r.url.endsWith('.js'))
    if (!entry) return null
    const stored = await cache.match(entry)
    if (!stored) return null
    const body = await stored.text()
    const headers = new Headers(stored.headers)
    headers.set('Vary', 'Origin')
    await cache.put(entry.url, new Response(body, { status: 200, headers }))
    return { url: entry.url, bytes: body.length }
  })
  expect(target, 'a hashed JS entry to re-store').not.toBeNull()
  expect(target!.bytes, 'the re-stored asset has a real body').toBeGreaterThan(0)

  // Offline, ask for it exactly as the page would. Before the fix this answered 504
  // (a cache miss, then a dead network); it must answer the cached bytes.
  await page.context().setOffline(true)
  const got = await page.evaluate(async (url) => {
    const res = await fetch(url)
    return { status: res.status, length: (await res.text()).length }
  }, target!.url)
  await page.context().setOffline(false)

  expect(got.status, 'a Vary: Origin precached asset must not 504 offline').toBe(200)
  expect(got.length, 'and it must come back with its body, not an empty 504 shell').toBe(target!.bytes)
})

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

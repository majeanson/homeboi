import { test, expect, type ConsoleMessage, type Page, type Request } from '@playwright/test'
import { BASE_URL } from './stranger.config'

// THE STRANGER'S WALK, against the deployed app (`npm run e2e:stranger`, weekly).
//
// A first-time visitor: the marketing door, « Essayer pour vrai », the six tabs, one
// real write, the ＋ sheet, the claim form. No stubs — this is the only harness that
// can see what a stranger sees. Every step is timed and every failed request and
// console error is collected; the assertions are about the things a stubbed spec
// cannot reach:
//
//   1. nothing our own API answers 4xx/5xx on the whole walk;
//   2. no console error anywhere (the marketing page's credential-less socket was
//      exactly this, a 401 handshake every few seconds in a visitor's console);
//   3. the demo lands on a BOARD a stranger can leave — the first walk could not get
//      past the first screen (the tour re-launched on every load and pulled the router
//      back), on both profiles;
//   4. each step's content appears inside a human budget.
//
// The walk WRITES when it gets a sandbox: one 24 h household, one list item. Past
// DEMO_SANDBOX_CAP the demo hands out the read-only link instead, and the walk checks
// THAT promise instead (it says it is read-only; it grows no ＋). The nightly sweep
// removes the sandbox (functions/_lib/nightly.ts).

const SLOW_MS = 20_000

interface Trouble {
  badRequests: string[]
  consoleErrors: string[]
}

function watch(page: Page): Trouble {
  const t: Trouble = { badRequests: [], consoleErrors: [] }
  // OUR API only: `/cdn-cgi/*` is Cloudflare's own edge (the RUM beacon), same origin
  // but not ours to answer for.
  const ours = (url: string) => new URL(url).origin === new URL(BASE_URL).origin && !new URL(url).pathname.startsWith('/cdn-cgi/')
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() !== 'error') return
    const text = m.text()
    // Not the app's to answer for: a cold cache's font/favicon chatter, and Chromium
    // telling us it does not know the `interactive-widget` viewport key — a real key on
    // newer Chrome, set deliberately (index.html says why). Everything else IS ours:
    // this filter caught two real CSP mistakes on its first live night, and widening it
    // past "not ours" is how a walk stops finding things.
    if (/favicon|fonts\.(googleapis|gstatic)|interactive-widget/.test(text)) return
    t.consoleErrors.push(`${page.url()} :: ${text.slice(0, 200)}`)
  })
  page.on('requestfailed', (r: Request) => {
    // A CANCELLED request is the HARNESS, not the app: this walk navigates between tabs
    // while the previous page's polls are still in flight, and the browser drops them.
    // Two wordings for one condition — `net::ERR_ABORTED` on the desktop profile and
    // « Load request cancelled » on the mobile one — which is why the first filter
    // caught only half of it. A real network failure carries any other errorText.
    const err = r.failure()?.errorText ?? ''
    if (ours(r.url()) && !/ERR_ABORTED|cancell?ed/i.test(err)) t.badRequests.push(`FAILED ${r.url().slice(0, 120)} :: ${err}`)
  })
  page.on('response', (r) => {
    if (r.status() >= 400 && ours(r.url())) t.badRequests.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`)
  })
  return t
}

// Land on a step and time it. The name is what a failure prints.
async function step(page: Page, name: string, go: () => Promise<unknown>, content: string) {
  const t0 = Date.now()
  await go()
  await expect(page.locator(content).first(), `${name}: nothing to read`).toBeVisible({ timeout: SLOW_MS })
  const ms = Date.now() - t0
  // Not a performance budget (the cold-start table in STATE §4-K wave 2 is that) — a
  // floor under "did it actually arrive", so a hang reads as a hang.
  expect(ms, `${name} took ${ms} ms`).toBeLessThan(SLOW_MS)
  return ms
}

test('a stranger can open the door, try the demo, walk every tab, write once, and reach the claim form', async ({ page }, testInfo) => {
  const trouble = watch(page)
  const times: Record<string, number> = {}

  times.home = await step(page, 'the marketing door', () => page.goto('/', { waitUntil: 'domcontentloaded' }), '.home__cta-demo')

  times.demo = await step(
    page,
    '« Essayer pour vrai » → the board',
    async () => {
      await page.locator('.home__cta-demo').click()
      await page.waitForURL(/\/board/, { timeout: 60_000 })
    },
    '.tour, .wg-slot',
  )

  // A REAL sandbox, or the read-only fallback? `POST /api/demo` mints a throwaway
  // household until DEMO_SANDBOX_CAP is reached, past which it hands out a read-only
  // `showcase` guest link instead (`/board?guest=…`) — a visitor who can look and not
  // touch. The cap only fills when expired sandboxes are not being swept, which is
  // precisely the failure that went unnoticed from migration 0102 to 2026-09-16, so
  // this is worth a red run rather than a quiet skip.
  // WHICH demo did the stranger get? `POST /api/demo` mints a throwaway household until
  // DEMO_SANDBOX_CAP is reached, past which it hands out a read-only `showcase` guest
  // link instead. Read the STORED credential, not the URL: main.tsx moves `?guest=` into
  // localStorage and cleans the address bar, so a URL check reads clean on a fallback
  // too — which is how this walk first passed its own fallback check while the page said
  // « Démo — lecture seule » (2026-09-16).
  //
  // A full cap is NOT a failure here, and the first draft of this spec was wrong to say
  // so: the cap fills legitimately whenever enough people try the demo inside 24 hours —
  // this walk itself mints one per profile per attempt, which is how it started failing
  // against its own footprint. Whether the SWEEP is healthy is a different question with
  // a different instrument: the nightly report counts sandboxes that outlived the TTL
  // and mails when any survived (functions/_lib/nightly.ts), and it has the database to
  // prove it. What this walk owns is what a stranger SEES — so it records the mode and
  // walks whichever one it got, all the way.
  const readOnly = await page.evaluate(() => !!localStorage.getItem('babillard-guest-token'))
  testInfo.annotations.push({ type: 'demo', description: readOnly ? 'read-only fallback (DEMO_SANDBOX_CAP reached)' : 'a real sandbox' })

  // The day-one tour, if it opened: a stranger must be able to put it down.
  const skip = page.locator('.tour').getByRole('button', { name: /Passer|Skip/ })
  if (await skip.count()) {
    await skip.first().click()
    await page.locator('.tour').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
  }
  await expect(page.locator('.wg-slot').first(), 'the board never settled').toBeVisible({ timeout: SLOW_MS })

  // 3 — the first walk died here: no tab could be reached because the tour
  // re-launched on every load and pulled the router back.
  for (const [tab, content] of [
    ['/kitchen', '.kitchen__week, .kitchen__meal-list, .empty-state'],
    ['/liste', '.list-rows, .empty-state'],
    ['/notes', '.cnote, .empty-state, .subtabs'],
    ['/maison', '.routine-card, .cercle-row, .empty-state, .subtabs'],
    ['/settings', '.operator__section, .operator__tabs, .featuremap'],
  ] as const) {
    times[tab] = await step(page, `the ${tab} tab`, () => page.goto(tab, { waitUntil: 'domcontentloaded' }), content)
    expect(new URL(page.url()).pathname, `${tab} bounced somewhere else`).toBe(tab)
  }

  if (readOnly) {
    // The fallback's own promise: a visitor who can look. It must SAY it is read-only
    // rather than offering controls that 403, and it must not grow a ＋ FAB.
    await expect(page.locator('.hub').getByText(/lecture seule|read.only/i).first(), 'the read-only demo never says it is read-only').toBeVisible({ timeout: SLOW_MS })
    await expect(page.locator('.add-fab'), 'the read-only demo offered a ＋ it cannot honour').toHaveCount(0)
  } else {
    // One real write, on the real API.
    const item = `Beurre d’arachide ${Date.now() % 100000}`
    await page.goto('/liste', { waitUntil: 'domcontentloaded' })
    const field = page.getByPlaceholder(/lait|pain|milk|bread/i).first()
    await field.click()
    await field.fill(item)
    await field.press('Enter')
    await expect(page.locator('.list-rows', { hasText: item }).first(), 'the first write never appeared').toBeVisible({ timeout: SLOW_MS })

    // The ＋ sheet and the claim form — the two doors the demo exists to reach.
    await page.goto('/board', { waitUntil: 'domcontentloaded' })
    await page.locator('.wg-slot').first().waitFor({ timeout: SLOW_MS })
    // `.sheet.show` is the OPEN state — `.sheet` alone is in the DOM while closed, which
    // is why a bare `.sheet` read as « never opened » (the repo's own specs use `.show`).
    await page.locator('.add-fab').click()
    await expect(page.locator('.sheet.show').first(), 'the ＋ sheet never opened').toBeVisible({ timeout: SLOW_MS })
    await page.keyboard.press('Escape')
  }

  times.claim = await step(page, '« Garder ma maisonnée »', () => page.goto('/garder', { waitUntil: 'domcontentloaded' }), 'form, .scene, h1')

  await testInfo.attach('walk-timings.json', { body: JSON.stringify(times, null, 2), contentType: 'application/json' })
  await testInfo.attach('walk-end.png', { body: await page.screenshot({ fullPage: false }), contentType: 'image/png' })

  // 1 + 2 — last, so a failure above names the step rather than the symptom.
  expect(trouble.badRequests, 'our own API answered 4xx/5xx during the walk').toEqual([])
  expect(trouble.consoleErrors, 'the visitor’s console carried errors').toEqual([])
})

test('the signed-out door opens no household socket and asks for no credential', async ({ page }) => {
  // The second walk's finding: the marketing page connected /api/live with nothing to
  // authenticate, so a visitor's console filled with 401 handshakes every few seconds,
  // forever. A stubbed spec pins the count (e2e/stranger-quiet.spec.ts); this one
  // watches the REAL deployment do it.
  const sockets: string[] = []
  page.on('websocket', (ws) => sockets.push(ws.url()))
  const trouble = watch(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.home__cta-demo')).toBeVisible({ timeout: SLOW_MS })
  await page.waitForTimeout(6_000) // past the first reconnect window
  expect(sockets.filter((u) => u.includes('/api/live')), 'the signed-out door opened a household socket').toEqual([])
  expect(trouble.badRequests, 'the signed-out door got a 4xx').toEqual([])
})

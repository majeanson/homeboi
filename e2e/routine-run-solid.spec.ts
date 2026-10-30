import { test, expect, type Page, type Locator } from '@playwright/test'
import { mockApi, seedState } from './mocks'
import { boxOf } from './measure'

// The toddler routine run, hardened. Two things were reported from the wall tablet:
//
//   1. « advancing steps doesn't work properly if you go too fast » — the ✓ was painted
//      after an `await`, so two taps landing before a render both read the SAME current
//      step; a poll that left before the tap could land after it and un-tick the step; the
//      ▶ and the → share one spot so a double-tap on ▶ ticked step one unseen.
//   2. « stuck, can't scroll, when the wall is too big » — the sticker wall's body was a
//      flex child of a fixed 100dvh scene with no overflow of its own, so a wall holding
//      more stickers than one screen simply ran off the bottom.
//
// Unlike the other routine specs (static mock, so the player is judged against a server
// that never changes), this one stands up a tiny STATEFUL routines server in the route
// handler — a Set per run, like functions/api/routines.ts — so a race between a tap, a
// PATCH and a poll can actually be lost, and the assertions say who won.

const DECK = [
  { icon: '👕', label: 'Habille-toi', narration: "C'est l'heure de s'habiller" },
  { icon: '🥞', label: 'Déjeuner' },
  { icon: '🪥', label: 'Brosse tes dents', seconds: 120 },
]

// Fourteen steps with the kind of label a parent actually types.
const LONG_DECK = Array.from({ length: 14 }, (_, i) => ({
  icon: ['🛏️', '🚽', '🧼', '🪥', '👕', '🧦', '👟', '🥣', '🧃', '🎒', '🧥', '🧤', '🚗', '👋'][i],
  label: `Étape numéro ${i + 1} : une consigne assez longue pour passer à la ligne`,
}))

type Card = { icon: string; label: string; narration?: string; seconds?: number }

interface Server {
  state: { doneIdx: number[]; timers: Record<number, unknown> }
  patches: Array<Record<string, unknown>>
}

// A one-routine stateful server. `getDelayMs` holds a GET's answer back AFTER it snapshots the
// state — the shape of a poll that left before a tap and lands after it. `patchDelayMs` is a
// slow write.
async function serve(
  page: Page,
  opts: { cards?: Card[]; doneIdx?: number[]; getDelayMs?: number; patchDelayMs?: number; timers?: Record<number, unknown>; second?: boolean } = {},
): Promise<Server> {
  const server: Server = { state: { doneIdx: opts.doneIdx ?? [], timers: opts.timers ?? {} }, patches: [] }
  let getDelay = opts.getDelayMs ?? 0
  await page.route('**/api/routines**', async (route) => {
    const req = route.request()
    if (new URL(req.url()).pathname !== '/api/routines') return route.fallback()
    if (req.method() === 'GET') {
      const snap = {
        routines: [
          {
            id: 'rx',
            name: 'Matin',
            memberName: 'Léa',
            memberId: 'm3',
            color: '#88A36F',
            avatarPhoto: null,
            timeOfDay: 'morning',
            companion: 'fox',
            cards: opts.cards ?? DECK,
            doneIdx: [...server.state.doneIdx],
            timers: { ...server.state.timers },
          },
        ],
      }
      // A second routine, so the kiosk has a face picker to drift back to.
      if (opts.second) snap.routines.push({ ...snap.routines[0], id: 'ry', name: 'Dodo', memberName: 'Noah', memberId: 'm4', doneIdx: [], timers: {} })
      if (getDelay) await new Promise((r) => setTimeout(r, getDelay))
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snap) })
    }
    if (req.method() === 'PATCH') {
      const body = req.postDataJSON() as { cardIdx?: number; done?: boolean; reset?: boolean; timer?: unknown }
      server.patches.push(body)
      if (opts.patchDelayMs) await new Promise((r) => setTimeout(r, opts.patchDelayMs))
      if (body.reset) server.state = { doneIdx: [], timers: {} }
      else if (typeof body.cardIdx === 'number' && body.timer !== undefined) {
        if (body.timer === null) delete server.state.timers[body.cardIdx]
        else server.state.timers[body.cardIdx] = body.timer
      } else if (typeof body.cardIdx === 'number') {
        const set = new Set(server.state.doneIdx)
        if (body.done === false) set.delete(body.cardIdx)
        else set.add(body.cardIdx)
        server.state.doneIdx = [...set]
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ doneIdx: server.state.doneIdx }) })
    }
    return route.fallback()
  })
  return server
}

async function open(
  page: Page,
  opts: Parameters<typeof serve>[1] & { surface?: 'kiosk' | 'mobile'; audience?: 'toddler' | 'parent'; calm?: boolean } = {},
) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  const server = await serve(page, opts)
  await seedState(page, {
    theme: 'day',
    audience: opts.audience ?? 'toddler',
    lang: 'fr',
    surface: opts.surface ?? 'kiosk',
    calm: opts.calm ?? true,
  })
  await page.goto('/routine/rx/run')
  await expect(page.locator('.tdl-what, .tdl-recap').first()).toBeVisible()
  return server
}

const checks = (page: Page) => page.locator('.tdl-strip .tdl-step__check')
// The → / ✓ / ▶ come to rest (aria-disabled) for a moment after committing.
const ready = (l: Locator) => expect(l).not.toHaveAttribute('aria-disabled', 'true')

// ── 1. Going too fast ─────────────────────────────────────────────────────────

test('a burst of taps on → in ONE task ticks exactly one step', async ({ page }) => {
  const server = await open(page)
  await page.locator('.tdl-start').click()
  const next = page.locator('.tdl-finish')
  await expect(next).toBeVisible()
  await ready(next)

  // Six clicks inside a single task: the render between them never happens. This is a cheap
  // tablet that was busy for 300 ms and then delivered the queued taps in a lump.
  await page.evaluate(() => {
    const b = document.querySelector('.tdl-finish') as HTMLButtonElement
    for (let i = 0; i < 6; i++) b.click()
  })
  await expect.poll(() => server.state.doneIdx).toEqual([0])
  await expect(checks(page)).toHaveCount(1)
  // Not « finished »: the story is on step 2 and the recap isn't up.
  await expect(page.locator('.tdl-recap')).toHaveCount(0)
  await expect(page.locator('.tdl-what')).toHaveText('Déjeuner')
})

test('a double-tap on ▶ does not tick step one — the → takes its place under the finger', async ({ page }) => {
  const server = await open(page)
  const start = page.locator('.tdl-start')
  const box = await boxOf(start)
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  // A real double-click at the ▶'s coordinates: the second click lands on whatever is there
  // by then — the → button, in the same spot.
  await page.mouse.dblclick(x, y)
  await page.waitForTimeout(400)
  expect(server.patches.filter((p) => p.done === true)).toHaveLength(0)
  await expect(checks(page)).toHaveCount(0)
  await expect(page.locator('.tdl-timer')).toBeVisible() // it did start
})

test('a deliberate next tap is never made to wait longer than the rest', async ({ page }) => {
  const server = await open(page)
  await page.locator('.tdl-start').click()
  // Playwright waits out aria-disabled, so these are « tap when it looks ready » taps.
  await page.locator('.tdl-finish').click()
  await page.locator('.tdl-finish').click()
  await expect.poll(() => server.state.doneIdx.sort()).toEqual([0, 1])
  await page.locator('.tdl-finish').click() // ✓ on the last
  await expect(page.locator('.tdl-recap')).toBeVisible()
  expect(server.state.doneIdx.sort()).toEqual([0, 1, 2])
})

test('← then → in a flurry leaves the story consistent: no tick behind a gap', async ({ page }) => {
  const server = await open(page, { doneIdx: [0, 1] })
  await page.locator('.tdl-start').click() // « Continuer » — on step 3
  await ready(page.locator('.tdl-finish'))
  await page.evaluate(() => {
    ;(document.querySelector('.tdl-prev') as HTMLButtonElement).click()
    ;(document.querySelector('.tdl-finish') as HTMLButtonElement)?.click()
  })
  await page.waitForTimeout(300)
  // ← rewound step 2 and the same-instant → was swallowed by the rest — so [0] and the story
  // is on step 2, never [0, 2] with step 1 unticked and the screen on 1 «done» for nobody.
  expect(server.state.doneIdx.sort()).toEqual([0])
  await expect(page.locator('.tdl-what')).toHaveText('Déjeuner')
})

test('a poll that leaves AFTER the tap but BEFORE the slow write lands does not un-tick the step', async ({ page }) => {
  // The write takes 700 ms to reach the server; a poll sent in that window snapshots the
  // OLD state and (400 ms later) answers with it — the ✓ blinked out, and the story stepped
  // backwards under the finger about to tap → again. (A poll already in the air at tap time
  // is cancelled by the standard rule; THIS one is the one nothing used to stop.)
  const server = await open(page, { getDelayMs: 400, patchDelayMs: 700 })
  await page.locator('.tdl-start').click()
  await ready(page.locator('.tdl-finish'))

  await page.locator('.tdl-finish').click()
  await expect(checks(page)).toHaveCount(1)
  // TanStack's focusManager listens on WINDOW (a document-targeted event doesn't bubble to it).
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange'))) // poll leaves now

  // Sample across the window in which the stale poll lands and the slow PATCH completes: the
  // ✓ must never blink out and the story must never step backwards.
  const seen: number[] = []
  for (let i = 0; i < 24; i++) {
    seen.push(await checks(page).count())
    await page.waitForTimeout(100)
  }
  expect(Math.min(...seen)).toBe(1)
  await expect(page.locator('.tdl-what')).toHaveText('Déjeuner')
  await expect.poll(() => server.state.doneIdx).toEqual([0])
})

test('stale or duplicated ticks in the stored run never read as « finished »', async ({ page }) => {
  // [1, 1] on a three-step deck (a double write that outlived its poll) and a stale index
  // from a longer deck: neither is a complete routine, and step 1 is still to do.
  await open(page, { doneIdx: [1, 1, 5, 9] })
  await expect(page.locator('.tdl-recap')).toHaveCount(0)
  await expect(page.locator('.tdl-what')).toHaveText('Habille-toi')
  await expect(checks(page)).toHaveCount(1)
})

test('« Recommencer » clears the run on the server and puts the story back on step one', async ({ page }) => {
  const server = await open(page, { doneIdx: [0, 1, 2] })
  const again = page.locator('.tdl-again')
  await expect(again).toBeEnabled({ timeout: 4000 })
  await again.click()
  await expect.poll(() => server.state.doneIdx).toEqual([])
  await expect(page.locator('.tdl-what')).toHaveText('Habille-toi')
  await expect(checks(page)).toHaveCount(0)
})

test('a refused tick (500) puts the step back instead of leaving a ✓ the household never got', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  const server = await serve(page)
  await page.route('**/api/routines', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) })
      : route.fallback(),
  )
  await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', surface: 'kiosk', calm: true })
  await page.goto('/routine/rx/run')
  await page.locator('.tdl-start').click()
  await ready(page.locator('.tdl-finish'))
  await page.locator('.tdl-finish').click()
  // Painted at once, then corrected by the refetch the failed write triggers.
  await expect(checks(page)).toHaveCount(0, { timeout: 6000 })
  expect(server.state.doneIdx).toEqual([])
})

test('a read-only guest can hear steps but never commits one', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, { signedIn: false })
  const server = await serve(page)
  await page.route('**/api/guest/whoami**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'showcase' }) }),
  )
  await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', surface: 'kiosk' })
  await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
  await page.goto('/routine/rx/run')
  await expect(page.locator('.tdl-what')).toBeVisible()
  await expect(page.locator('.tdl-start, .tdl-finish, .tdl-prev')).toHaveCount(0)
  await page.locator('.tdl-illus--tap').click()
  await page.locator('.tdl-strip .tdl-step').nth(2).click()
  await page.waitForTimeout(300)
  expect(server.patches).toHaveLength(0)
  await expect(checks(page)).toHaveCount(0)
})

// ── 2. The kiosk's drift back to the picker ───────────────────────────────────

test.describe('the kiosk’s « nobody is here » drift', () => {
  async function kiosk(page: Page, timers: Record<number, unknown>) {
    await page.clock.install()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await serve(page, { timers, second: true })
    await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', surface: 'kiosk' })
    await page.goto('/maison')
    await page.locator('.kid__face', { hasText: 'Léa' }).click()
    await expect(page.locator('.tdl-what')).toBeVisible()
  }

  test('drifts back to the faces after a minute of nothing…', async ({ page }) => {
    await kiosk(page, {})
    await page.clock.fastForward(61_000)
    await expect(page.locator('.kid__faces')).toBeVisible()
  })

  test('…but not while the step’s countdown is running (two minutes of tooth-brushing, no taps)', async ({ page }) => {
    // The step the run is on is index 0 — put a LIVE timer on it, ending well past the minute.
    const endsAt = Math.floor(Date.now() / 1000) + 600
    await kiosk(page, { 0: { endsAt } })
    await page.clock.fastForward(61_000)
    await expect(page.locator('.tdl-what')).toBeVisible()
    await expect(page.locator('.kid__faces')).toHaveCount(0)
  })
})

// ── 3. Reachable on every screen: never stuck, never clipped ─────────────────

const SIZES = [
  { name: 'small phone', w: 320, h: 568 },
  { name: 'phone', w: 390, h: 844 },
  { name: 'phone, landscape', w: 844, h: 390 },
  { name: 'tiny landscape', w: 568, h: 320 },
  { name: 'tablet', w: 768, h: 1024 },
  { name: 'kiosk', w: 1280, h: 800 },
  { name: 'wall', w: 1920, h: 1080 },
  { name: 'big wall', w: 3840, h: 2160 },
]

// The control is fully inside the viewport once scrolled to, and nothing sits on top of it.
async function reachable(page: Page, l: Locator, what: string) {
  await l.scrollIntoViewIfNeeded()
  const r = await boxOf(l)
  const vp = page.viewportSize()!
  expect(r.y, `${what}: top edge`).toBeGreaterThanOrEqual(-1)
  expect(r.y + r.height, `${what}: bottom edge (page can't scroll to it?)`).toBeLessThanOrEqual(vp.height + 1)
  expect(r.x, `${what}: left edge`).toBeGreaterThanOrEqual(-1)
  expect(r.x + r.width, `${what}: right edge`).toBeLessThanOrEqual(vp.width + 1)
  const covered = await l.evaluate((el) => {
    const b = el.getBoundingClientRect()
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
    return !(hit && (el === hit || el.contains(hit)))
  })
  expect(covered, `${what}: something is on top of it`).toBe(false)
}

// Anything in the run that bleeds past the sides of the screen.
async function offenders(page: Page) {
  return page.evaluate(() => {
    const w = window.innerWidth
    const out: string[] = []
    document.querySelectorAll('.tdl-top *, .tdl-stage *').forEach((el) => {
      const b = el.getBoundingClientRect()
      if (b.width === 0 || b.height === 0) return
      if (getComputedStyle(el).position === 'fixed') return
      if (b.right > w + 1 || b.left < -1) out.push(`${el.className || el.tagName} ${Math.round(b.left)}→${Math.round(b.right)} of ${w}`)
    })
    return out
  })
}

for (const size of SIZES) {
  for (const deck of [
    { name: '3 steps + countdown', cards: DECK },
    { name: '14 long steps', cards: LONG_DECK },
  ]) {
    test(`${size.name} ${size.w}×${size.h} · ${deck.name}: ▶ and → can always be reached and pressed`, async ({ page }) => {
      await page.setViewportSize({ width: size.w, height: size.h })
      const server = await open(page, { cards: deck.cards, surface: size.w < 600 ? 'mobile' : 'kiosk' })
      await reachable(page, page.locator('.tdl-exit'), 'exit')
      await reachable(page, page.locator('.tdl-start'), '▶')
      expect(await offenders(page)).toEqual([])
      await page.locator('.tdl-start').click()
      await reachable(page, page.locator('.tdl-finish'), '→')
      await page.locator('.tdl-finish').click()
      await expect.poll(() => server.state.doneIdx).toEqual([0])
    })

    test(`${size.name} ${size.w}×${size.h} · ${deck.name}: the finish screen scrolls to « Recommencer » and the sticker offer`, async ({ page }) => {
      await page.setViewportSize({ width: size.w, height: size.h })
      await open(page, {
        cards: deck.cards,
        doneIdx: deck.cards.map((_, i) => i),
        surface: size.w < 600 ? 'mobile' : 'kiosk',
        calm: false, // the sticker grid is the tallest thing the finish screen can show
      })
      await expect(page.locator('.tdl-recap')).toBeVisible()
      await reachable(page, page.locator('.tdl-sticker__opt').last(), 'last sticker')
      await reachable(page, page.locator('.tdl-again'), 'Recommencer')
      expect(await offenders(page)).toEqual([])
    })
  }
}

// ── 4. The sticker wall: a wall bigger than the screen scrolls ───────────────

for (const size of [
  { name: 'phone', w: 390, h: 700 },
  { name: 'phone, landscape', w: 844, h: 390 },
  { name: 'kiosk', w: 1280, h: 720 },
]) {
  test(`sticker wall · ${size.name}: 150 stickers scroll, and the last one is reachable`, async ({ page }) => {
    await page.setViewportSize({ width: size.w, height: size.h })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    const glyphs = ['⭐', '🌈', '🦄', '🚀', '🍓', '🐢', '🌻', '🎈']
    const stickers = Array.from({ length: 150 }, (_, i) => ({
      id: `st${i}`,
      memberId: i % 3 === 0 ? 'm3' : i % 3 === 1 ? 'm4' : null,
      sticker: glyphs[i % glyphs.length],
      routineId: null,
      createdAt: 1_749_369_600 + i,
    }))
    await page.route('**/api/routine-stickers**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stickers }) }),
    )
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: size.w < 600 ? 'mobile' : 'kiosk', calm: false })
    await page.goto('/routine/stickers')
    const wall = page.locator('.sticker-wall')
    await expect(page.locator('.sticker-wall__cell')).toHaveCount(150)

    // It is its own scroller: taller than the box it lives in…
    const m = await wall.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight, oy: getComputedStyle(el).overflowY }))
    expect(m.sh).toBeGreaterThan(m.ch)
    expect(m.oy).toBe('auto')

    // …and the last sticker can be brought on screen, with the scene head still pinned.
    const last = page.locator('.sticker-wall__cell').last()
    await last.scrollIntoViewIfNeeded()
    const r = await boxOf(last)
    expect(r.y + r.height).toBeLessThanOrEqual(size.h + 1)
    expect(r.y).toBeGreaterThanOrEqual(0)
    await expect(page.locator('.scene__head')).toBeInViewport()
  })
}

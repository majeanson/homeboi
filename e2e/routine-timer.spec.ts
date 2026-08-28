import { test, expect, type Page, type Request } from '@playwright/test'
import { mockApi, seedState, ROUTES } from './mocks'

// The per-step countdown inside a routine (« brosse tes dents 2 minutes »): the most
// intricate logic in the routine player and, until now, the least covered — the
// fixture carried no card with `seconds`, so the ring never rendered in any run.
//
// What makes it worth a spec rather than a screenshot: the remaining time is DERIVED
// from the wall clock, never counted down in a variable. A browser suspends
// setInterval in a backgrounded tab, so a `-1`-per-tick timer would silently stall
// while the tablet sleeps and come back minutes behind. The persisted shape encodes
// that: a RUNNING timer stores `{endsAt}` (an absolute second — reopening recomputes
// the truth) and a PAUSED one stores `{left}` (a duration, since no clock is running).
// Every assertion below is really about that distinction holding.
//
// Calm, and asserted as such: at zero it chimes and shows a ✓, but it NEVER advances
// the story or nags — the child still taps → themselves.

const isRoutinePatch = (r: Request) =>
  r.method() === 'PATCH' && new URL(r.url()).pathname === '/api/routines'

// r1 « Matin » with a timer on the card the run OPENS on. The fixture's doneIdx is
// [0], so the current card is index 1 — put the 2-minute timer there and the ring is
// on screen the moment the scene loads, with no walking to reach it.
function routinesWithTimer(over: { timers?: Record<number, unknown> } = {}) {
  const base = ROUTES.routines as { routines: Record<string, unknown>[] }
  const [r1, ...rest] = base.routines
  const cards = (r1.cards as Record<string, unknown>[]).map((c, i) =>
    i === 1 ? { ...c, seconds: 120 } : c,
  )
  return { routines: [{ ...r1, cards, ...over }, ...rest] }
}

async function openRun(page: Page, over?: { timers?: Record<number, unknown> }) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, { overrides: { routines: routinesWithTimer(over) } })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/routine/r1/run')
  await expect(page.locator('.tdl-what')).toBeVisible()
}

test('a card without a timer shows no ring — the countdown is opt-in per step', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page) // the plain fixture: no card carries `seconds`
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/routine/r1/run')
  await expect(page.locator('.tdl-what')).toBeVisible()
  await expect(page.locator('.tdl-countdown')).toHaveCount(0)
})

test('tapping the ring starts it: an absolute endsAt is persisted and the clock counts down', async ({ page }) => {
  await openRun(page)

  const ring = page.locator('.tdl-countdown')
  await expect(ring).toBeVisible()
  // At rest it shows the FULL duration and is not yet running.
  await expect(ring.locator('.tdl-countdown__time')).toHaveText('2:00')
  await expect(ring).not.toHaveClass(/is-running/)

  const [req] = await Promise.all([page.waitForRequest(isRoutinePatch), ring.click()])
  const body = req.postDataJSON() as { routineId: string; cardIdx: number; timer: { endsAt?: number } }
  expect(body.routineId).toBe('r1')
  expect(body.cardIdx).toBe(1) // the CURRENT card, not the first
  // A running timer banks an ABSOLUTE end second, not a remaining duration — that's
  // what survives the tablet sleeping through half of it.
  expect(typeof body.timer.endsAt).toBe('number')
  expect(body.timer.endsAt! - Math.floor(Date.now() / 1000)).toBeGreaterThan(100)

  await expect(ring).toHaveClass(/is-running/)
  // It ticks down off the clock: within a couple of seconds it's below the start.
  await expect(ring.locator('.tdl-countdown__time')).not.toHaveText('2:00', { timeout: 4000 })
})

test('tapping again pauses it: the REMAINING time is banked as a duration, not an end time', async ({ page }) => {
  await openRun(page)
  const ring = page.locator('.tdl-countdown')
  await ring.click()
  await expect(ring).toHaveClass(/is-running/)

  const [req] = await Promise.all([page.waitForRequest(isRoutinePatch), ring.click()])
  const body = req.postDataJSON() as { timer: { left?: number; endsAt?: number } }
  // Paused = `{left}`. No clock is running, so an absolute endsAt would keep
  // "counting" while paused and come back at zero.
  expect(typeof body.timer.left).toBe('number')
  expect(body.timer.endsAt).toBeUndefined()
  expect(body.timer.left).toBeGreaterThan(0)
  expect(body.timer.left).toBeLessThanOrEqual(120)
  await expect(ring).not.toHaveClass(/is-running/)
})

test('a paused timer reopens at its banked remaining, not at the full duration', async ({ page }) => {
  // The whole point of persisting: leave the app mid-step, come back to the truth.
  await openRun(page, { timers: { 1: { left: 45 } } })
  const ring = page.locator('.tdl-countdown')
  await expect(ring.locator('.tdl-countdown__time')).toHaveText('0:45')
  await expect(ring).not.toHaveClass(/is-running/)

  // Resuming from a pause starts a NEW window from the banked remaining — not a
  // fresh 2:00, and not the stale endsAt of some earlier run.
  const [req] = await Promise.all([page.waitForRequest(isRoutinePatch), ring.click()])
  const { timer } = req.postDataJSON() as { timer: { endsAt: number } }
  const remaining = timer.endsAt - Math.floor(Date.now() / 1000)
  expect(remaining).toBeGreaterThan(40)
  expect(remaining).toBeLessThanOrEqual(46)
})

test('a timer that ran out while the app was away shows ✓ — and never advances the story by itself', async ({ page }) => {
  // endsAt in the past = it finished while nobody was looking. It must read as done
  // WITHOUT having chimed (no live running→zero edge happened) and, above all,
  // without ticking the step: the child still taps → themselves (NFR-CALM).
  const past = Math.floor(Date.now() / 1000) - 30
  await openRun(page, { timers: { 1: { endsAt: past } } })

  const ring = page.locator('.tdl-countdown')
  await expect(ring).toHaveClass(/is-done/)
  await expect(ring).not.toHaveClass(/is-running/)
  // The step it belongs to is still the CURRENT one — a finished timer is not a ✓
  // on the step, and the run hasn't moved on.
  await expect(page.locator('.tdl-what')).toHaveText('Déjeuner')
  await expect(page.locator('.tdl-strip .tdl-step').nth(1).locator('.tdl-step__check')).toHaveCount(0)

  // Tapping a finished ring restarts it from the full duration.
  const [req] = await Promise.all([page.waitForRequest(isRoutinePatch), ring.click()])
  const { timer } = req.postDataJSON() as { timer: { endsAt: number } }
  expect(timer.endsAt - Math.floor(Date.now() / 1000)).toBeGreaterThan(100)
})

test('a read-only guest can run the timer locally but never writes it to the household', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, { signedIn: false, overrides: { routines: routinesWithTimer() } })
  // A link guest — the babysitter running bedtime. Same boot as guest-settings.spec:
  // `whoami` resolves the share-mode, the token makes isGuest() true client-side.
  await page.route('**/api/guest/whoami**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'showcase' }) }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
  await page.goto('/routine/r1/run')
  await expect(page.locator('.tdl-what')).toBeVisible()

  let patched = false
  page.on('request', (r) => {
    if (isRoutinePatch(r)) patched = true
  })

  const ring = page.locator('.tdl-countdown')
  await expect(ring).toBeVisible() // the babysitter still gets a working timer…
  await ring.click()
  await expect(ring).toHaveClass(/is-running/)
  await page.waitForTimeout(300)
  expect(patched).toBe(false) // …but nothing of theirs lands in the household's day
})

// ---- One live number per surface (Marc, 2026-08-28) --------------------------
//
// A step that carries `seconds` renders the Countdown ring AND, just below, the run
// count-up stopwatch — two live numbers on one screen, both changing every second.
// They answer different questions: the ring is "how much longer for THIS step",
// which a pre-reader can act on; the stopwatch is "how long the whole routine has
// taken", which is a parent's metric and means nothing to a four-year-old.
//
// So the audience lens splits them instead of either being dropped. The parent keeps
// both; the toddler surface keeps only the ring. The ✓/→ advance button is NOT gated
// — it is the only way forward, and hiding it would strand the child.

test('the toddler surface shows the step ring but not the run stopwatch', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, { overrides: { routines: routinesWithTimer() } })
  await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', surface: 'kiosk' })
  await page.goto('/routine/r1/run')
  await expect(page.locator('.tdl-what')).toBeVisible()

  // Start the run, which is what mounts the stopwatch row.
  await page.locator('.tdl-start').click()
  await expect(page.locator('.tdl-timer')).toBeVisible()

  // The step ring stays — it is the one a pre-reader can act on.
  await expect(page.locator('.tdl-countdown')).toHaveCount(1)
  // The run count-up goes.
  await expect(page.locator('.tdl-clock')).toHaveCount(0)
  // …but the way forward must remain. Hiding this would strand the child.
  await expect(page.locator('.tdl-timer .tdl-finish')).toBeVisible()
})

test('the parent surface keeps both numbers', async ({ page }) => {
  // The other side, so "hide the stopwatch" can't quietly become "drop it".
  await openRun(page)
  await page.locator('.tdl-start').click()
  await expect(page.locator('.tdl-countdown')).toHaveCount(1)
  await expect(page.locator('.tdl-clock')).toBeVisible()
})

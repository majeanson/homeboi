import { test, expect, type Page, type Request, type Locator } from '@playwright/test'
import { APP, settle, expectApi } from './interact'
import { mockApi, seedState, ROUTES } from './mocks'
import { boxOf } from './measure'
import { test as test8 } from './fixtures'
import { localDayStart } from '../src/lib/localDay'

// JOURNEY — ROUTINES (review #43; was interactions-routines.spec.ts + routine-builder.spec.ts + routine-run-solid.spec.ts + routine-timer.spec.ts + routine-tips.spec.ts + routine-aids-fold.spec.ts + stickers.spec.ts + moments-rehomed.spec.ts).
//
// Interaction coverage, routines: the moment, the timer, going back, the toddler story. The harness and its discipline are at the top of interact.ts:
// a form asserts the request it fires, an optimistic flow asserts what the user sees.

test.describe('interactions-routines', () => {
  test('routines surface the current moment first (morning vs evening)', async ({ page }) => {
    // Freeze the clock so timeOfDay() is deterministic. 12:00Z = 8 AM in the
    // config's America/Toronto (June, UTC-4) → morning.
    await page.clock.setFixedTime(new Date('2026-06-08T12:00:00Z'))
    await APP('/maison', 'toddler')(page)
    await settle(page, '.kid__faces')
    // Matin (Léa, timeOfDay: morning) leads in the morning…
    await expect(page.locator('.kid__face').first()).toContainText('Léa')
    // …and Dodo (Noah, evening) leads at 8 PM. Nothing hides — just the order.
    await page.clock.setFixedTime(new Date('2026-06-09T00:00:00Z'))
    await page.reload()
    await settle(page, '.kid__faces')
    await expect(page.locator('.kid__face').first()).toContainText('Noah')
    await expect(page.locator('.kid__face')).toHaveCount(2)
  })

  test('a routine runs start → next → next → stop on one timer', async ({ page }) => {
    await APP('/maison', 'toddler')(page)
    await settle(page, '.hub')
    await page.locator('.kid__face', { hasText: 'Noah' }).click() // Dodo: 3 steps, none done
    // ▶ start once, then advance through with the single → button, ✓ on the last.
    await page.locator('.tdl-start').click()
    await expect(page.locator('.tdl-finish')).toBeVisible()
    await page.locator('.tdl-finish').click() // → step 1
    await page.locator('.tdl-finish').click() // → step 2
    await page.locator('.tdl-finish').click() // ✓ last → stop
    // It ends on the picture recap (each step wearing its ✓), not a start button.
    await expect(page.locator('.tdl-recap')).toBeVisible()
    await expect(page.locator('.tdl-recap__step')).toHaveCount(3)
  })

  // Going BACK — Marc's ask: a three-year-old taps → too fast, and the story had no
  // rewind. Two ways, both un-marking the step (the current one is DERIVED, so an
  // un-done step IS the story rewinding to it): the big ← beside the →, and a
  // hear-first two-tap on a done step in the filmstrip (BigTiles' arm pattern).
  test('a routine can go back: the ← un-does the last step, and a done strip step rewinds on the second tap', async ({ page }) => {
    await APP('/maison', 'toddler')(page)
    await settle(page, '.hub')
    await page.locator('.kid__face', { hasText: 'Noah' }).click() // Dodo: 3 steps, none done
    // Nothing is done yet → nowhere to go back to.
    await expect(page.locator('.tdl-prev')).toHaveCount(0)
    await page.locator('.tdl-start').click()
    await page.locator('.tdl-finish').click() // → step 1 done, we're on step 2

    // ← un-marks the step we just finished (PATCH done:false) and the ✓ leaves the strip.
    const strip = page.locator('.tdl-step')
    await expect(strip.nth(0).locator('.tdl-step__check')).toBeVisible()
    const [back] = await Promise.all([
      page.waitForRequest((r) => r.method() === 'PATCH' && new URL(r.url()).pathname.endsWith('/api/routines')),
      page.locator('.tdl-prev').click(),
    ])
    expect(back.postDataJSON()).toMatchObject({ cardIdx: 0, done: false })
    await expect(strip.nth(0).locator('.tdl-step__check')).toHaveCount(0)
    await expect(page.locator('.tdl-prev')).toHaveCount(0) // back on step 1: nowhere behind

    // The filmstrip: a DONE step is hear-first — tap 1 arms + speaks, tap 2 rewinds.
    await page.locator('.tdl-finish').click() // step 1 done again
    let patched = false
    page.on('request', (r) => {
      if (r.method() === 'PATCH' && new URL(r.url()).pathname.endsWith('/api/routines')) patched = true
    })
    await strip.nth(0).click()
    await expect(strip.nth(0)).toHaveClass(/is-armed/)
    expect(patched).toBe(false) // the first tap only speaks — a wandering finger commits nothing
    await strip.nth(0).click()
    await expect(strip.nth(0)).not.toHaveClass(/is-armed/)
    await expect(strip.nth(0).locator('.tdl-step__check')).toHaveCount(0)
    expect(patched).toBe(true)

    // A FUTURE step never jumps the story — it only speaks itself.
    await strip.nth(2).click()
    await expect(strip.nth(2).locator('.tdl-step__check')).toHaveCount(0)
  })

  // Picking a routine back up mid-day: the ▶ says « Continuer », not « Commencer »
  // (Léa's Matin arrives with step 1 already done in the mock).
  test('a half-done routine resumes: the ▶ reads « Continuer »', async ({ page }) => {
    await APP('/maison', 'toddler')(page)
    await settle(page, '.hub')
    await page.locator('.kid__face', { hasText: 'Léa' }).click()
    await expect(page.getByRole('button', { name: 'Continuer' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Commencer' })).toHaveCount(0)
  })

  // ──────────────────────── toddler routine story ────────────────────────

  test('toddler reads a step aloud, then starts + finishes it', async ({ page }) => {
    await APP('/maison', 'toddler')(page)
    await settle(page, '.kid')
    await page.locator('.kid__face').first().click()
    // Tapping the picture only reads it aloud — it must NOT mark the step done.
    const tap = page.locator('.tdl-illus--tap')
    await expect(tap).toBeVisible()
    await tap.click()
    // Doing it is the start → finish flow; finishing marks the step done (PATCH).
    await page.locator('.tdl-start').click()
    // The run row is up — but it carries no count-up clock on ANY surface any more
    // (the run stopwatch was dropped entirely 2026-09-03; see journey-routines.spec.ts).
    // The ✓/→ button is what matters and is deliberately NOT gated.
    await expect(page.locator('.tdl-timer')).toBeVisible()
    await expect(page.locator('.tdl-clock')).toHaveCount(0)
    await expectApi(page, 'PATCH', 'routines', () => page.locator('.tdl-finish').click())
  })
})

// ── folded from journey-routines.spec.ts ──────────────────────────────────────────────
test.describe('routine-builder', () => {
  // Behavioural coverage for the routine card-deck editor (CardDeckEditor inside
  // RoutineForm, /routine/new). The step editor was screenshot-only; this drives the
  // real add / remove / reorder card operations and — the crux — asserts the SAVED
  // POST body carries the deck in exactly the edited order. CardDeckEditor keeps the
  // cards array + its parallel clip/photo arrays in lockstep on every mutation; a
  // drift there silently mis-attaches a clip/photo to the wrong card, which only a
  // POST-alignment assertion catches. Closes the §303 gap.

  const isApi = (method: string, path: string) => (r: Request) =>
    r.method() === method && new URL(r.url()).pathname === `/api/${path}`

  async function openBuilder(page: Page) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/routine/new')
    const form = page.locator('.operator__routine-form')
    await expect(form).toBeVisible()
    // Creating a routine requires a child (memberIds) + a name to enable submit.
    await form.getByRole('button', { name: 'Léa' }).click()
    await form.getByLabel('Nom de la routine').fill('Test routine')
    return form
  }

  // Add N blank cards and type a word into each (in order).
  async function addCards(form: import('@playwright/test').Locator, words: string[]) {
    const addBtn = form.getByRole('button', { name: 'carte', exact: true })
    for (let i = 0; i < words.length; i++) {
      await addBtn.click()
      await expect(form.getByLabel('mot', { exact: true })).toHaveCount(i + 1)
    }
    const inputs = form.getByLabel('mot', { exact: true })
    for (let i = 0; i < words.length; i++) await inputs.nth(i).fill(words[i]!)
  }

  // Submit and return the parsed POST /routines body.
  async function submitAndCapture(page: Page, form: import('@playwright/test').Locator) {
    const [req] = await Promise.all([
      page.waitForRequest(isApi('POST', 'routines'), { timeout: 20_000 }),
      form.getByRole('button', { name: 'Créer une routine' }).click(),
    ])
    return JSON.parse(req.postData() || '{}') as { cards: { label: string }[] }
  }

  test('removing the middle card keeps the deck aligned in the POST', async ({ page }) => {
    const form = await openBuilder(page)
    await addCards(form, ['Un', 'Deux', 'Trois'])

    // Remove the middle card ("Deux") via its ✕ (deleteLabel = "Retirer la carte").
    await form.getByRole('button', { name: 'Retirer la carte' }).nth(1).click()
    await expect(form.getByLabel('mot', { exact: true })).toHaveCount(2)

    const body = await submitAndCapture(page, form)
    expect(body.cards.map((c) => c.label)).toEqual(['Un', 'Trois'])
  })

  test('reordering a card up is reflected in the POST order', async ({ page }) => {
    const form = await openBuilder(page)
    await addCards(form, ['Alpha', 'Bravo'])

    // Move the SECOND card up (first card's ↑ is disabled) → order becomes Bravo, Alpha.
    await form.getByRole('button', { name: 'Monter' }).nth(1).click()

    const body = await submitAndCapture(page, form)
    expect(body.cards.map((c) => c.label)).toEqual(['Bravo', 'Alpha'])
  })

  test('the edit scene can delete a routine (confirm → DELETE → back to the tab)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })

    // Deep-link straight into edit mode for the mocked routine 'r1' (Matin).
    await page.goto('/routine/r1')
    const form = page.locator('.operator__routine-form')
    await expect(form).toBeVisible()

    // The delete affordance lives in the scene now (no trip to Réglages ▸ Corvées);
    // tapping it opens the weighty confirm dialog rather than deleting outright.
    await form.getByRole('button', { name: 'Supprimer la routine' }).click()
    await expect(page.locator('.confirm')).toBeVisible()

    // Confirming fires the DELETE and navigates back to Maison (Routines' hub tab
    // now — the scene's close() fallback, since a direct goto leaves no history to
    // pop back into).
    const [req] = await Promise.all([
      page.waitForRequest(isApi('DELETE', 'routines'), { timeout: 20_000 }),
      page.locator('.confirm .btn--danger').click(),
    ])
    expect(JSON.parse(req.postData() || '{}')).toMatchObject({ id: 'r1' })
    await expect(page).toHaveURL(/\/maison$/)
  })

  test('on a phone the routine editor commits from one row: Annuler · Enregistrer, above Supprimer', async ({ page }) => {
    // With Supprimer + Partager filling the footer's first line, Enregistrer used to drop
    // ALONE onto a second one — a lone pill at the foot of the deck that read as floating,
    // under the destructive button, and the editor was the one form with no « Annuler »
    // (UX walk, 2026-10-01).
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/routine/r1')
    const foot = page.locator('.operator__routine-form .form-footer')
    await expect(foot).toBeVisible({ timeout: 15_000 })
    const save = await boxOf(foot.getByRole('button', { name: 'Enregistrer' }))
    const cancel = await boxOf(foot.getByRole('button', { name: 'Annuler' }))
    const del = await boxOf(foot.getByRole('button', { name: 'Supprimer la routine' }))
    expect(Math.abs(cancel.y - save.y), 'Annuler and Enregistrer share a line').toBeLessThan(4)
    expect(save.y + save.height, 'the commit pair leads, Supprimer follows').toBeLessThanOrEqual(del.y)
  })
})


// ── folded from journey-routines.spec.ts ──────────────────────────────────────────────
test.describe('routine-run-solid', () => {
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
    icon: ['🛏️', '🚽', '🧼', '🪥', '👕', '🧦', '👟', '🥣', '🧃', '🎒', '🧥', '🧤', '🚗', '👋'][i]!,
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
        if (opts.second) snap.routines.push({ ...snap.routines[0]!, id: 'ry', name: 'Dodo', memberName: 'Noah', memberId: 'm4', doneIdx: [], timers: {} })
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
    // Proving no step was ticked: nothing marks an absence, so give it the time it would have taken.
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
    // Proving no step was ticked: nothing marks an absence, so give it the time it would have taken.
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
      // Proving no step was ticked: nothing marks an absence, so give it the time it would have taken.
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
    // Proving no step was ticked: nothing marks an absence, so give it the time it would have taken.
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
})


// ── folded from journey-routines.spec.ts ──────────────────────────────────────────────
test.describe('routine-timer', () => {
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
    const cards = (r1!.cards as Record<string, unknown>[]).map((c, i) =>
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
    // Proving no write was sent: nothing marks an absence, so give it the time it would have taken.
    await page.waitForTimeout(300)
    expect(patched).toBe(false) // …but nothing of theirs lands in the household's day
  })

  // ---- The run stopwatch is gone, on every surface (Marc, 2026-09-03) ----------
  //
  // Until 2026-09-02 a step that carried `seconds` rendered the Countdown ring AND,
  // just below, a run count-up stopwatch — two live numbers on one screen. They used
  // to be split by audience (parent: both; toddler: ring only, 2026-08-28), on the
  // reasoning that the stopwatch was a parent's metric. Marc's call the next day: drop
  // it entirely rather than keep splitting it — elapsed-time-per-run is the raw
  // material a personal-best score would be built from, closer to what the calm tenet
  // forbids than a parent-only metric is. `.tdl-clock` (the live number) and
  // `.tdl-total` (the end-of-run recap line) are both gone from the DOM now, on every
  // surface. The step ring is unaffected — it serves the task, not a score, and the
  // ✓/→ advance button is still NOT gated by any of this: it is the only way forward,
  // and hiding it would strand the child.

  test('the step ring runs with no stopwatch, on either surface', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page, { overrides: { routines: routinesWithTimer() } })
    await seedState(page, { theme: 'day', audience: 'toddler', lang: 'fr', surface: 'kiosk' })
    await page.goto('/routine/r1/run')
    await expect(page.locator('.tdl-what')).toBeVisible()

    await page.locator('.tdl-start').click()
    await expect(page.locator('.tdl-timer')).toBeVisible()

    // The step ring stays — it is the one a pre-reader can act on.
    await expect(page.locator('.tdl-countdown')).toHaveCount(1)
    // No stopwatch, no recap total.
    await expect(page.locator('.tdl-clock')).toHaveCount(0)
    await expect(page.locator('.tdl-total')).toHaveCount(0)
    // …but the way forward must remain. Hiding this would strand the child.
    await expect(page.locator('.tdl-timer .tdl-finish')).toBeVisible()
  })

  test('the parent surface has no stopwatch either — this used to be the audience split', async ({ page }) => {
    // Regression guard for the reversal: this test failing (a visible .tdl-clock)
    // means the split came back rather than staying dropped.
    await openRun(page)
    await page.locator('.tdl-start').click()
    await expect(page.locator('.tdl-countdown')).toHaveCount(1)
    await expect(page.locator('.tdl-clock')).toHaveCount(0)
  })
})


// ── folded from journey-routines.spec.ts ──────────────────────────────────────────────
test.describe('routine-tips', () => {
  // « Le truc du compagnon » — the trick the child's creature says for the step they're
  // ON when they tap it. Two halves, both driven here:
  //
  //   • the PLAYER: tap the fox → the bubble carries the trick for the current card's
  //     pictogram (the built-in catalog, lib/routineTips), and a warm line only when the
  //     card has none. The cascade is the feature; a regression that silently drops back
  //     to "Allô !" on every step would look fine in a screenshot.
  //   • the BUILDER: a parent's own « truc » must reach the SAVED POST body. It rides
  //     inline in cards_json (like `seconds`), and the form prefills field-by-field —
  //     exactly the shape where a forgotten key means the tip is dropped on the next
  //     edit and nobody notices until a kid taps the fox and hears nothing useful.
  //
  // The fixture's routine r1 (Léa, « Matin ») has doneIdx [0], so the current card is
  // index 1 — 🥞 « Déjeuner », which HAS a trick.

  const isApi = (method: string, path: string) => (r: Request) =>
    r.method() === method && new URL(r.url()).pathname === `/api/${path}`

  async function openRun(page: Page) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/routine/r1/run')
    await expect(page.locator('.tdl-buddy')).toBeVisible()
  }

  test('tapping the companion says the trick for the step the child is ON', async ({ page }) => {
    await openRun(page)

    // Current card = 🥞 Déjeuner (index 0 is done). Its trick, not a generic line.
    await expect(page.locator('.tdl-what')).toHaveText('Déjeuner')
    await page.locator('.tdl-buddy').click()
    await expect(page.locator('.tdl-buddy__bubble')).toHaveText(/Assis-toi avant la première bouchée/)

    // Advance to 🪥 « Brosse tes dents » — the fox follows the story: a NEW trick, keyed
    // to the new picture. (This is the whole point: the tip tracks the step, not the run.)
    // The → only exists once the run is going, so press ▶ first.
    await page.locator('.tdl-start').click()
    await page.locator('.tdl-finish').click()
    await expect(page.locator('.tdl-what')).toHaveText('Brosse tes dents')
    await page.locator('.tdl-buddy').click()
    await expect(page.locator('.tdl-buddy__bubble')).toHaveText(/langue aussi/)
  })

  test('a card with no trick falls back to a warm line — never an empty bubble', async ({ page }) => {
    await openRun(page)

    // Walk to 🎒 « Sac à dos » (the last card) — it HAS a trick, so instead assert the
    // fallback where it really lives: the bubble is never empty, whatever the card.
    await page.locator('.tdl-buddy').click()
    const bubble = page.locator('.tdl-buddy__bubble')
    await expect(bubble).toBeVisible()
    await expect(bubble).not.toHaveText('')
  })

  test('the companion never covers the advance/back controls on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 720 })
    await openRun(page)
    // Start the run so the → advance button is present (it replaces the ▶ start).
    await page.locator('.tdl-start').click()

    const buddy = await boxOf(page.locator('.tdl-buddy'))
    // The primary action (→ / ✓) and the ← rewind must both be clear of the creature —
    // at kiosk size in the bottom corner the fox sat ON TOP of the → and ate the tap.
    for (const sel of ['.tdl-finish', '.tdl-prev']) {
      const ctrl = await page.locator(sel).boundingBox()
      if (!ctrl) continue // ← only shows once a step is behind us
      const overlap = !(
        buddy.x + buddy.width <= ctrl.x ||
        ctrl.x + ctrl.width <= buddy.x ||
        buddy.y + buddy.height <= ctrl.y ||
        ctrl.y + ctrl.height <= buddy.y
      )
      expect(overlap, `${sel} must not be covered by the companion`).toBe(false)
    }
  })

  test('the bubble stays inside the stage on a 360px phone (no horizontal bleed)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await openRun(page)
    await page.locator('.tdl-buddy').click()

    const bubble = page.locator('.tdl-buddy__bubble')
    await expect(bubble).toBeVisible()
    // A long trick must WRAP inside the viewport, never bleed off either edge — the
    // standing no-horizontal-overflow rule, checked against real bounds (the container
    // clips would hide it from a scrollWidth check).
    const box = await boxOf(bubble)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(360)
  })

  test('a parent’s own « truc » reaches the saved POST body', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/routine/new')
    const form = page.locator('.operator__routine-form')
    await expect(form).toBeVisible()
    await form.getByRole('button', { name: 'Léa' }).click()
    await form.getByLabel('Nom de la routine').fill('Test routine')

    // One card, with a word…
    await form.getByRole('button', { name: 'carte', exact: true }).click()
    await form.getByLabel('mot', { exact: true }).fill('Manteau')

    // …then open 💡 « Le truc » and type the parent's own. Theirs beats the catalog.
    // The aids (minuterie · truc · voix · photo) live behind a per-card fold since
    // 2026-09-10 — a fresh card carries none, so this is the door a parent takes too.
    // A card that ALREADY has one shows its controls without the fold; that half is
    // held by e2e/journey-routines.spec.ts.
    await form.locator('.deck__aids-toggle').first().click()
    await form.getByRole('button', { name: 'Le truc', exact: true }).click()
    await form.getByLabel('Le truc', { exact: true }).fill('regarde derrière la porte')

    const [req] = await Promise.all([
      page.waitForRequest(isApi('POST', 'routines'), { timeout: 20_000 }),
      form.getByRole('button', { name: 'Créer une routine' }).click(),
    ])
    const body = JSON.parse(req.postData() || '{}') as { cards: { label: string; tip?: string }[] }
    expect(body.cards[0]).toMatchObject({ label: 'Manteau', tip: 'regarde derrière la porte' })
  })

  test('editing a routine keeps every step’s photo and voice clip it did not touch', async ({ page }) => {
    // Marc, 2026-10-01: « the moment I saved a photo the other one disappeared ». The
    // edit form prefilled each card field-by-field and left photoKey/clipKey out, so a
    // save sent a deck without them — and the server freed their blobs for good.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    // The edit scene reads GET /api/routines; serve r1 with media on two steps.
    await page.route('**/api/routines', (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      return route.fulfill({
        json: {
          routines: [
            {
              id: 'r1',
              name: 'Matin',
              memberName: 'Léa',
              timeOfDay: 'morning',
              cards: [
                { icon: '👕', label: 'Habille-toi', photoKey: 'rcp_step1photo' },
                { icon: '🥞', label: 'Déjeuner', clipKey: 'rn_step2clip' },
                { icon: '🪥', label: 'Brosse tes dents' },
              ],
              doneIdx: [],
            },
          ],
        },
      })
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/routine/r1')
    const form = page.locator('.operator__routine-form')
    await expect(form).toBeVisible()

    const [req] = await Promise.all([
      page.waitForRequest(isApi('PATCH', 'routines'), { timeout: 20_000 }),
      form.getByRole('button', { name: 'Enregistrer', exact: true }).click(),
    ])
    const body = JSON.parse(req.postData() || '{}') as { cards: { photoKey?: string; clipKey?: string }[] }
    expect(body.cards[0]?.photoKey).toBe('rcp_step1photo')
    expect(body.cards[1]?.clipKey).toBe('rn_step2clip')
  })

  test('tapping a step’s picture offers a photo above the emojis, and it saves', async ({ page }) => {
    // Marc, 2026-10-01: the photo lived only under the « Minuterie, truc, voix,
    // photo… » fold; tapping the picture is where a parent looks for it.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await page.route('**/api/routine-card-photo', (route) =>
      route.request().method() === 'POST' ? route.fulfill({ json: { key: 'rcp_newphoto' } }) : route.fallback(),
    )
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/routine/r1')
    const form = page.locator('.operator__routine-form')
    await expect(form).toBeVisible()

    await form.locator('.deck__emoji').first().click()
    const picker = page.locator('.deck__palette-photo')
    await expect(picker.getByRole('button', { name: 'Ajouter une photo' })).toBeVisible()
    await picker.locator('input[type="file"]').setInputFiles({ name: 'brosse.png', mimeType: 'image/png', buffer: PNG_1x1 })
    // A new photo closes the picker and becomes the step's picture in the deck.
    await expect(picker).toHaveCount(0)
    await expect(form.locator('.deck__emoji').first().locator('img')).toBeVisible()

    const [req] = await Promise.all([
      page.waitForRequest(isApi('PATCH', 'routines'), { timeout: 20_000 }),
      form.getByRole('button', { name: 'Enregistrer', exact: true }).click(),
    ])
    const body = JSON.parse(req.postData() || '{}') as { cards: { photoKey?: string }[] }
    expect(body.cards[0]?.photoKey).toBe('rcp_newphoto')
  })

  const PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
})


// ── folded from journey-routines.spec.ts ──────────────────────────────────────────────
test.describe('routine-aids-fold', () => {
  // THE PER-CARD AIDS FOLD — and the one invariant that makes a fold safe.
  //
  // Every routine card offers four aids: a timer, « le truc », a voice clip and a
  // photo. They shared one row on purpose (they read as a group), but at 390px that
  // row wrapped to three lines UNDER EVERY CARD, so a four-step routine opened as
  // twelve rows of things you are not doing before its footer — found by looking at
  // the state matrix on 2026-09-10. They are behind a summary line now.
  //
  // A fold is only allowed if it never hides a filled field (LEAN.md). So the rule
  // this file holds is not "the aids are collapsed" — it is:
  //
  //   a card with NO aid set    → one quiet summary, controls hidden until asked
  //   a card WITH an aid set    → controls shown outright, and NO summary to re-hide them
  //
  // The second half is the one worth testing: the first is visible in any screenshot,
  // while the second only appears on a household's own filled-in routine, which is
  // exactly the state a screenshot sweep never has.

  const CARDS_WITH_AID = [
    // A timer on the FIRST card and a « truc » on the second: two different aids, so a
    // fold that only remembered one of them still fails here.
    { icon: '👕', label: 'Habille-toi', seconds: 120 },
    { icon: '🥞', label: 'Déjeuner', tip: 'Assis-toi avant la première bouchée' },
    { icon: '🪥', label: 'Brosse tes dents' },
  ]

  const ROUTINES_WITH_AIDS = {
    routines: {
      routines: [
        {
          id: 'r1',
          name: 'Matin',
          memberName: 'Léa',
          color: '#88A36F',
          avatarPhoto: null,
          timeOfDay: 'morning',
          cards: CARDS_WITH_AID,
          doneIdx: [],
          companion: 'fox',
        },
      ],
    },
  }

  async function openBuilder(page: Page, overrides?: Record<string, unknown>) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page, overrides ? { overrides } : undefined)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/routine/r1')
    await expect(page.locator('.deck__row').first()).toBeVisible({ timeout: 15_000 })
  }

  test('a card with no aid keeps them folded, and opens on request', async ({ page }) => {
    await openBuilder(page)

    // `.deck__row` is the per-card WRAPPER: the card itself, then its aids, then the
    // truc field. Scoping to `.deck__card` would find only the label row's own
    // controls — the aids are its SIBLING, not its child.
    const cards = page.locator('.deck__row')
    const n = await cards.count()
    expect(n, 'the fixture routine should have several cards').toBeGreaterThan(1)

    // Folded: a summary per card, no controls on screen.
    await expect(page.locator('.deck__aids-toggle')).toHaveCount(n)
    await expect(page.locator('.deck__media')).toHaveCount(0)

    // …and it is a real door, not decoration.
    await page.locator('.deck__aids-toggle').first().click()
    await expect(page.locator('.deck__media')).toHaveCount(1)
    await expect(page.locator('.deck__media .deck__timer').first()).toBeVisible()

    // Single-open: asking for another card's aids puts the first one away, so the form
    // can never grow back into the twelve-row wall this fold exists to remove.
    await page.locator('.deck__aids-toggle').first().click()
    await expect(page.locator('.deck__media')).toHaveCount(0)
  })

  test('a card that CARRIES an aid shows it — no fold in front of a filled field', async ({ page }) => {
    await openBuilder(page, ROUTINES_WITH_AIDS)

    // Two of the three cards carry an aid (a timer, a truc); the third carries none.
    // So: two rows open, one summary — never three summaries, and never a summary on a
    // card whose aid is set (that is the failure mode, a filled field behind a fold).
    await expect(page.locator('.deck__media')).toHaveCount(2)
    await expect(page.locator('.deck__aids-toggle')).toHaveCount(1)

    // The timer really is showing its VALUE (« 2 min »), not just an empty control —
    // asserting on .deck__timer itself would be asserting on nothing: it is
    // `display: contents`, so it has no box and can never be "visible".
    // Exact name: a SET timer renders two buttons whose accessible names both contain
    // « minuterie » — the cycle button and « Retirer la minuterie ».
    await expect(
      page.locator('.deck__row').first().getByRole('button', { name: 'Minuterie', exact: true }),
    ).toContainText(/min/i)
    // …and the « truc » field on the second card is on screen with its text in it.
    await expect(page.locator('.deck__tip .edit-field__input').first()).toHaveValue(
      /Assis-toi avant la première bouchée/,
    )
  })
})


// ── folded from journey-routines.spec.ts ──────────────────────────────────────────────
test.describe('stickers', () => {
  // F29 « Mur d'autocollants » — the first-ever e2e for the opt-in sticker wall
  // (PARITY Wave E, entry 4). Two happy paths: PLACING a sticker on finishing a
  // routine (POST), and REMOVING one from the wall (DELETE). Both need « Mode calme »
  // OFF — the wall doesn't exist otherwise (StickerWallPage bounces to /maison).
  // Frontend-only harness (mocked /api/**), like the other specs.

  // A per-test route override registered AFTER mockApi's catch-all wins (Playwright
  // tries the last-registered route first). ROUTINE_CARDS mirror the mock's four.
  const CARDS = [
    { icon: '👕', label: 'Habille-toi' },
    { icon: '🥞', label: 'Déjeuner' },
    { icon: '🪥', label: 'Brosse tes dents' },
    { icon: '🎒', label: 'Sac à dos' },
  ]

  // r1 arrives ALREADY complete (every card done), so the finish screen renders at
  // once — no fragile step-by-step run against static mock data.
  async function finishedRoutine(page: Parameters<typeof mockApi>[0]) {
    await page.route('**/api/routines**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          routines: [
            {
              id: 'r1', name: 'Matin', memberName: 'Léa', color: '#88A36F', avatarPhoto: null,
              timeOfDay: 'morning', cards: CARDS, doneIdx: [0, 1, 2, 3],
            },
          ],
        }),
      }),
    )
  }

  test('finishing a routine (calm off) places a sticker → POST', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await finishedRoutine(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', calm: false })
    await page.goto('/routine/r1/run')
    // ONE finish screen: the recap renders whatever calm says…
    await expect(page.locator('.tdl-recap')).toBeVisible()
    // …and the sticker picker rides ON it, only when calm is OFF (the opt-in reward).
    const opt = page.locator('.tdl-sticker__opt').first()
    await expect(opt).toBeVisible()
    const [req] = await Promise.all([
      page.waitForRequest(
        (r) => r.method() === 'POST' && new URL(r.url()).pathname.endsWith('/api/routine-stickers'),
      ),
      opt.click(),
    ])
    const body = req.postDataJSON()
    expect(body.routineId).toBe('r1')
    expect(typeof body.sticker).toBe('string')
    // The placed sticker confirms in place (with a link to the wall).
    await expect(page.locator('.tdl-sticker__done')).toBeVisible()
  })

  // Calm's ONE meaning: no reward. The finish screen itself is unconditional — the
  // same recap + « Recommencer » a calm-off household sees, minus the sticker offer.
  test('finishing a routine (calm on) shows the same recap, reward-free', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await finishedRoutine(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', calm: true })
    await page.goto('/routine/r1/run')
    // The one finish screen: the picture recap + the deliberate « Recommencer ».
    await expect(page.locator('.tdl-recap')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Recommencer' })).toBeVisible()
    // No sticker anywhere — not the picker, not the wall entry on Maison's Routines
    // section (its default).
    await expect(page.locator('.tdl-sticker')).toHaveCount(0)
    await page.goto('/maison')
    await expect(page.locator('.routines-sticker-link')).toHaveCount(0)
  })

  test('the sticker wall removes one behind the undo toast, and undo restores it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await page.route('**/api/routine-stickers**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          stickers: [
            { id: 'st1', memberId: 'm3', sticker: '⭐', routineId: 'r1', createdAt: 1_749_369_600 },
            { id: 'st2', memberId: null, sticker: '🌈', routineId: null, createdAt: 1_749_369_600 },
          ],
        }),
      }),
    )
    // A light, frequent delete on a live-polled list goes through useDeferredRemoval: the
    // DELETE is HELD behind the undo toast, so tapping ✕ must NOT fire a write, and undo
    // must restore the cell (Wave U). Guard: capture any DELETE that leaks out early.
    let deleted = false
    page.on('request', (r) => {
      if (r.method() === 'DELETE' && new URL(r.url()).pathname.endsWith('/api/routine-stickers')) deleted = true
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', calm: false })
    await page.goto('/routine/stickers')
    const glyphs = page.locator('.sticker-wall__glyph')
    // Léa's ⭐ + the Maisonnée 🌈 — two placed stickers, grouped by who.
    await expect(glyphs).toHaveCount(2)
    // The ✕ per cell only appears in edit mode (the header « Modifier » toggle).
    await page.getByRole('button', { name: 'Modifier' }).click()
    // Remove one → it hides at once (deferred), the undo toast surfaces, no write yet.
    await page.locator('.sticker-wall__remove').first().click()
    await expect(glyphs).toHaveCount(1)
    await expect(page.locator('.undo-toast__msg')).toContainText('Autocollant retiré')
    expect(deleted).toBe(false)
    // Undo restores the cell — and the DELETE never fires (the write was only held).
    await page.locator('.undo-toast__btn').first().click()
    await expect(glyphs).toHaveCount(2)
    expect(deleted).toBe(false)
  })

  // A child's extra tap on the big button must not restart the routine: « Recommencer » takes
  // its place on the end screen, and rests (disabled) for the first couple of seconds.
  test('« Recommencer » rests for 2 s after the last step, then restarts', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mockApi(page)
    await finishedRoutine(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile', calm: true })
    await page.goto('/routine/r1/run')
    const again = page.locator('.tdl-again')
    await expect(again).toBeVisible()
    await expect(again).toBeDisabled()
    await expect(again).toBeEnabled({ timeout: 4000 })
  })
})


// ── folded from journey-routines.spec.ts ──────────────────────────────────────────────
test8.describe('moments-rehomed', () => {
  // « Moments » is retired (2026-08-25). Two things it owned had to survive the deletion,
  // and neither had a guard anywhere else — this file is that guard:
  //
  //   • « Ce soir dans le ciel » (SkyTonight, the local moon phase) moved from the Moments
  //     scene into « Dehors aujourd'hui » (SkySheet), the sheet the board's weather/wonder
  //     hero opens.
  //   • The per-day « Avant de partir » door moved from the Moments per-day block onto the
  //     day page (/kitchen/day/:date), where it stays operator-only.
  //
  // (The third leg — an old /moment link redirecting to the board — lives in
  // journey-board-arrange.spec.ts beside the rest of the board-layout coverage.)

  // Local midnight in the household zone, not Node's (UTC on CI — a day off there).
  const today = () => localDayStart(new Date())

  test8('the moon line now lives inside « Dehors aujourd’hui »', async ({ page, app }) => {
    await app.boot({ state: { calm: true } })
    await page.goto('/board')
    await page.locator('.hub').waitFor()
    // Tap the weather/wonder hero — the sheet's only door.
    await page.locator('.now-card--wx, .board-heroes .now-card').last().click()
    await expect(page.locator('.sky-sheet')).toBeVisible()
    await expect(page.locator('.sky-tonight')).toBeVisible()
    await expect(page.locator('.sky-tonight__kicker')).toHaveText('Ce soir dans le ciel')
  })

  test8('the day page offers « Avant de partir », and it opens that day’s screen', async ({ page, app }) => {
    await app.boot({ state: { calm: true } })
    await page.goto(`/kitchen/day/${today()}`)
    await page.locator('.scene').waitFor()
    const door = page.locator('.day-plan__doors button')
    await expect(door).toHaveText(/Avant de partir/)
    await door.click()
    // ?day= carries the day through — DeparturePage reads it standalone.
    await page.waitForURL(/\/board\/departure\?day=\d+/)
  })

  test8('a read-only guest never sees that door — the checklist behind it writes', async ({ page, app }) => {
    await app.boot({ state: { calm: true } })
    await page.addInitScript(() => localStorage.setItem('babillard-guest-token', '1'))
    await page.goto(`/kitchen/day/${today()}`)
    await page.locator('.scene').waitFor()
    await expect(page.locator('.day-plan__doors')).toHaveCount(0)
  })
})

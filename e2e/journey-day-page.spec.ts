import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, BASE, MMID } from './mocks'
import { todayLocalDay, addLocalDays } from '../src/lib/localDay'
import { boxOf } from './measure'

// JOURNEY — A DAY'S PAGE (review #43; was day-plan-lean.spec.ts + day-meal-tap.spec.ts + past-day-meal-doors.spec.ts).
//
// « Planifier une journée » (/kitchen/day/:date) after the 2026-08-26 pass:
//
//  1. ORDER — the day's schedule leads. What is already booked and can't move
//     (Rendez-vous ▸ Les tâches ▸ Projets) comes before what you decide around it
//     (À compléter). It used to open on the todo list and the meal
//     editor, with the day's own agenda scrolled off below them.
//     2026-09-02: the scene split into TWO FACES behind a `?vue=` sub-tab row —
//     « Journée » (default: the agenda) and « Repas » (the meal planner). Meal
//     doors (the kitchen pencil, ＋ « Planifier un repas », history, a meal search
//     hit) land `?vue=repas`; day doors land the default.
//  2. ONE ANATOMY — every section is a SecLabel header (glyph · title · rule ·
//     count) whose trailing ＋ is the shared SectionAdd, then its rows, then the
//     composer that ＋ opened. No hand-rolled headings, no full-width
//     « Ajouter un rendez-vous / une tâche » bar camping under each list, and no
//     dashed per-slot « ＋ Ajouter » pill in the meal planner.
//  3. NOTES ON A RENDEZ-VOUS (migration 0121) — a rendez-vous carries its own
//     free-text note, shown as a second sub-line on its row.
//
// The shared `month` fixture is empty, so this spec seeds the day it means to test.

// The household's own local-midnight math (America/Toronto, DST-aware), NOT a bare
// `new Date()` — the browser context is pinned to that zone (playwright.config.ts),
// but this Node test process runs in the CI RUNNER's zone (UTC), so a hand-rolled
// "today" here can silently name a different calendar day than the app's own
// `todayLocalDay()` — and DayPlanPage's `isPast` gate (src/pages/DayPlanPage.tsx)
// depends on exactly that comparison for the PAST-date test below.
test.describe('day-plan-lean', () => {
  const TODAY = todayLocalDay()
  // addLocalDays, not `TODAY - DAY`: a fixed 86400 misses yesterday's local midnight
  // on the two DST transition days (the documented fixed-86400 trap) — this spec
  // would go red on CI twice a year.
  const YESTERDAY = addLocalDays(TODAY, -1)

  const NOTE = 'apporter la carte d’assurance maladie · 3e étage'

  const DAY_MONTH = {
    month: {
      // ONE timed rendez-vous: below the ribbon threshold (≥2), so the rows sit in the
      // Rendez-vous bucket where they can be counted and tapped directly.
      events: [{ id: 'de1', title: 'Dentiste — Léa', at: TODAY + 9 * 3600, all_day: 0, member_id: 'm3', day: TODAY, notes: NOTE }],
      meals: [],
      tasks: [{ id: 'dc1', taskId: 'dc1', source: 'task', title: 'Vider le lave-vaisselle', color: '#88A36F', icon: null, kind: null, who_id: 'm2', day: TODAY, done: false, recurring: false, soon: false }],
      dayNotes: [],
      todos: [],
      trips: [],
      tripPlans: [],
      habits: [],
    },
    // Tapping a row opens the EDIT form, which resolves the full series off /api/events
    // (the /api/month occurrence carries display fields only) — so the same rendez-vous
    // has to exist there, note included.
    events: {
      events: [
        { id: 'de1', title: 'Dentiste — Léa', start_at: TODAY + 9 * 3600, all_day: 0, member_id: 'm3', notes: NOTE },
      ],
    },
  }

  async function openDay(
    page: Page,
    opts: {
      guest?: boolean
      vue?: 'repas'
      date?: number
      overrides?: Record<string, unknown>
      // Registered right after mockApi's own routes (so it wins — Playwright tries
      // routes newest-first) and before the page navigates.
      extraRoutes?: (page: Page) => Promise<void>
    } = {},
  ) {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(() => {
      try {
        localStorage.setItem('babillard-tours-seen', JSON.stringify(['essentials']))
      } catch {
        /* noop */
      }
    })
    await mockApi(page, { overrides: opts.overrides ?? DAY_MONTH, signedIn: !opts.guest })
    if (opts.extraRoutes) await opts.extraRoutes(page)
    if (opts.guest) {
      // A read-only LINK guest (what the public demo is): no operator session, a guest
      // token in localStorage, `showcase` share-mode so they stay in the hub.
      await page.route('**/api/guest/whoami**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'showcase' }) }),
      )
      await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
    }
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    const date = opts.date ?? TODAY
    await page.goto(`/kitchen/day/${date}${opts.vue ? `?vue=${opts.vue}` : ''}`)
    await expect(page.locator('.day-plan__sections')).toBeVisible({ timeout: 15_000 })
  }

  test('the day leads with its schedule: Rendez-vous and Les tâches come first', async ({ page }) => {
    await openDay(page)
    // The default « Journée » face is the agenda alone — the meal planner is the
    // « Repas » face, one sub-tab over (no « Les repas » section stacked below).
    const headings = (await page.locator('.day-plan__sections .sec-label b').allInnerTexts()).map((s) => s.trim())
    // Every task on the day is ONE section (« Les tâches », 2026-11-08); the departure
    // checklists keep theirs, a loose to-do is a task.
    expect(headings).toEqual(['Rendez-vous', 'Les tâches', 'Avant de partir'])
    await expect(page.locator('.day-mng__sec')).toHaveCount(0)
    // Flipping to « Repas » shows the planner (the slot sections), not the agenda.
    await page.getByRole('tab', { name: 'Repas' }).click()
    await expect(page.locator('.day-mng__sec').first()).toBeVisible()
    await expect(page.locator('.day-plan__sec').filter({ hasText: 'Rendez-vous' })).toHaveCount(0)
  })

  test('every section carries its ＋ in the header — no add bar under the list', async ({ page }) => {
    await openDay(page)
    const rdv = page.locator('.day-plan__sec').filter({ hasText: 'Rendez-vous' })
    // The ＋ lives IN the header row, beside the title and the count.
    const plus = rdv.locator('.sec-label .sec-label__actbtn')
    await expect(plus).toHaveCount(1)
    await expect(rdv.locator('.operator__inline-form')).toHaveCount(0)

    // Tapping it opens the shared EventForm inside the section; the ＋ flips to ✕ and
    // closing it again is the same control.
    await plus.click()
    await expect(rdv.locator('.operator__inline-form')).toBeVisible()
    await expect(plus).toHaveAttribute('aria-expanded', 'true')
    await plus.click()
    await expect(rdv.locator('.operator__inline-form')).toHaveCount(0)

    // The tâches section is the SAME anatomy, not a variation on it.
    const chores = page.locator('.day-plan__sec').filter({ hasText: 'Les tâches' })
    await chores.locator('.sec-label .sec-label__actbtn').click()
    await expect(chores.locator('.operator__inline-form')).toBeVisible()
  })

  test('« Avant de partir » keeps its picker behind the same header ＋', async ({ page }) => {
    await openDay(page)
    const todos = page.locator('.todo-sec')
    // The add field is NOT open by default any more — the section leads with its rows.
    await expect(todos.locator('.edit-field input.input')).toHaveCount(0)
    await todos.locator('.sec-label .sec-label__actbtn').click()
    await expect(todos.locator('.edit-field input.input')).toBeFocused()
  })

  test('a rendez-vous shows its own note on the row', async ({ page }) => {
    await openDay(page)
    const row = page.locator('.day-plan__sec .act').filter({ hasText: 'Dentiste' })
    await expect(row.locator('.act__note')).toContainText(NOTE)
  })

  test('the event form carries a « Note » fold, open when the rendez-vous has one', async ({ page }) => {
    await openDay(page)
    // A BRAND-NEW rendez-vous: the fold is closed (it is optional detail).
    const rdv = page.locator('.day-plan__sec').filter({ hasText: 'Rendez-vous' })
    await rdv.locator('.sec-label .sec-label__actbtn').click()
    const newFold = rdv.locator('.event-note')
    await expect(newFold).toBeVisible()
    await expect(newFold.locator('textarea')).toHaveCount(0)
    await newFold.getByRole('button', { name: 'Note' }).click()
    await expect(newFold.locator('textarea')).toBeVisible()

    // EDITING the seeded one: the fold is already OPEN with the note in it — a fold
    // may never hide a filled field (LEAN.md invariant 1).
    await page.reload()
    await page.locator('.day-plan__sec .act').filter({ hasText: 'Dentiste' }).click()
    await expect(page.locator('.event-note textarea')).toHaveValue(NOTE)
  })

  test('the meal slots use the same ＋ chip — no dashed « Ajouter » pill', async ({ page }) => {
    await openDay(page, { vue: 'repas' })
    const supper = page.locator('.day-mng__sec[data-dnd-zone="supper"]')
    await expect(supper.locator('.kitchen__slot-add')).toHaveCount(0)
    const plus = supper.locator('.day-mng__sec-head-row .sec-label__actbtn')
    // Nothing on this day yet, so it reads « Ajouter » (not « Ajouter un autre ») and
    // still names the slot — an icon-only control may never end up unnamed.
    await expect(plus).toHaveAttribute('aria-label', 'Ajouter — Souper')
    await plus.click()
    await expect(supper.locator('.edit-field input.input')).toBeVisible()
  })

  // The « + ingrédients » opt-in (and the mousedown-preventDefault guard that kept its
  // dropdown open) was REMOVED with the AI-staples flow it gated — `f9c3c83`, « meal
  // picker decluttered ». Its spec outlived it and had been failing on main ever since,
  // looking for a chip nothing renders. Deleted rather than rewritten: there is no
  // behaviour left to guard. See useMealPlanning.ts's own note on the removal.

  test('a read-only guest sees the day, but none of the ＋', async ({ page }) => {
    await openDay(page, { guest: true })
    await expect(page.locator('.day-plan__sections .sec-label__actbtn')).toHaveCount(0)
    await expect(page.locator('.day-plan__sec .act').filter({ hasText: 'Dentiste' })).toBeVisible()
    // …and the « Repas » face is just as read-only: no slot ＋ either (DayEditor
    // gates its own controls via isGuest).
    await page.getByRole('tab', { name: 'Repas' }).click()
    await expect(page.locator('.day-mng__sec').first()).toBeVisible()
    await expect(page.locator('.day-mng__sec .sec-label__actbtn')).toHaveCount(0)
  })

  test('a PAST date is fully editable — the meal planner has no date gate', async ({ page }) => {
    // /api/meals' plain GET is a rolling window from today (functions/api/meals.ts) —
    // it never carries a past date, so DayPlanPage additionally reads
    // /api/meals?date=<past> for the one day it's actually showing (src/pages/
    // DayPlanPage.tsx, `pastMealsQ`). Stub the two shapes distinctly to prove that
    // read actually happens and actually renders — not just that the write succeeds.
    const posted: Record<string, unknown>[] = []
    await openDay(page, {
      vue: 'repas',
      date: YESTERDAY,
      extraRoutes: async (page) => {
        await page.route('**/api/meals**', async (route) => {
          const req = route.request()
          if (req.method() === 'GET') {
            const forPastDay = new URL(req.url()).searchParams.get('date') === String(YESTERDAY)
            const body = forPastDay
              ? {
                  days: [
                    { id: 'ym1', date: YESTERDAY, slot: 'supper', title: 'Chili maison', cook_member_id: null, position: 0, is_leftover: 0 },
                  ],
                  weekStart: TODAY,
                  windowDays: 10,
                  recent: [],
                }
              : { days: [], weekStart: TODAY, windowDays: 10, recent: [] }
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
          }
          if (req.method() === 'POST') {
            posted.push(req.postDataJSON())
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'new-past' }) })
          }
          return route.fallback()
        })
      },
    })

    const supper = page.locator('.day-mng__sec[data-dnd-zone="supper"]')
    // The read side: yesterday's already-planned meal actually renders — this is the
    // part that used to be silently empty.
    await expect(supper).toContainText('Chili maison')

    // The write side: adding a second supper item on that PAST date must reach the
    // server with that same past `date` — nothing downgrades it to read-only or
    // silently redirects it to today.
    await supper.locator('.day-mng__sec-head-row .sec-label__actbtn').click()
    const field = supper.locator('.edit-field input.input')
    await field.fill('Poutine')
    await page.keyboard.press('Enter')

    await expect.poll(() => posted.length, { message: 'the past-day meal was planned' }).toBeGreaterThan(0)
    const body = posted[0] as { title?: string; date?: number; slot?: string }
    expect(body.title).toBe('Poutine')
    expect(body.slot).toBe('supper')
    expect(body.date).toBe(YESTERDAY)
  })
})

// ── folded from day-meal-tap.spec.ts ──────────────────────────────────────────────
test.describe('day-meal-tap', () => {
  // THE DAY SCENE'S MEAL ROW OPENS ITS RECIPE — the same contract the week grid pins.
  //
  // Marc, from the phone, 2026-09-10: « we lost the ability to see the recipe directly
  // in La cuisine when tapping a meal ». On the week grid the tap already went straight
  // to the recipe (journey-journey-meals.spec.ts pins it). The surface that did NOT was the
  // day scene — /kitchen/day/:date — where a tap on a meal row opened an in-place
  // RENAME, and the recipe hid behind a small 📖 glyph. Once the day scene became THE
  // day door (« Moments » retired, 2026-09-02) that is where a household taps a meal,
  // so that is where the recipe went missing.
  //
  // The rule now, on both surfaces:
  //   · a meal that resolves a recipe  → its row opens the recipe (one door, the row)
  //   · a free-text meal               → its row renames in place (nothing else to show)
  //   · rename for a LINKED meal       → the row's ⋯, under the word the tap used to carry
  //
  // Fixture (mocks.ts MEALS): « Spaghetti maison » is linked to rc1; « Salade César » is
  // free text. Both sit in the supper slot on MMID, so the clock is frozen at BASE and
  // the scene opened on that day.

  async function openDay(page: Page) {
    await page.clock.setFixedTime(new Date(BASE * 1000))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto(`/kitchen/day/${MMID}?vue=repas`)
    await expect(page.locator('.kitchen__meal-row').first()).toBeVisible({ timeout: 15_000 })
  }

  const row = (page: Page, title: string) => page.locator('.kitchen__meal-row', { hasText: title })

  test('a linked meal\'s row opens its recipe — no glyph, no peek in between', async ({ page }) => {
    await openDay(page)
    const spag = row(page, 'Spaghetti maison')
    // The row body IS the door: it says so to a screen reader too.
    await expect(spag.locator('.kitchen__meal-main')).toHaveAttribute('aria-label', /Spaghetti maison/)
    // …and there is no second door to the same place.
    await expect(spag.locator('.kitchen__meal-btn')).toHaveCount(0)
    await spag.locator('.kitchen__meal-main').click()
    await expect(page).toHaveURL(/\/kitchen\/recipe\/rc1$/)
  })

  test('a free-text meal\'s row still renames in place', async ({ page }) => {
    await openDay(page)
    const salade = row(page, 'Salade César')
    await salade.locator('.kitchen__meal-main').click()
    // No navigation — the row became a field, pre-filled with the title. Once it is a
    // field its title is an input VALUE, which `hasText` cannot see, so the row locator
    // above stops resolving: find the field itself.
    await expect(page).toHaveURL(/\/kitchen\/day\//)
    await expect(page.locator('.kitchen__meal-row .edit-field__input')).toHaveValue('Salade César')
  })

  test('renaming a LINKED meal lives in its ⋯, under « Modifier »', async ({ page }) => {
    await openDay(page)
    const spag = row(page, 'Spaghetti maison')
    await spag.getByRole('button', { name: /plus d.actions/i }).click()
    // The panel is portaled to <body> (ActionMenu) — scope INSIDE it. A page-wide
    // search for « Modifier » finds every free-text row's tap button first (that word
    // is their aria-label, and they precede the portal in DOM order): the first run of
    // this test opened the Crêpes row's rename and read its value back.
    const item = page.locator('.action-menu__panel[role="menu"]').getByText('Modifier', { exact: true })
    await expect(item).toBeVisible()
    await item.click()
    await expect(page.locator('.kitchen__meal-row .edit-field__input')).toHaveValue('Spaghetti maison')
  })
})


// ── folded from past-day-meal-doors.spec.ts ──────────────────────────────────────────────
test.describe('past-day-meal-doors', () => {
  // Two DOORS into the same editable day scene for a PAST date — La cuisine ▸
  // Historique's pencil, and Le babillard ▸ Mois's ⋯ « Planifier un repas ». Neither
  // route has a past/future gate anywhere in the app (functions/api/meals.ts,
  // src/pages/DayPlanPage.tsx) — this locks in that BOTH doors actually reach that
  // already-editable scene, so the wiring can't quietly regress into a read-only peek
  // or a "past days aren't editable" redirect.

  const DAY = 86400
  // The « Tacos » row in the default meal-history fixture (e2e/mocks.ts) — a past day
  // that already has a meal, so Historique can list it (it only lists days that have
  // at least one row: functions/api/meal-history.ts, `SELECT DISTINCT date FROM meals`).
  const TACOS_DATE = MMID - DAY

  test('Historique — the pencil on a past day lands on the editable Repas face, meal loaded', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    // The pencil's destination (DayPlanPage) reads a past date's meals from
    // /api/meals?date=<that day> — a second, narrow read alongside the plain
    // rolling-window GET the week grid/Historique use (functions/api/meals.ts,
    // src/pages/DayPlanPage.tsx `pastMealsQ`). Stub it directly so the SAME "Tacos"
    // meal Historique just listed actually shows up inside the editor too.
    await page.route('**/api/meals**', async (route) => {
      const req = route.request()
      if (req.method() === 'GET' && new URL(req.url()).searchParams.get('date') === String(TACOS_DATE)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            days: [{ id: 'mh1', date: TACOS_DATE, slot: 'supper', title: 'Tacos', cook_member_id: 'm1', position: 0, is_leftover: 0 }],
            weekStart: TACOS_DATE,
            windowDays: 10,
            recent: [],
          }),
        })
      }
      return route.fallback()
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/kitchen?tab=history')
    await expect(page.locator('.kitchen__history')).toBeVisible({ timeout: 15_000 })

    const tacosRow = page.locator('.kitchen__day').filter({ hasText: 'Tacos' })
    await expect(tacosRow).toBeVisible()
    await tacosRow.locator('.kitchen__day-manage').click()

    // /kitchen/day/<past date>?vue=repas — the editable meal planner, not the
    // read-only day peek the date badge opens.
    await page.waitForURL(new RegExp(`/kitchen/day/${TACOS_DATE}\\?vue=repas`))
    const supper = page.locator('.day-mng__sec[data-dnd-zone="supper"]')
    await expect(supper).toBeVisible()
    await expect(supper).toContainText('Tacos')
    // Editable, not a recap: the section still carries its header ＋.
    await expect(supper.locator('.sec-label__actbtn')).toBeVisible()
  })

  test('Mois — the ⋯ « Planifier un repas » door reaches a past day too', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 660, height: 1176 })
    await mockApi(page)
    // The household's own local-midnight math (America/Toronto, DST-aware), not a
    // bare `new Date()` — the browser context is pinned to that zone
    // (playwright.config.ts), but this Node test process runs in the CI RUNNER's
    // zone (UTC). MonthView re-snaps `?date=` through the SAME Toronto-aware
    // `localDayStart` (src/components/board/MonthView.tsx `selected`), so a
    // UTC-computed epoch here would round-trip to a DIFFERENT calendar day on CI
    // than the one this test asserts on — exactly what broke this test on CI
    // (2026-09-03: expected .../1788307200, received .../1788235200 — one day off,
    // the Toronto/UTC offset showing through).
    const today = todayLocalDay()
    // addLocalDays, not `- DAY`: on the two DST transition days a fixed 86400 lands
    // at yesterday 01:00 / 23:00 instead of its midnight (the repo's documented
    // fixed-86400 trap), which would go red on CI twice a year.
    const past = addLocalDays(today, -1)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, boardView: 'month' })
    // ?date= picks the day directly on load (MonthView reads it from the URL), so this
    // opens straight on a past day's panel with no cell-click needed — and sidesteps
    // picking a past-dated grid cell by index, which is flaky across a month boundary.
    await page.goto(`/board?date=${past}`)
    await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })
    await expect(page.locator('.monthv__day')).toBeVisible()

    await page.locator('.monthv__day-tools button[aria-haspopup]').click()
    await page.getByRole('menuitem', { name: /repas/i }).click()

    await page.waitForURL(/\/kitchen\/day\/\d+\?vue=repas/)
    expect(new URL(page.url()).pathname).toBe(`/kitchen/day/${past}`)
  })

  // The doors above prove NAVIGATION works; this proves the calendar actually
  // REFLECTS what you planned once you're back — the gap Marc hit live (2026-09-03:
  // "i was able to add a meal in the past but it didn't show in the calendar as a
  // dot"). Root cause: every meal write's `affectedKeys` (DayPlanPage.tsx,
  // mealMutations.ts, Leftovers.tsx, …) and the realtime broadcast map
  // (functions/_lib/realtime.ts `meals`) invalidated ['meals']/['board']/
  // ['meal-history'] but never ['month'] — the exact key MonthView's own read is
  // keyed under (src/lib/queryKeys.ts). A habit mark already carried ['month'] for
  // the identical reason (habit occurrences render on /api/month too); meals didn't.
  test('planning a meal invalidates the calendar so its dot actually appears', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    let monthGets = 0
    const posted: Record<string, unknown>[] = []
    await mockApi(page)
    // Count only the CALENDAR's own wide multi-week grid read (MonthView, six weeks
    // ≈ from..to spanning well over a day) — the day scene fires its OWN, narrower
    // /api/month?from=<date>&to=<date+1> (DayPlanPage's `dayItemsQ`, a `[date, +1d)`
    // window for events/chores), which would otherwise inflate this counter on
    // every visit regardless of whether the calendar's cache ever refetched.
    await page.route('**/api/month**', async (route) => {
      if (route.request().method() === 'GET') {
        const u = new URL(route.request().url())
        const span = Number(u.searchParams.get('to')) - Number(u.searchParams.get('from'))
        if (span > DAY) monthGets++
      }
      return route.fallback()
    })
    // The mock fixtures don't simulate persistence (a meal POST here isn't reflected
    // in a later GET, unlike habits/list — see e2e/mocks.ts), so this only needs to
    // confirm the write itself landed, not that the composer re-renders it.
    await page.route('**/api/meals**', async (route) => {
      if (route.request().method() === 'POST') {
        posted.push(route.request().postDataJSON())
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'new' }) })
      }
      return route.fallback()
    })
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true, boardView: 'month' })

    // A fresh page.goto() tears down and rebuilds the whole SPA (and its
    // QueryClient) regardless of any invalidation logic, which would make this
    // pass even with the bug back — so the trip out AND back must both be SPA-
    // internal navigation, exactly like a real visit: the calendar's own ⋯
    // « Planifier un repas » door out, the browser back button (an in-app
    // pop-state, not a reload) back in.
    await page.goto('/board')
    await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })
    await expect.poll(() => monthGets).toBeGreaterThan(0)
    const before = monthGets

    await page.locator('.monthv__day-tools button[aria-haspopup]').click()
    await page.getByRole('menuitem', { name: /repas/i }).click()
    await page.waitForURL(new RegExp(`/kitchen/day/${todayLocalDay()}\\?vue=repas`))

    // Plan a meal from the day scene — the exact write both doors above land on.
    // A SIDE slot (not souper, the hero — its own AI-staples composer, not the
    // plain EntityCombobox free-text every other slot shares), so the write stays a
    // one-line add.
    await expect(page.locator('.day-mng__sec').first()).toBeVisible({ timeout: 15_000 })
    const breakfast = page.locator('.day-mng__sec[data-dnd-zone="breakfast"]')
    await breakfast.locator('.day-mng__sec-head-row .sec-label__actbtn').click()
    await breakfast.locator('.edit-field input.input').fill('Chili')
    await page.keyboard.press('Enter')
    await expect.poll(() => posted.length, { message: 'the meal was planned' }).toBeGreaterThan(0)
    expect(posted[0]).toMatchObject({ slot: 'breakfast', title: 'Chili' })

    // Back to the calendar (SPA back, not page.goto): it must actually REFETCH —
    // TanStack serves a query's 30s-old cache silently on remount unless something
    // marked it stale first — so this fails exactly when a meal write's
    // affectedKeys drops ['month'] again.
    await page.goBack()
    await page.locator('.monthv').waitFor({ state: 'visible', timeout: 15_000 })
    await expect.poll(() => monthGets, { message: 'the calendar should refetch after a meal write' }).toBeGreaterThan(before)
  })

  test('…and that pencil sits in the day HEADER, on the date’s line — the Repas anatomy', async ({ page }) => {
    // Reported from the phone 2026-09-09: in Historique the pencil hung on a line of
    // its OWN, under the meal chips, where the week grid puts it in the header beside
    // the date. The cause was structural — the day row wrapped the pencil in an
    // unstyled `.kitchen__day-top` div inside the body, so it wrapped instead of
    // sitting in `.kitchen__day-head` like every other kitchen day row.
    //
    // Asserted on GEOMETRY, not only on the class: what was wrong was where the button
    // LANDED, and a `.kitchen__day-head` that lost its flex row would put it back on a
    // second line while still passing a "is it inside the header?" check.
    await page.setViewportSize({ width: 390, height: 844 })
    await mockApi(page)
    await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
    await page.goto('/kitchen?tab=history')
    const row = page.locator('.kitchen__day').first()
    await row.waitFor({ state: 'visible', timeout: 15_000 })

    const pencil = row.locator('.kitchen__day-manage')
    await expect(pencil, 'the pencil is inside the row header').toHaveCount(1)
    await expect(row.locator('.kitchen__day-head .kitchen__day-manage')).toHaveCount(1)

    const date = await boxOf(row.locator('.kitchen__day-date'))
    const pen = await boxOf(pencil)
    const chips = await boxOf(row.locator('.meal-chip').first())

    const midOf = (b: { y: number; height: number }) => b.y + b.height / 2
    expect(Math.abs(midOf(pen) - midOf(date)), 'the pencil shares the date’s line').toBeLessThan(10)
    expect(pen.x, 'and is clustered hard right of it').toBeGreaterThan(date.x + date.width - 1)
    // The control: the chips are a separate line BELOW that header, so "same line as
    // the date" can't pass by everything having collapsed into one row.
    expect(chips.y, 'the meals stay below the header').toBeGreaterThan(pen.y + pen.height - 1)
  })
})

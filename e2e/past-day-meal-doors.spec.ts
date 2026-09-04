import { test, expect } from '@playwright/test'
import { mockApi, seedState, MMID } from './mocks'
import { todayLocalDay, addLocalDays } from '../src/lib/localDay'

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

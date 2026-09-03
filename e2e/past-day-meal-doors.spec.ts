import { test, expect } from '@playwright/test'
import { mockApi, seedState, MMID } from './mocks'

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
  const today = (() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return Math.floor(d.getTime() / 1000)
  })()
  const past = today - DAY
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

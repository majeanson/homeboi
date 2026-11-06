import { test, expect } from './fixtures'
import { localDayStart } from '../src/lib/localDay'

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
// board-customize.spec.ts beside the rest of the board-layout coverage.)

// Local midnight in the household zone, not Node's (UTC on CI — a day off there).
const today = () => localDayStart(new Date())

test('the moon line now lives inside « Dehors aujourd’hui »', async ({ page, app }) => {
  await app.boot({ state: { calm: true } })
  await page.goto('/board')
  await page.locator('.hub').waitFor()
  // Tap the weather/wonder hero — the sheet's only door.
  await page.locator('.now-card--wx, .board-heroes .now-card').last().click()
  await expect(page.locator('.sky-sheet')).toBeVisible()
  await expect(page.locator('.sky-tonight')).toBeVisible()
  await expect(page.locator('.sky-tonight__kicker')).toHaveText('Ce soir dans le ciel')
})

test('the day page offers « Avant de partir », and it opens that day’s screen', async ({ page, app }) => {
  await app.boot({ state: { calm: true } })
  await page.goto(`/kitchen/day/${today()}`)
  await page.locator('.scene').waitFor()
  const door = page.locator('.day-plan__doors button')
  await expect(door).toHaveText(/Avant de partir/)
  await door.click()
  // ?day= carries the day through — DeparturePage reads it standalone.
  await page.waitForURL(/\/board\/departure\?day=\d+/)
})

test('a read-only guest never sees that door — the checklist behind it writes', async ({ page, app }) => {
  await app.boot({ state: { calm: true } })
  await page.addInitScript(() => localStorage.setItem('babillard-guest-token', '1'))
  await page.goto(`/kitchen/day/${today()}`)
  await page.locator('.scene').waitFor()
  await expect(page.locator('.day-plan__doors')).toHaveCount(0)
})

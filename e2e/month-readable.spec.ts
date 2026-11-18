import { test, expect } from './fixtures'
import { boxOf } from './measure'
import { BASE, MMID } from './mocks'

test.use({ timezoneId: 'America/Toronto' })

// Review #21 (2026-11-17), Geneviève and Mélanie on a phone: « Mois » was coloured dots
// « smaller than a grain of rice » under a legend in ~10px type; nobody could tell a vet
// appointment from a supper. Now a cell names its first item, the markers are bigger,
// and the legend reads.

test('on a phone, a month cell names what is on it, and the legend reads', async ({ app, page }) => {
  // The shared month mock is empty but for habits (not cell markers): give it rendez-vous.
  const ev = (id: string, title: string, at: number, day: number) => ({ id, title, at, all_day: 0, member_id: null, day })
  const events = [ev('e1', 'Vétérinaire', BASE + 3600, MMID), ev('e2', 'Dentiste', BASE + 3 * 3600, MMID)]
  const month = { events, meals: [], tasks: [], dayNotes: [], todos: [], trips: [], tripPlans: [], habits: [] }
  await app.boot({ route: '/board?view=month', wait: '.monthv__grid', clock: 'BASE', viewport: { width: 390, height: 844 }, api: { overrides: { month } } })
  const names = page.locator('.monthv__cell .monthv__name')
  await expect(names.first()).toBeVisible()
  expect((await names.first().textContent())?.trim().length).toBeGreaterThan(0)
  // One name per cell on a phone: seven columns leave no room for two.
  const perCell = await page.locator('.monthv__cell').evaluateAll((cells) =>
    Math.max(...cells.map((c) => [...c.querySelectorAll('.monthv__name')].filter((n) => (n as HTMLElement).offsetParent).length)),
  )
  expect(perCell).toBe(1)
  // Legible: the legend at ≥ 12px, a marker at ≥ 7px.
  const legendPx = await page.locator('.monthv__legend').evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  expect(legendPx).toBeGreaterThanOrEqual(12)
  const dot = page.locator('.monthv__dot').first()
  if (await dot.count()) expect((await boxOf(dot)).height).toBeGreaterThanOrEqual(6.5)
})

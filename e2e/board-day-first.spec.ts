import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

// Review #15 (2026-11-17): a fresh device opened its board on the fridge notes, the
// weather photo and « À régler »; « Aujourd'hui » was the fifth card and « Tâches » the
// eleventh. Marc chose « the day first »: the band opens with the agenda, « Ce soir »,
// then routine | tâches | à régler, and only then the fridge. Defaults only: a device
// that saved its own layout keeps it.

const bandOrder = (page: Page) =>
  page.locator('.board-band > .wg-slot:not([hidden])').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.card))

test('a fresh device opens on the day, then supper, before the fridge', async ({ app, page }) => {
  await app.boot({ route: '/board', wait: '.board-band' })
  await expect(page.locator('.board-band > .wg-slot[data-card="today"]')).toBeVisible()
  const order = await bandOrder(page)
  expect(order[0]).toBe('today')
  expect(order.indexOf('heroes')).toBeLessThan(order.indexOf('notes'))
  expect(order.indexOf('today')).toBeLessThan(order.indexOf('notes'))
})

test('a saved layout keeps its own order', async ({ app, page }) => {
  // The previous default, saved by a device that customised its board.
  const saved = {
    band: ['notes', 'heroes', 'souvenirs', 'aRegler'],
    grid: ['autoCard', 'today', 'departure', 'routineNext', 'habitudes', 'tomorrow', 'countdown', 'toFinish', 'todos', 'upcoming', 'cercleNotes', 'voyage', 'carnets', 'seasonUpkeep', 'drawings', 'photos', 'remarks'],
    size: {},
    mode: {},
  }
  await page.addInitScript((v) => localStorage.setItem('babillard-card-prefs', v), JSON.stringify(saved))
  await app.boot({ route: '/board', wait: '.board-band' })
  await expect(page.locator('.board-band > .wg-slot[data-card="notes"]')).toBeVisible()
  expect((await bandOrder(page))[0]).toBe('notes')
  await expect(page.locator('.board-band > .wg-slot[data-card="today"]')).toHaveCount(0)
  await expect(page.locator('.board-grid > .wg-slot[data-card="today"]')).toBeVisible()
})

import { test, expect } from './fixtures'

// Review #33 (2026-11-18; Sam, screen reader), each change approved by Marc:
//   · the board's heading list held the H1 and nothing else; a scene started at H2 and
//     left the browser tab saying « Babillard »;
//   · empty cards were still named regions, and « Dessins » sat inside « Dessins »;
//   · the month grid had no rows, named its cells « 4 », and was ~30 Tab stops;
//   · sub-tabs had no panel to control.

test('board cards are headings, and an empty card is not a named region', async ({ app, page }) => {
  await app.boot({ route: '/board', wait: '.board-band', clock: 'BASE' })
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
  expect(await page.getByRole('heading', { level: 2 }).count(), 'one per card on screen').toBeGreaterThan(3)
  await expect(page.locator('section.wg-slot[data-empty][aria-label]')).toHaveCount(0)
})

test('a scene is the page: its title is the H1 and names the browser tab', async ({ app, page }) => {
  await app.boot({ route: '/kitchen/recipe/rc1', wait: '.scene__head-title', clock: 'BASE' })
  const h1 = page.locator('h1.scene__head-title')
  await expect(h1).toBeVisible()
  const name = (await h1.innerText()).trim()
  await expect(page).toHaveTitle(`${name} · Babillard`)
})

test('the month grid: week rows, full day names, ONE Tab stop the arrows walk', async ({ app, page }) => {
  await app.boot({ route: '/board?view=month', wait: '.monthv__grid', clock: 'BASE' })
  const grid = page.getByRole('grid')
  expect(await grid.getByRole('row').count(), 'a header row and the weeks').toBeGreaterThanOrEqual(6)
  await expect(grid.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1)
  const first = grid.locator('[role="gridcell"][tabindex="0"]')
  await expect(first).toHaveAttribute('aria-label', / — /)
  const day = Number(await first.getAttribute('data-day'))
  await first.focus()
  await page.keyboard.press('ArrowRight')
  const next = page.locator(':focus')
  await expect(next).toHaveAttribute('role', 'gridcell')
  expect(Number(await next.getAttribute('data-day'))).toBeGreaterThan(day)
  await expect(grid.locator('[role="gridcell"][tabindex="0"]')).toHaveCount(1)
  await page.keyboard.press('ArrowDown')
  const below = Number(await page.locator(':focus').getAttribute('data-day'))
  expect(below - day, 'one week and one day on').toBeGreaterThan(7 * 86400 - 7200)
})

test('La cuisine’s sub-tabs control a panel named by the selected tab', async ({ app, page }) => {
  await app.boot({ route: '/kitchen', wait: '.kitchen', clock: 'BASE' })
  await expect(page.getByRole('tabpanel', { name: 'Repas' })).toBeVisible()
  await page.getByRole('tab', { name: 'Recettes' }).click()
  await expect(page.getByRole('tabpanel', { name: 'Recettes' })).toBeVisible()
  const tab = page.getByRole('tab', { name: 'Recettes' })
  await expect(page.locator(`#${await tab.getAttribute('aria-controls')}`)).toHaveAttribute('role', 'tabpanel')
})

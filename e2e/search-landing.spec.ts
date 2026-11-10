import { test, expect } from './fixtures'
import { somedayTask } from './mocks'

// ?item=<id> lands ON the row (solidify 4.2): the container scrolls it into view, marks
// it for a moment, and strips the param so a reload does not replay it. Before this,
// only Maison and Notes read ?item; a hit on a habit or a drawing opened the page and
// left you to find the thing.
test('a habit hit lands on its row and the param is consumed', async ({ page, app }) => {
  await app.boot({ route: '/board/habitudes?item=hb1', clock: 'BASE', wait: '.habitudes__item' })
  await expect(page.locator('[data-item="hb1"]')).toHaveClass(/is-item-target/)
  await expect(page).not.toHaveURL(/item=/)
})

test('a drawing hit lands on its tile', async ({ page, app }) => {
  await app.boot({ route: '/drawings', wait: '.drawgallery__item' })
  const id = await page.locator('.drawgallery__item').first().getAttribute('data-item')
  await page.goto(`/drawings?item=${id}`)
  await expect(page.locator(`[data-item="${id}"]`)).toHaveClass(/is-item-target/)
  await expect(page).not.toHaveURL(/item=/)
})

test('an id that no longer exists just lands on the page, and the param still goes', async ({ page, app }) => {
  await app.boot({ route: '/board/habitudes?item=gone', clock: 'BASE', wait: '.habitudes__item' })
  await expect(page).not.toHaveURL(/item=/, { timeout: 8_000 })
  await expect(page.locator('.is-item-target')).toHaveCount(0)
})

test('a search result carries the row id through to the page', async ({ page, app }) => {
  await app.boot({ route: '/search?q=Marcher', clock: 'BASE', wait: '.search__row' })
  await page.locator('.search__row[href="/board/habitudes?item=hb1"]').click()
  await expect(page.locator('[data-item="hb1"]')).toHaveClass(/is-item-target/)
})

test('a task is findable, and lands on the Tâches view when it is not on today’s board', async ({ page, app }) => {
  // Search reads every task from /api/tasks (one list, 2026-11-08), whatever its table.
  const subjects = { carnets: [], contacts: [], pets: [], projects: [], trips: [] }
  await app.boot({
    route: '/search?q=Vaisselle',
    api: { overrides: { tasks: { tasks: [somedayTask({ source: 'task', id: 'ch1', title: 'Vaisselle' })], subjects, history: [] } } },
    wait: '.search__row',
  })
  await page.locator('.search__row', { hasText: 'Vaisselle' }).click()
  await expect(page).toHaveURL(/view=taches/)
})

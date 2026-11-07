import { test, expect } from './fixtures'
import { boxOf } from './measure'

// « Tâches », the fifth board view (plans/2026-11-06-TACHE-UNIFIEE.md): the one home for
// browsing tasks. The lens lives in the URL, someday tasks live here, adding is one field,
// and Réglages sends its old links here instead of holding a second list.

const OPEN = { route: '/board?view=taches', wait: '.tasks-view' }

test('the view lists what the bento does not: a someday task', async ({ page, app }) => {
  await app.boot(OPEN)
  await expect(page.locator('.tasks-view')).toContainText('Boîte à lunch des enfants')
  await expect(page.locator('.tasks-view')).toContainText('Un jour')
  await expect(page.locator('.tasks-view')).toContainText('En attente')
})

test('the lens is in the URL, and survives a reload', async ({ page, app }) => {
  await app.boot(OPEN)
  await page.getByRole('radio', { name: 'Sujet' }).click()
  await expect(page).toHaveURL(/par=sujet/)
  await expect(page.locator('.tasks-view')).toContainText('La maison')
  await expect(page.locator('.tasks-view')).toContainText('Sans sujet')
  await page.reload()
  await page.waitForSelector('.tasks-view')
  await expect(page.getByRole('radio', { name: 'Sujet' })).toBeChecked()
  await page.getByRole('radio', { name: 'Personne' }).click()
  await expect(page).toHaveURL(/par=qui/)
  await expect(page.locator('.tasks-view')).toContainText('Maisonnée')
})

test('a project subject links here, narrowed to it', async ({ page, app }) => {
  await app.boot({ route: '/board?view=taches&par=sujet&sujet=project:hp9', wait: '.tasks-view' })
  await expect(page.locator('.tasks-view')).toContainText('Réparer la clôture')
  await expect(page.locator('.tasks-view')).not.toContainText('Sortir les poubelles')
})

test('adding is one title field, and it files as someday', async ({ page, app }) => {
  await app.boot(OPEN)
  const add = page.locator('.tasks-view').getByPlaceholder('Ajouter une tâche…')
  await add.fill('Trier les photos')
  const post = page.waitForRequest((r) => r.url().includes('/api/todos') && r.method() === 'POST')
  await add.press('Enter')
  expect(((await post).postDataJSON() as { day: number | null }).day).toBeNull()
  await expect(page.locator('.tasks-view')).toContainText('Trier les photos')
})

test('the view fits a 390px phone', async ({ page, app }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await app.boot(OPEN)
  const view = await boxOf(page.locator('.tasks-view'))
  expect(view.x + view.width).toBeLessThanOrEqual(390)
  const rows = page.locator('.tasks-view .act')
  for (let i = 0; i < (await rows.count()); i++) {
    const b = await boxOf(rows.nth(i))
    expect(b.x + b.width).toBeLessThanOrEqual(390)
  }
})

test('the view toggle offers it, and a peek edits in its own scene', async ({ page, app }) => {
  await app.boot({ route: '/board', wait: '.board-grid .wg-slot' })
  await page.getByRole('radio', { name: 'Tâches' }).click()
  await expect(page).toHaveURL(/view=taches/)
  await page.locator('.tasks-view [data-task="chore"]').first().locator('.act__hit').click()
  await expect(page.locator('.detail-sheet').getByRole('link', { name: /Modifier/ }).or(page.locator('.detail-sheet'))).toBeVisible()
})

test('an old Réglages link lands on the view', async ({ page, app }) => {
  await app.boot({ route: '/settings?tab=maison&focus=chores', wait: '.tasks-view' })
  await expect(page).toHaveURL(/view=taches/)
  await app.boot({ route: '/settings?tab=chores', wait: '.tasks-view' })
  await expect(page).toHaveURL(/view=taches/)
})

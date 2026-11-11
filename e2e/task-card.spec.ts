import { test, expect } from './fixtures'
import { BOARD, boardTask } from './mocks'

// THE MERGED BOARD SECTION (plans/2026-11-06-TACHE-UNIFIEE.md). One card, one Act row, whichever
// table a task lives in. What a stranger must be able to count on: a one-off ticks in place and
// stays ticked, a recurring one moves on behind the undo toast, whose turn it is reads on
// the row, a subject's icon leads, and a bulk clear is one gesture.

const once = boardTask({ source: 'home', id: 'h-once', title: 'Changer le filtre', subject: { kind: 'carnet', id: 'car1' } })
const weekly = boardTask({ source: 'task', id: 'c-week', title: 'Sortir le bac', recurring: true, who_id: 'm1', team: ['m1', 'm2'] })
// The board's one `tasks` list carries the to-dos too (2026-11-08): the fixture's due one rides along.
const todo = BOARD.tasks.find((t) => t.id === 'td1')!
const OPEN = { route: '/board', wait: '.board-grid .wg-slot', api: { overrides: { board: { ...BOARD, tasks: [once, weekly, todo] } } } }

const card = (page: import('@playwright/test').Page) => page.locator('.wg-slot[data-card="todos"]')

test('one card holds every task, a home row too, and a someday task is not on it', async ({ page, app }) => {
  await app.boot(OPEN)
  const c = card(page)
  await c.scrollIntoViewIfNeeded()
  await expect(c.locator('[data-task="home"]')).toContainText('Changer le filtre')
  await expect(c.locator('[data-item="c-week"]')).toContainText('Sortir le bac')
  await expect(c.locator('[data-item="td1"]')).toContainText('Clés + téléphone')
  await expect(c).not.toContainText('Boîte à lunch')
})

test('a one-off ticks in place, stays, and a second tap unticks it', async ({ page, app }) => {
  await app.boot(OPEN)
  const row = card(page).locator('[data-task="home"]')
  await row.scrollIntoViewIfNeeded()
  // The mock is static, and the write refetches: serve what the server would say next.
  await page.route('**/api/board', (r) => r.fulfill({ json: { ...BOARD, tasks: [{ ...once, done: 'ticked', doneAt: BOARD.syncedAt }, weekly] } }))
  const patch = page.waitForRequest((r) => r.url().includes('/api/tasks') && r.method() === 'PATCH')
  await row.locator('.act__checkbtn').click()
  const body = (await patch).postDataJSON() as { id: string; doneAt: number }
  expect(body.id).toBe('h-once')
  // The tick carries its own moment, so an offline replay keeps its real day.
  expect(body.doneAt).toBeGreaterThan(0)
  await expect(row.locator('.act.done')).toBeVisible()
  await expect(page.locator('.undo-toast__btn')).toHaveCount(0)
  await expect(card(page).locator('.todo-clear button')).toBeVisible()

  const undo = page.waitForRequest((r) => r.url().includes('/api/tasks') && r.method() === 'PATCH')
  await row.locator('.act__checkbtn').click()
  expect(((await undo).postDataJSON() as { done: boolean }).done).toBe(false)
})

// Whose turn it is lives in the peek (the owner, 2026-11-11: the row is the title and its
// tick); the title's tint still says who at a glance.
test('a recurring task moves on behind the undo toast; whose turn it is reads in the peek', async ({ page, app }) => {
  await app.boot(OPEN)
  const row = card(page).locator('[data-item="c-week"]')
  await row.scrollIntoViewIfNeeded()
  await expect(row.locator('.who')).toHaveCount(0)
  await row.locator('.act__hit').click()
  await expect(page.locator('.sheet.detail-sheet.show .detail-sheet__who')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.sheet.detail-sheet.show')).toHaveCount(0)
  await row.locator('.act__checkbtn').click()
  await expect(row).toHaveCount(0)
  await page.locator('.undo-toast__btn').first().click()
  await expect(card(page).locator('[data-item="c-week"]')).toHaveCount(1)
})

test('a checked row clears with one gesture, and the count is nowhere', async ({ page, app }) => {
  await app.boot({ ...OPEN, api: { overrides: { board: { ...BOARD, tasks: [{ ...once, done: 'ticked' as const, doneAt: BOARD.syncedAt }, weekly] } } } })
  const c = card(page)
  await c.scrollIntoViewIfNeeded()
  const clear = c.locator('.todo-clear button')
  await expect(clear).not.toContainText(/[0-9]/)
  await clear.click()
  await expect(c.locator('[data-task="home"]')).toHaveCount(0)
  await expect(c.locator('[data-item="c-week"]')).toHaveCount(1)
})

test('the ＋ adds for today, and « Un jour » keeps it off the glance', async ({ page, app }) => {
  await app.boot(OPEN)
  const c = card(page)
  await c.scrollIntoViewIfNeeded()
  await c.locator('.sec-label__actbtn').click()
  await c.getByPlaceholder('Ajouter une tâche…').fill('Appeler la garderie')
  const post = page.waitForRequest((r) => r.url().includes('/api/tasks') && r.method() === 'POST')
  await c.getByRole('button', { name: 'Un jour' }).click()
  expect(((await post).postDataJSON() as { at: number | null }).at).toBeNull()
  await expect(c).not.toContainText('Appeler la garderie')
})



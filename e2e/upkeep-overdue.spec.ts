import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { BOARD, boardTask } from './mocks'

// « Entretiens saisonniers » — the overdue carry-forward. A missed upkeep due date
// (server `homeOverdue`, functions/_lib/upkeep) rides the « À faire » card as a
// checkable Act row wearing the calm « En attente depuis … » sub-line: no badge,
// no count, and it must survive until checked. Checking defers the PATCH behind
// the undo toast (Board.markHomeDone); a read-only guest gets no check at all
// (Act drops onCheck via isGuest()).

const DAY = 86400
const OVERDUE = {
  id: 'hov1',
  title: 'Nettoyer les gouttières',
  color: '#C98A5A',
  at: BOARD.syncedAt - 12 * DAY,
  soon: false,
  who: null,
  who_id: null,
  team: [],
  carnet_id: null,
  recurring: true,
  overdueSince: BOARD.syncedAt - 12 * DAY,
}

// The merged card reads `tasks`: the same row, as _lib/taskItem.ts stamps it.
const TASK = boardTask({ source: 'home', id: OVERDUE.id, title: OVERDUE.title, kind: 'upkeep', recurring: true, dueToday: false, overdueSince: OVERDUE.overdueSince, day: OVERDUE.overdueSince + 90 * 86400 })
const OPEN = { route: '/board', wait: '.board-grid .wg-slot', api: { overrides: { board: { ...BOARD, homeOverdue: [OVERDUE], tasks: [TASK] } } } }

const row = (page: Page) =>
  page.locator('.wg-slot[data-card="todos"] .act').filter({ hasText: 'Nettoyer les gouttières' })

test('an overdue entretien waits on « Tâches » with its calm owed-since line', async ({ page, app }) => {
  await app.boot(OPEN)
  const r = row(page)
  await r.scrollIntoViewIfNeeded()
  await expect(r).toBeVisible()
  // The sub-line is a muted date, never a count or « X jours de retard ».
  await expect(r.locator('.when')).toContainText('En attente depuis')
})

test('checking it hides the row behind the undo toast, and undo brings it back', async ({ page, app }) => {
  await app.boot(OPEN)
  const r = row(page)
  await r.scrollIntoViewIfNeeded()
  // Split row: the body peeks, the check disc ticks.
  await r.locator('.act__checkbtn').click()
  await expect(r).toHaveCount(0)
  // The write is DEFERRED — nothing fired yet; the toast offers the way back.
  const undoBtn = page.locator('.undo-toast__btn').first()
  await expect(undoBtn).toBeVisible()
  await undoBtn.click()
  await expect(row(page)).toHaveCount(1)
})

test('« Reporter » lives behind the peek: postpone hides the row, undo brings it back', async ({ page, app }) => {
  await app.boot(OPEN)
  const r = row(page)
  await r.scrollIntoViewIfNeeded()
  // Split row: the body opens the detail peek (actions behind the detail door).
  await r.locator('.act__hit').click()
  const sheet = page.locator('.detail-sheet')
  await sheet.waitFor({ state: 'visible' })
  const actions = sheet.locator('.detail-sheet__actions')
  // Both postpone flavours show (the mock row recurs → « Au prochain cycle »).
  await expect(actions.getByText('Reporter d’une semaine', { exact: true })).toBeVisible()
  await expect(actions.getByText('Au prochain cycle', { exact: true })).toBeVisible()
  await actions.getByText('Reporter d’une semaine', { exact: true }).click()
  // Peek closes, row goes quiet at once; the PATCH waits behind the undo toast.
  await expect(sheet).toBeHidden()
  await expect(row(page)).toHaveCount(0)
  const undoBtn = page.locator('.undo-toast__btn').first()
  await expect(undoBtn).toBeVisible()
  await undoBtn.click()
  await expect(row(page)).toHaveCount(1)
})

test('a read-only guest sees the owed row but no check', async ({ page, app }) => {
  await app.boot({ api: OPEN.api })
  await page.addInitScript(() => localStorage.setItem('babillard-guest-token', '1'))
  await page.goto(OPEN.route)
  await page.waitForSelector(OPEN.wait)
  const r = row(page)
  await r.scrollIntoViewIfNeeded()
  await expect(r).toBeVisible()
  await expect(r.locator('.act__checkbtn')).toHaveCount(0)
  await expect(r.locator('.check')).toHaveCount(0)
})

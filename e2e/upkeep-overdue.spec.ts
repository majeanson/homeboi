import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, BOARD } from './mocks'

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
  overdueSince: BOARD.syncedAt - 12 * DAY,
}

async function boot(page: Page, opts: { guest?: boolean } = {}) {
  await mockApi(page)
  await seedState(page, {})
  // The shared BOARD fixture stays lean; this spec serves its own richer variant
  // (the documented clone-and-override pattern at the top of mocks.ts).
  await page.route('**/api/board*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...BOARD, homeOverdue: [OVERDUE] }),
    }),
  )
  if (opts.guest) await page.addInitScript(() => localStorage.setItem('babillard-guest-token', '1'))
  await page.goto('/board')
  await page.waitForSelector('.board-grid .wg-slot')
}

const row = (page: Page) =>
  page.locator('.wg-slot[data-card="todos"] .act').filter({ hasText: 'Nettoyer les gouttières' })

test('an overdue entretien waits on « À faire » with its calm owed-since line', async ({ page }) => {
  await boot(page)
  const r = row(page)
  await r.scrollIntoViewIfNeeded()
  await expect(r).toBeVisible()
  // The sub-line is a muted date, never a count or « X jours de retard ».
  await expect(r.locator('.when')).toContainText('En attente depuis')
})

test('checking it hides the row behind the undo toast, and undo brings it back', async ({ page }) => {
  await boot(page)
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

test('a read-only guest sees the owed row but no check', async ({ page }) => {
  await boot(page, { guest: true })
  const r = row(page)
  await r.scrollIntoViewIfNeeded()
  await expect(r).toBeVisible()
  await expect(r.locator('.act__checkbtn')).toHaveCount(0)
  await expect(r.locator('.check')).toHaveCount(0)
})

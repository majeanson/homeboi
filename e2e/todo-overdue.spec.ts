import { test, expect, type Page } from '@playwright/test'
import { BOARD, boardTask, mockApi, seedState, ROUTES } from './mocks'
import { boxOf } from './measure'

// « En attente depuis… » — a loose to-do left on a day that has passed.
//
// It used to vanish. `GET /api/todos` selected `day IS NULL OR day = today`, and the
// sweep only ever removed checklist INSTANCES, so a to-do someone pinned to Tuesday
// still existed in the database on Wednesday and appeared NOWHERE: not on the board,
// not in any glance, only on that one past day's page nobody navigates back to.
// bmad/11 tier-1 seam #3 — lost intended work, silently.
//
// The fix deliberately rewrites nothing: the row keeps its own day. Since the merged card
// (2026-11-06) it has no group of its own: it reads first, with the same muted line every
// owed task wears. Calm: a quiet date, no count, no red.

const DAY = 86_400
const base = ROUTES.todos as { todos: Record<string, unknown>[] }
const today = () => (base.todos[0]?.day as number | undefined) ?? 0

// Since 2026-11-08 the board reads EVERY task from its own payload (one `tasks` list), a
// loose to-do included; /api/todos keeps the departure checklists.
async function board(page: Page, todos: unknown, tasks = BOARD.tasks) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, { overrides: { todos, board: { ...BOARD, tasks } } })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
  await page.goto('/board')
  await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
}

const card = (page: Page) => page.locator('.wg-slot[data-card="todos"]')

test('a loose to-do left on a past day leads the card with its calm owed-since line', async ({ page }) => {
  const late = boardTask({
    source: 'task',
    id: 'td-late',
    title: 'Rapporter les livres à la bibliothèque',
    day: today() - 3 * DAY,
    dueToday: false,
    overdueSince: today() - 3 * DAY,
  })
  await board(page, base, [...BOARD.tasks, late])

  const row = card(page).locator('.act', { hasText: 'Rapporter les livres' })
  await expect(row).toBeVisible()
  await expect(row.locator('.when')).toContainText('En attente depuis')

  // It leads the card: owed rows are painted above the day's.
  const today_ = card(page).locator('.act', { hasText: 'Clés + téléphone' })
  expect((await boxOf(row)).y).toBeLessThan((await boxOf(today_)).y)

  // Calm: a date and nothing more: no « 3 jours de retard ».
  await expect(row.locator('.when')).not.toContainText(/jours?/)
})

test('a stale checklist instance is never presented as owed', async ({ page }) => {
  // A past-day « Avant de partir » instance is finished business: the server sweeps these,
  // and it is no task at all (_lib/taskItem), so the card cannot show it.
  await board(page, {
    ...base,
    todos: [
      ...base.todos,
      { id: 'td-stale', title: 'Vérifier les portes (mardi)', day: today() - DAY, member_id: null, done_at: null, position: 1, section: 'Avant de partir', source_template_id: 'tpl1' },
    ],
  })

  await expect(card(page)).toBeVisible()
  await expect(card(page).locator('.act', { hasText: 'Vérifier les portes (mardi)' })).toHaveCount(0)
})

test('with nothing overdue no row wears the owed line', async ({ page }) => {
  await board(page, ROUTES.todos)
  await expect(card(page)).toBeVisible()
  await expect(card(page).locator('.act .when', { hasText: 'En attente depuis' })).toHaveCount(0)
})

import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, ROUTES } from './mocks'

// « En retard » — a loose to-do left on a day that has passed.
//
// It used to vanish. `GET /api/todos` selected `day IS NULL OR day = today`, and the
// sweep only ever removed checklist INSTANCES, so a to-do someone pinned to Tuesday
// still existed in the database on Wednesday and appeared NOWHERE: not on the board,
// not in any glance, only on that one past day's page nobody navigates back to.
// bmad/11 tier-1 seam #3 — lost intended work, silently.
//
// The fix deliberately rewrites nothing: the row keeps its own day, and the board
// shows it in its own group above the rest — the same shape Entretien's carry-forward
// already uses on this card. Calm: a quiet header, no count, no red.

const DAY = 86_400
// The fixture's own "today", so the spec and the app agree whatever the runner's tz.
const todayOf = (todos: { todos: { day: number | null }[] }) =>
  todos.todos.map((t) => t.day).find((d): d is number => d != null) ?? 0

function todosWith(extra: Record<string, unknown>[]) {
  const base = ROUTES.todos as { todos: Record<string, unknown>[] }
  return { todos: [...base.todos, ...extra] }
}

async function board(page: Page, todos: unknown) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, { overrides: { todos } })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
  await page.goto('/board')
  await page.locator('.hub').waitFor({ state: 'visible', timeout: 15_000 })
}

test('a loose to-do left on a past day shows under « En retard », above the rest', async ({ page }) => {
  const today = todayOf(ROUTES.todos as { todos: { day: number | null }[] })
  await board(
    page,
    todosWith([
      {
        id: 'td-late',
        title: 'Rapporter les livres à la bibliothèque',
        day: today - 3 * DAY,
        member_id: null,
        done_at: null,
        position: 0,
        section: null,
        source_template_id: null,
      },
    ]),
  )

  const overdue = page.locator('.todo-group--overdue')
  await expect(overdue).toBeVisible()
  await expect(overdue.locator('.todo-grouphead')).toHaveText('En retard')
  await expect(overdue).toContainText('Rapporter les livres')

  // It leads the card: the overdue group is painted above the standing ones.
  const overdueY = (await overdue.boundingBox())!.y
  const standing = page.locator('.todo-group', { hasText: 'En tout temps' }).first()
  if (await standing.count()) expect(overdueY).toBeLessThan((await standing.boundingBox())!.y)

  // Calm: it says what it is and nothing more — no count, no badge, no alarm colour.
  await expect(overdue.locator('.todo-grouphead')).not.toContainText(/[0-9]/)
})

test('a stale checklist instance is never presented as owed', async ({ page }) => {
  // A past-day « Avant de partir » instance is finished business — the server sweeps
  // these, and the « À faire » card filters checklist instances out of its loose set
  // regardless. Either way it must not read as a thing still owed.
  //
  // (The other half of the rule — a DONE past-day to-do — is enforced in SQL and
  // pinned by src/lib/todos.test.ts, deliberately NOT here. The client groups by day
  // and lets the server decide what is owed: a row checked in THIS session should
  // stay exactly where it is, struck, rather than jumping between groups under the
  // finger that just checked it.)
  const today = todayOf(ROUTES.todos as { todos: { day: number | null }[] })
  await board(
    page,
    todosWith([
      {
        id: 'td-stale',
        title: 'Vérifier les portes (mardi)',
        day: today - DAY,
        member_id: null,
        done_at: null,
        position: 1,
        section: 'Avant de partir',
        source_template_id: 'tpl1',
      },
    ]),
  )

  await expect(page.locator('.wg-slot[data-card="todos"]')).toBeVisible()
  await expect(page.locator('.todo-group--overdue')).toHaveCount(0)
})

test('with nothing overdue the card looks exactly as it did', async ({ page }) => {
  // The control: the group is absent, not empty-but-present.
  await board(page, ROUTES.todos)
  await expect(page.locator('.wg-slot[data-card="todos"]')).toBeVisible()
  await expect(page.locator('.todo-group--overdue')).toHaveCount(0)
})

import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { mockApi, seedState, BOARD } from './mocks'

// N meals per slot + time ordering + the food slot icons. Frontend-only against
// mocked /api/* (the mock returns {ok:true} for writes, so we assert the request
// fired — the established expectApi pattern).

// Resolve once a meals write with the given predicate is sent.
function waitMeals(page: Page, method: string, pred: (body: any) => boolean) {
  return page.waitForRequest((r) => {
    if (!r.url().includes('/api/meals') || r.method() !== method) return false
    try {
      return pred(JSON.parse(r.postData() || '{}'))
    } catch {
      return false
    }
  })
}

// The per-day editing (rows, add, reorder, clear, note) lives in the day editor
// SCENE now (/kitchen/day/:date) — the week grid is a calm read-only glance. Open
// the first day's editor and return the scene as the scope for the controls.
async function openManage(page: Page) {
  await page.locator('.kitchen__day').first().getByRole('button', { name: /Gérer/ }).click()
  const sheet = page.locator('.scene')
  await expect(sheet).toBeVisible()
  // The meal planner is a plain « Les repas » section now (no disclosure) — the
  // slot rows/controls are always visible.
  await expect(sheet.locator('.day-mng__sec').first()).toBeVisible()
  return sheet
}

test('a slot holds several meals — both show, with an add-another', async ({ page, app }) => {
  await app.boot({ route: '/kitchen', wait: '.hub' })
  const sheet = await openManage(page)
  // Slots read chronologically now (déjeuner → souper), so scope to the Souper
  // section — it holds the two suppers.
  const suppers = sheet.locator('.day-mng__sec', { hasText: 'Souper' }).locator('.kitchen__meal-row')
  await expect(suppers).toHaveCount(2)
  await expect(sheet).toContainText('Spaghetti maison')
  await expect(sheet).toContainText('Salade César')
  // The add affordance is the shared SectionAdd ＋ chip on the slot's header line; its
  // accessible name still says WHICH slot and that this one already holds a meal.
  await expect(sheet.getByRole('button', { name: 'Ajouter un autre — Souper' })).toBeVisible()
})

test('removing one meal hides just that row at once, and deletes it on commit', async ({ page, app }) => {
  await app.boot({ route: '/kitchen', wait: '.hub' })
  const sheet = await openManage(page)
  const rows = sheet.locator('.kitchen__meal-row')
  const before = await rows.count()
  // The DELETE is HELD behind the undo toast (useDeferredRemoval, 2026-11-05 — it used
  // to fire at once and « Annuler » re-created a copy under a new id), so it arrives
  // after the undo window (15 s, toast.tsx DEFAULT_UNDO_MS).
  const del = page.waitForRequest((r) => r.method() === 'DELETE' && r.url().includes('/api/meals'), { timeout: 20_000 })
  // A row's management verbs live behind its ⋯ overflow now (❤ + 📖 stay visible).
  await rows.first().locator('.action-menu__btn').click()
  await page.getByRole('menuitem', { name: 'Retirer le repas' }).click()
  // Hidden now — before any write; « Annuler » is offered.
  await expect(rows).toHaveCount(before - 1)
  await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible()
  const body = JSON.parse((await del).postData() || '{}')
  expect(typeof body.id).toBe('string')
})

test('reorder posts a move; clear-day posts a clear', async ({ page, app }) => {
  await app.boot({ route: '/kitchen', wait: '.hub' })
  const sheet = await openManage(page)
  const move = waitMeals(page, 'POST', (b) => b.action === 'move' && b.dir === 'down')
  // Reorder needs a slot with ≥2 meals — the Souper section (Spaghetti + Salade).
  await sheet.locator('.day-mng__sec', { hasText: 'Souper' }).locator('.kitchen__meal-row').first().locator('.action-menu__btn').click()
  await page.getByRole('menuitem', { name: 'Descendre' }).click()
  await move

  const clear = waitMeals(page, 'POST', (b) => b.action === 'clear' && b.slot === undefined)
  await sheet.getByRole('button', { name: 'Vider les repas' }).click()
  await clear
})

test('clearing one slot posts a clear with that slot', async ({ page, app }) => {
  await app.boot({ route: '/kitchen', wait: '.hub' })
  const sheet = await openManage(page)
  const clear = waitMeals(page, 'POST', (b) => b.action === 'clear' && b.slot === 'supper')
  await sheet.getByRole('button', { name: 'Vider ce repas' }).first().click()
  await clear
})

// Cook seam #1: 17h with no supper planned used to say NOTHING (the tile just
// vanished while the weather kept the card alive). The hero now offers ONE calm
// door — « Choisir un souper » → the Idées drawer.
test('an empty « Ce soir » offers the door to the Idées drawer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  // Registered AFTER mockApi so it wins: today has no supper, the rest stays.
  await page.route('**/api/board', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...BOARD, tonight: null, tonightMeals: [] }),
    }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto('/board')
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
  const hero = page.locator('.now-card--supper-empty')
  await expect(hero).toBeVisible()
  await expect(hero).toContainText('Rien de prévu')
  await hero.getByRole('link', { name: /Choisir un souper/ }).click()
  await expect(page).toHaveURL(/\/kitchen\/idees/)
})

test('the board "Ce soir" lists every supper', async ({ page, app }) => {
  await app.boot({ route: '/board', wait: '.hub' })
  const heroes = page.locator('.board-heroes .now-card .what')
  await expect(heroes.filter({ hasText: 'Spaghetti maison' })).toBeVisible()
  await expect(heroes.filter({ hasText: 'Salade César' })).toBeVisible()
})

test('meals carry their slot food icon, never the carrot', async ({ page, app }) => {
  await app.boot({ route: '/board', wait: '.hub', clock: 'BASE' }) // freeze clock so the morning breakfast meal stays live

  // Today's breakfast (Crêpes) on the bento board is an Act tile with the egg icon.
  await expect(page.locator('.act .tile[data-icon="egg-bold"]').first()).toBeVisible()
  // No meal tile falls back to the generic carrot.
  await expect(page.locator('.act .tile[data-icon="carrot-bold"]')).toHaveCount(0)
})

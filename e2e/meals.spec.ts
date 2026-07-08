import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState, BASE } from './mocks'

// N meals per slot + time ordering + the food slot icons. Frontend-only against
// mocked /api/* (the mock returns {ok:true} for writes, so we assert the request
// fired — the established expectApi pattern).

async function boot(page: Page, path = '/kitchen', freezeClock = false) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // Only the board slot-icon test freezes the clock (to the mock epoch) so today's
  // breakfast meal reads as live, not folded into the collapsed « Déjà passé »
  // disclosure by the board lifecycle. Kept OFF elsewhere so a frozen night-time
  // doesn't perturb time-of-day-dependent UI in the other tests.
  if (freezeClock) await page.clock.setFixedTime(new Date(BASE * 1000))
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto(path)
  await page.locator('.hub').first().waitFor({ state: 'visible', timeout: 15_000 })
}

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

test('a slot holds several meals — both show, with an add-another', async ({ page }) => {
  await boot(page)
  const sheet = await openManage(page)
  // Slots read chronologically now (déjeuner → souper), so scope to the Souper
  // section — it holds the two suppers.
  const suppers = sheet.locator('.day-mng__sec', { hasText: 'Souper' }).locator('.kitchen__meal-row')
  await expect(suppers).toHaveCount(2)
  await expect(sheet).toContainText('Spaghetti maison')
  await expect(sheet).toContainText('Salade César')
  await expect(sheet.getByText('Ajouter un autre').first()).toBeVisible()
})

test('removing one meal deletes just that row', async ({ page }) => {
  await boot(page)
  const sheet = await openManage(page)
  const del = waitMeals(page, 'DELETE', (b) => typeof b.id === 'string')
  await sheet.locator('.kitchen__meal-row').first().getByRole('button', { name: 'Effacer le repas' }).click()
  await del
})

test('reorder posts a move; clear-day posts a clear', async ({ page }) => {
  await boot(page)
  const sheet = await openManage(page)
  const move = waitMeals(page, 'POST', (b) => b.action === 'move' && b.dir === 'down')
  // Reorder needs a slot with ≥2 meals — the Souper section (Spaghetti + Salade).
  await sheet.locator('.day-mng__sec', { hasText: 'Souper' }).locator('.kitchen__meal-row').first().getByRole('button', { name: 'Descendre' }).click()
  await move

  const clear = waitMeals(page, 'POST', (b) => b.action === 'clear' && b.slot === undefined)
  await sheet.getByRole('button', { name: 'Vider la journée' }).click()
  await clear
})

test('clearing one slot posts a clear with that slot', async ({ page }) => {
  await boot(page)
  const sheet = await openManage(page)
  const clear = waitMeals(page, 'POST', (b) => b.action === 'clear' && b.slot === 'supper')
  await sheet.getByRole('button', { name: 'Vider ce repas' }).first().click()
  await clear
})

test('the board "Ce soir" lists every supper', async ({ page }) => {
  await boot(page, '/board')
  const heroes = page.locator('.board-heroes .now-card .what')
  await expect(heroes.filter({ hasText: 'Spaghetti maison' })).toBeVisible()
  await expect(heroes.filter({ hasText: 'Salade César' })).toBeVisible()
})

test('meals carry their slot food icon, never the carrot', async ({ page }) => {
  await boot(page, '/board', true) // freeze clock so the morning breakfast meal stays live

  // Today's breakfast (Crêpes) on the bento board is an Act tile with the egg icon.
  await expect(page.locator('.act .tile[data-icon="egg-bold"]').first()).toBeVisible()
  // No meal tile falls back to the generic carrot.
  await expect(page.locator('.act .tile[data-icon="carrot-bold"]')).toHaveCount(0)
})

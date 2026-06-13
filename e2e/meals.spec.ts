import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// N meals per slot + time ordering + the food slot icons. Frontend-only against
// mocked /api/* (the mock returns {ok:true} for writes, so we assert the request
// fired — the established expectApi pattern).

async function boot(page: Page, path = '/kitchen') {
  await page.emulateMedia({ reducedMotion: 'reduce' })
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

test('a slot holds several meals — both show, with an add-another', async ({ page }) => {
  await boot(page)
  const today = page.locator('.kitchen__day').first()
  // The supper slot is the first meal list in the day card; it holds two suppers.
  const suppers = today.locator('.kitchen__meal-list').first().locator('.kitchen__meal-row')
  await expect(suppers).toHaveCount(2)
  await expect(today).toContainText('Spaghetti maison')
  await expect(today).toContainText('Salade César')
  await expect(today.getByText('Ajouter un autre').first()).toBeVisible()
})

test('removing one meal deletes just that row', async ({ page }) => {
  await boot(page)
  const today = page.locator('.kitchen__day').first()
  const del = waitMeals(page, 'DELETE', (b) => typeof b.id === 'string')
  await today.locator('.kitchen__meal-row').first().getByRole('button', { name: 'Effacer le repas' }).click()
  await del
})

test('reorder posts a move; clear-day posts a clear', async ({ page }) => {
  await boot(page)
  const today = page.locator('.kitchen__day').first()
  const move = waitMeals(page, 'POST', (b) => b.action === 'move' && b.dir === 'down')
  await today.locator('.kitchen__meal-row').first().getByRole('button', { name: 'Descendre' }).click()
  await move

  const clear = waitMeals(page, 'POST', (b) => b.action === 'clear' && b.slot === undefined)
  await today.getByRole('button', { name: 'Vider la journée' }).click()
  await clear
})

test('clearing one slot posts a clear with that slot', async ({ page }) => {
  await boot(page)
  const today = page.locator('.kitchen__day').first()
  const clear = waitMeals(page, 'POST', (b) => b.action === 'clear' && b.slot === 'supper')
  await today.getByRole('button', { name: 'Vider ce repas' }).first().click()
  await clear
})

test('the board "Ce soir" lists every supper', async ({ page }) => {
  await boot(page, '/board')
  const heroes = page.locator('.board-heroes .now-card .what')
  await expect(heroes.filter({ hasText: 'Spaghetti maison' })).toBeVisible()
  await expect(heroes.filter({ hasText: 'Salade César' })).toBeVisible()
})

test('meals carry their slot food icon, never the carrot', async ({ page }) => {
  await boot(page, '/board')
  // Today's breakfast (Crêpes) on the bento board is an Act tile with the egg icon.
  await expect(page.locator('.act .tile[data-icon="egg-bold"]').first()).toBeVisible()
  // No meal tile falls back to the generic carrot.
  await expect(page.locator('.act .tile[data-icon="carrot-bold"]')).toHaveCount(0)
})

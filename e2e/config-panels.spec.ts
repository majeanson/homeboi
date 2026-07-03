import { test, expect, type Page, type Request } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Behavioural coverage for two Réglages ▸ Cuisine config panels that were
// screenshot-only, so a broken PATCH would have shipped green (§211). Both persist
// on /api/household; the tests assert the write fires AND carries the right field, so
// a mis-wired save (or a regressed useWrite migration) is caught. The meal-slot panel
// in particular was just moved from raw api() to useWrite — this locks that in.

const isApi = (method: string, path: string) => (r: Request) =>
  r.method() === method && new URL(r.url()).pathname === `/api/${path}`

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  // Réglages ▸ Cuisine (tab 'recipes') stacks tags / pills / measures / meal-slots /
  // réserve. Deep-link straight to it.
  await page.goto('/settings?tab=recipes')
})

test('hiding a meal slot patches household with the hidden slot', async ({ page }) => {
  const section = page.locator('#sec-meals')
  await expect(section).toBeVisible()
  // Every slot starts « Affiché » (no mealHidden in the fixture). Toggling the first
  // one off saves the whole household setting — a whole-array PATCH via useWrite.
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
    section.getByRole('button', { name: 'Affiché' }).first().click(),
  ])
  const body = JSON.parse(req.postData() || '{}') as { mealHidden?: string[] }
  expect(Array.isArray(body.mealHidden)).toBe(true)
  expect(body.mealHidden!.length).toBe(1)
  // The button flips to « Masqué » optimistically.
  await expect(section.getByRole('button', { name: 'Masqué' })).toHaveCount(1)
})

test('adding a réserve location patches household with the new list', async ({ page }) => {
  const section = page.locator('#sec-reserve')
  await expect(section).toBeVisible()
  await section.getByLabel('Ajouter un emplacement…').fill('Congélateur du sous-sol')
  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
    // EditField submits on Enter (its submit button also works); Enter is simplest.
    section.getByLabel('Ajouter un emplacement…').press('Enter'),
  ])
  const body = JSON.parse(req.postData() || '{}') as { reserveLocations?: { name: string }[] }
  expect(Array.isArray(body.reserveLocations)).toBe(true)
  expect(body.reserveLocations!.some((l) => l.name === 'Congélateur du sous-sol')).toBe(true)
})

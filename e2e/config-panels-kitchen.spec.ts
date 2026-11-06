import { test, expect } from '@playwright/test'
import { isApi, panelsReady } from './interact'

// Réglages config panels, La cuisine (meal slots, réserve, Jours affichés). Each test asserts the write fires AND carries the right
// field: why a settings panel needs that is written out above `panelsReady` in interact.ts.

test.beforeEach(async ({ page }) => panelsReady(page))

// Réglages ▸ Cuisine (tab 'recipes') shows one sub-section at a time behind a SubTabs
// row (tags / pills / measures / meal-slots / réserve). Deep-link straight to the sub
// (?tab=recipes&sub=<key>) so only that section renders in the panel, and scope
// assertions to the tabpanel (#operator-panel).

test('hiding a meal slot patches household with the hidden slot', async ({ page }) => {
  await page.goto('/settings?tab=recipes&sub=meals')
  const section = page.locator('#operator-panel')
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
  await page.goto('/settings?tab=recipes&sub=reserve')
  const section = page.locator('#operator-panel')
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

// « Jours affichés » — the rolling meal-plan window, added 2026-08-27 with bmad/11
// tier-1 seam #1 (a Tuesday-anchored block could not reach the coming weekend from a
// Sunday evening). It stacks under the SAME 'meals' pill as the slot panel above
// (C-15), so this also asserts the two sections coexist there.
test('« Jours affichés » patches household with the chosen window', async ({ page }) => {
  await page.goto('/settings?tab=recipes&sub=meals')
  const section = page.locator('#operator-panel')
  await expect(section).toBeVisible()

  // The window select lives in its own section under the slot list.
  const select = section.getByLabel('La grille montre')
  await expect(select).toBeVisible()
  // The fixture household has never set one, so it reads the default.
  await expect(select).toHaveValue('10')

  const [req] = await Promise.all([
    page.waitForRequest(isApi('PATCH', 'household'), { timeout: 20_000 }),
    select.selectOption('14'),
  ])
  const body = JSON.parse(req.postData() || '{}') as { mealWindowDays?: number }
  expect(body.mealWindowDays).toBe(14)
  await expect(select).toHaveValue('14')
})

test('the window picker only offers what the rest of the app supports', async ({ page }) => {
  // The bounds are load-bearing, not taste: below 7 the toddler kitchen's
  // week.slice(0, 7) would drop days; above 14 the AI snapshot (ask.ts, today+14d)
  // would stop seeing the plan. If someone widens the picker, they have to fix
  // those surfaces first — so the offered set is pinned here.
  await page.goto('/settings?tab=recipes&sub=meals')
  const select = page.locator('#operator-panel').getByLabel('La grille montre')
  await expect(select).toBeVisible()
  const values = await select.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))
  expect(values).toEqual(['7', '10', '14'])
})

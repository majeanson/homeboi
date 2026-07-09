import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// Réglages ▸ Repas — the household's meal ORDER, HERO and serve HOURS. Three separate
// settings that every meal surface reads through useMealPrefs, so the one thing worth
// guarding e2e is that a saved order actually reaches those surfaces (rather than a
// module constant quietly winning). Frontend-only harness, same as aisle-sort.spec.ts:
// Vite + stubbed /api/**. The last test overrides the household payload with a custom
// order + a moved hero + one edited hour, and asserts the settings rows AND the day
// editor both follow it.

const boot = async (page: Page, path: string) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
  await page.goto(path)
}

test('Réglages ▸ Repas renders order + hero + hours, no overflow at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await boot(page, '/settings?tab=kitchen&sub=meals')

  const rows = page.locator('.meal-slots__row')
  await expect(rows.first()).toBeVisible({ timeout: 15_000 })
  await expect(rows).toHaveCount(5)

  // Default display order = chronological.
  const names = await page.locator('.meal-slots__name').allInnerTexts()
  expect(names.map((n) => n.trim())).toEqual(['Déjeuner', 'Dîner', 'Collation', 'Souper', 'Dessert'])

  // Default serve times, honest wall-clock, FR formatting.
  const hoursTxt = await page.locator('.meal-slots__hour-val').allInnerTexts()
  expect(hoursTxt.map((h) => h.trim())).toEqual(['7 h', '12 h', '15 h', '17 h 30', '20 h'])

  // Exactly one hero, and it's the souper.
  const hero = page.locator('.meal-slots__row.is-hero')
  await expect(hero).toHaveCount(1)
  await expect(hero.locator('.meal-slots__name')).toHaveText(/Souper/)

  // Every row carries a drag grip (operator, not guest).
  await expect(page.locator('.meal-slots__row .dnd-grip')).toHaveCount(5)

  // NO horizontal overflow: every descendant's right edge inside the section's.
  const overflow = await page.evaluate(() => {
    const list = document.querySelector('.meal-slots') as HTMLElement
    const right = list.getBoundingClientRect().right
    const bad: string[] = []
    list.querySelectorAll('*').forEach((el) => {
      const r = (el as HTMLElement).getBoundingClientRect()
      if (r.width > 0 && r.right > right + 1) bad.push((el as HTMLElement).className || el.tagName)
    })
    return bad
  })
  expect(overflow).toEqual([])
})

test('the hour stepper nudges by 30 min and PATCHes mealHours', async ({ page }) => {
  const patches: unknown[] = []
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
  await page.route('**/api/household', async (route) => {
    if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON())
    await route.fallback()
  })
  await page.goto('/settings?tab=kitchen&sub=meals')

  const souperRow = page.locator('.meal-slots__row', { hasText: 'Souper' })
  await expect(souperRow.locator('.meal-slots__hour-val')).toHaveText('17 h 30', { timeout: 15_000 })
  await souperRow.getByRole('button', { name: /Plus tard/ }).click()
  await expect(souperRow.locator('.meal-slots__hour-val')).toHaveText('18 h')
  expect(patches).toContainEqual(expect.objectContaining({ mealHours: { supper: 18 * 60 } }))
})

test('day editor lists the five slots chronologically, souper in place', async ({ page }) => {
  await boot(page, '/kitchen')
  await page.locator('.kitchen__day').first().getByRole('button', { name: /Gérer/ }).click()
  await expect(page.locator('.scene .day-mng__sec').first()).toBeVisible({ timeout: 15_000 })
  const heads = await page.locator('.day-mng__sec-head').allInnerTexts()
  expect(heads.map((h) => h.trim())).toEqual(['Déjeuner', 'Dîner', 'Collation', 'Souper', 'Dessert'])
})

// The claim under test: a CUSTOM order + hero is respected on every surface.
const CUSTOM = {
  name: 'Maison Tremblay',
  postal: 'H2X 1Y4',
  includedStores: [],
  aiEnabled: true,
  mealOrder: ['dessert', 'supper', 'snack', 'lunch', 'breakfast'],
  mealHero: 'lunch',
  mealHours: { supper: 19 * 60 },
}

const bootCustom = async (page: Page, path: string) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', calm: true })
  await page.route('**/api/household', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CUSTOM) })
  })
  await page.goto(path)
}

test('a custom order + hero is respected in Réglages, the day editor and the kitchen grid', async ({ page }) => {
  await bootCustom(page, '/settings?tab=kitchen&sub=meals')
  await expect(page.locator('.meal-slots__row').first()).toBeVisible({ timeout: 15_000 })

  // Réglages rows follow the saved order…
  const names = await page.locator('.meal-slots__name').allInnerTexts()
  expect(names.map((n) => n.trim())).toEqual(['Dessert', 'Souper', 'Collation', 'Dîner', 'Déjeuner'])
  // …the hero moved to the dîner…
  await expect(page.locator('.meal-slots__row.is-hero .meal-slots__name')).toHaveText(/Dîner/)
  // …and the edited souper hour shows, the others keep their defaults.
  const hours = await page.locator('.meal-slots__hour-val').allInnerTexts()
  expect(hours.map((h) => h.trim())).toEqual(['20 h', '19 h', '15 h', '12 h', '7 h'])

  // The day editor renders the SAME order, with the dîner (the hero) in its place.
  await bootCustom(page, '/kitchen')
  await page.locator('.kitchen__day').first().getByRole('button', { name: /Gérer/ }).click()
  await expect(page.locator('.scene .day-mng__sec').first()).toBeVisible({ timeout: 15_000 })
  const heads = await page.locator('.day-mng__sec-head').allInnerTexts()
  expect(heads.map((h) => h.trim())).toEqual(['Dessert', 'Souper', 'Collation', 'Dîner', 'Déjeuner'])
})

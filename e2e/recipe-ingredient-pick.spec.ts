import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// The shared « quels ingrédients ? » checklist body (`RecipeIngredientPick`), driven
// off its /dev/kit specimen — the same drill recipe-read-review.spec.ts uses to reach
// a component the product only mounts behind a flow.
//
// What it pins is the body's contract, which two callers used to spell separately:
// section markers are dropped, names dedupe, it opens ALL-UNTICKED (so it reads "pick
// the few I'm missing", not "untick the many I have"), the CTA is dead until
// something is ticked, and select-all/none is a real toggle.
//
// The commit deliberately is NOT in here: `onConfirm` hands the picked names back and
// the HOST does the write, because whether an undo is reachable is a property of the
// surface. `RecipeSheet`'s live path (immediate POST + label flip, since the sheet
// stays painted over the undo toast) is covered by interactions.spec.ts › recipes.

const SPECIMEN = ['500 g de bœuf haché', '1 oignon', '## Sauce', '2 gousses d’ail', '800 ml de tomates', 'Parmesan']
const NAMES = SPECIMEN.length - 1 // the `## Sauce` heading is not an ingredient

async function openSpecimen(page: import('@playwright/test').Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page)
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })
  await page.goto('/dev/kit')
  const entry = page.locator('details.kit-entry').filter({ hasText: 'RecipeIngredientPick' })
  await entry.locator('summary').click()
  const pick = entry.locator('.recipe-list-pick')
  await pick.waitFor({ state: 'visible', timeout: 15_000 })
  return pick
}

test('it opens all-unticked, with the CTA dead until something is picked', async ({ page }) => {
  const pick = await openSpecimen(page)
  await expect(pick.locator('.recipe-list-pick__items .chip')).toHaveCount(NAMES)
  await expect(pick.locator('.recipe-list-pick__items .chip.is-on')).toHaveCount(0)
  await expect(pick.locator('.recipe-list-pick__actions .btn--primary')).toBeDisabled()

  await pick.locator('.recipe-list-pick__items .chip').first().click()
  await expect(pick.locator('.recipe-list-pick__items .chip.is-on')).toHaveCount(1)
  await expect(pick.locator('.recipe-list-pick__actions .btn--primary')).toBeEnabled()
})

test('a `## Titre` section marker is not offered as an ingredient', async ({ page }) => {
  // Every iterator over the flat ingredients array must skip headings (the recipe
  // -sections convention). Offering « Sauce » as a grocery item is the failure.
  const pick = await openSpecimen(page)
  await expect(pick.locator('.recipe-list-pick__items')).not.toContainText('Sauce')
  await expect(pick.locator('.recipe-list-pick__items')).toContainText('Parmesan')
})

test('select-all is a toggle, not a one-way tick', async ({ page }) => {
  const pick = await openSpecimen(page)
  const all = pick.locator('.recipe-list-pick__all')
  await all.click()
  await expect(pick.locator('.recipe-list-pick__items .chip.is-on')).toHaveCount(NAMES)
  await all.click()
  await expect(pick.locator('.recipe-list-pick__items .chip.is-on')).toHaveCount(0)
  await expect(pick.locator('.recipe-list-pick__actions .btn--primary')).toBeDisabled()
})

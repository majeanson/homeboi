import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// The « quels ingrédients ? » checklist, and the DELIBERATE asymmetry around it.
//
// The body is shared (`RecipeIngredientPick`), but the COMMIT is not, because whether
// an undo is *reachable* is a property of the surface:
//
//   • RecipeSheet — inline, and the sheet stays open at z-index 80 while the undo
//     toast sits at 40, so an « Annuler » from there would be painted underneath.
//     It POSTs at once and flips its label. Covered by
//     `interactions.spec.ts` › recipes › "a recipe pushes its ingredients to the list".
//   • RecipeListPicker — a Modal that CLOSES before it commits, so the toast lands on
//     a clear page and the POST can be DEFERRED behind « Annuler ». That is what this
//     spec pins, because nothing else did: the modal is not on a live product path
//     (the Kitchen recipe peek that used it was removed), so only the /dev/kit
//     specimen exercises it — the same way recipe-read-review.spec.ts reaches
//     RecipeReadReview.
//
// The half that matters is negative: after confirming, NOTHING may reach the server
// until the undo window passes, and taking it back must leave the server untouched.
// A "delete-then-recreate" style commit would pass a weaker assertion.

test('the modal picker defers its POST behind « Annuler », and undo sends nothing', async ({ page }) => {
  const posts: string[] = []
  await mockApi(page)
  await page.route('**/api/recipe-to-list', async (route) => {
    posts.push(route.request().method())
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })
  await page.goto('/dev/kit')

  // Same specimen drill as recipe-read-review: expand the entry, then open it.
  const entry = page.locator('details.kit-entry').filter({ hasText: 'RecipeListPicker' })
  await entry.locator('summary').click()
  const open = entry.getByRole('button', { name: 'Ajouter à la liste' })
  await open.waitFor({ state: 'visible', timeout: 15_000 })
  await open.click()

  const pick = page.locator('.kit-modal .recipe-list-pick')
  await expect(pick).toBeVisible()
  // It opens ALL-UNTICKED — "pick the few I'm missing", not "untick the many I have".
  await expect(pick.locator('.chip.is-on')).toHaveCount(0)
  await expect(pick.locator('.recipe-list-pick__actions .btn--primary')).toBeDisabled()

  await pick.locator('.recipe-list-pick__all').click() // Tout sélectionner
  // Six ingredient lines in the specimen, none of them a `## Titre` heading.
  await expect(pick.locator('.recipe-list-pick__items .chip.is-on')).toHaveCount(6)

  await pick.locator('.recipe-list-pick__actions .btn--primary').click()
  // The modal closes FIRST — that is what makes the toast reachable at all.
  await expect(page.locator('.kit-modal .recipe-list-pick')).toHaveCount(0)
  await expect(page.locator('.undo-toast')).toBeVisible()
  expect(posts, 'nothing may reach the server while the undo is still offered').toEqual([])

  await page.locator('.undo-toast__btn').first().click()
  await expect(page.locator('.undo-toast')).toHaveCount(0)
  // Taking it back leaves the server completely untouched — there is no inverse
  // write to run, because nothing ever landed.
  await expect.poll(() => posts.length, { timeout: 3_000 }).toBe(0)
})

test('letting the modal picker settle sends exactly one POST', async ({ page }) => {
  // The other half. 15 s hold (toast.tsx DEFAULT_UNDO_MS), so this one waits.
  const bodies: unknown[] = []
  await mockApi(page)
  await page.route('**/api/recipe-to-list', async (route) => {
    bodies.push(route.request().postDataJSON())
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'kiosk' })
  await page.goto('/dev/kit')

  const entry = page.locator('details.kit-entry').filter({ hasText: 'RecipeListPicker' })
  await entry.locator('summary').click()
  const open = entry.getByRole('button', { name: 'Ajouter à la liste' })
  await open.waitFor({ state: 'visible', timeout: 15_000 })
  await open.click()

  const pick = page.locator('.kit-modal .recipe-list-pick')
  // Tick ONE, so the payload proves the selection is carried, not the whole recipe.
  await pick.locator('.recipe-list-pick__items .chip').first().click()
  await pick.locator('.recipe-list-pick__actions .btn--primary').click()
  await expect(page.locator('.undo-toast')).toBeVisible()

  await expect.poll(() => bodies.length, { timeout: 30_000 }).toBe(1)
  expect((bodies[0] as { items: string[] }).items).toEqual(['Bœuf haché'])
})

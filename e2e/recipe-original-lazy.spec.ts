import { test, expect } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// THE LIST PAYLOAD DOES NOT CARRY THE AS-IMPORTED SNAPSHOT (2026-09-15).
//
// `/api/recipes` is the app's most shared read: nine `useRecipes()` call sites, it
// rides `...live` (a re-poll every ~10 s while a kitchen surface is open), it is
// restored from IndexedDB before first paint, and it replays offline. For most of the
// app's life it also shipped `original` — whose `ingredients` + `steps` are a full
// SECOND COPY of the recipe's text — to every one of those surfaces, to serve one
// toggle in the sheet that most cooks never open. Invisible with three fixture
// recipes; the cold-boot budget at two hundred.
//
// So the snapshot moved to `/api/recipe-original?id=`, fetched on the tap. The
// server-side half (payload shape + the truncated-step heal that still reads the
// column) is pinned by functions/_lib/recipeWire.test.ts. This is the other half: the
// request is not made until asked, it IS made then, and what comes back is the
// snapshot — not the live card wearing its label.
test('the « Original » view is fetched on the tap, and never before', async ({ page }) => {
  const asked: string[] = []
  await page.setViewportSize({ width: 390, height: 844 })
  await mockApi(page)
  // Count AFTER mockApi so the fixture's own handler still answers; page.route
  // stacks, and an observer that fulfils nothing must fall through.
  await page.route('**/api/recipe-original**', async (route) => {
    asked.push(new URL(route.request().url()).search)
    await route.fallback()
  })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })

  await page.goto('/kitchen?tab=recipes')
  const card = page.locator('.recipe-card, .listrow, a[href*="/kitchen/recipe/"]').first()
  await card.click()
  await expect(page.locator('.recipe-modal__card')).toBeVisible()

  // The whole point: opening a recipe costs nothing extra. The board, the search,
  // cook mode and the day plan all read the same list and none of them pay either.
  expect(asked, 'the snapshot is not fetched just because a recipe was opened').toHaveLength(0)

  await page.getByRole('button', { name: 'Voir la recette originale' }).click()

  // …and now it is, for THIS recipe.
  await expect.poll(() => asked.length).toBeGreaterThan(0)
  expect(asked[0]).toContain('id=')

  // What renders is the SNAPSHOT (the fixture's title differs from the live card on
  // purpose), under the « Tel qu'importé » label. Before the lazy fetch landed, the
  // fallback painted the EDITED text under that same label — a wrong claim, which is
  // why the loading state exists.
  const body = page.locator('.recipe-original')
  await expect(body).toContainText('Tel qu’importé')
  await expect(body).toContainText('carte de grand-maman')
  await expect(body).toContainText('2 tasses de farine')
})

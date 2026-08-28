import { test, expect, type Page } from '@playwright/test'
import { mockApi, seedState } from './mocks'

// « Chaque état vide ouvre une porte » (bmad/12 #6). An empty section that explains
// itself and then offers nothing is a dead end: the way in is the ＋ FAB, a glyph the
// words never mention. REVIEW-PASS named one by hand — "empty recipe book has no
// direct add-a-recipe CTA, only a guide link" — and it was one of five.
//
// The limit is as important as the feature: a SECTION empty gets a door, a CELL empty
// ("Rien de prévu" on one day) does NOT. Padding a calm cell with a call to action
// turns a quiet surface into a nag, and that contract is written in COMPONENTS.md.
// Both halves are asserted here.

async function fresh(page: Page, route: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, { fresh: true })
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.goto(route)
  await page.locator('.hub__body, .scene__body').first().waitFor({ state: 'visible', timeout: 15_000 })
}

test('an empty recipe book offers the way to add one', async ({ page }) => {
  await fresh(page, '/kitchen?tab=recipes')
  const door = page.locator('.empty-state__action')
  await expect(door.first()).toBeVisible()
  await expect(door.first()).toHaveText(/Ajouter une recette/)
  // It uses the app's own URL grammar, so the door opens the ＋ sheet on its tile
  // rather than inventing a second add route (DISCOVERY.md).
  await expect(door.first()).toHaveAttribute('href', /plus=recipe/)
})

test('an empty « Mes habitudes » stops ending on a promise it cannot keep', async ({ page }) => {
  // Its copy already read « …ou ajoutes-en une » with nothing to tap.
  await fresh(page, '/board/habitudes')
  const door = page.locator('.empty-state__action')
  await expect(door.first()).toBeVisible()
  await expect(door.first()).toHaveAttribute('href', /habitude\/new/)
})

test('a CELL empty stays bare — a door there would be a nag', async ({ page }) => {
  // The month grid's per-day empties, and the board's own quiet lines, are complete
  // answers on their own. If this ever fails, the sweep over-applied.
  await fresh(page, '/board')
  await expect(page.locator('.hub__body')).toBeVisible()
  const cellDoors = await page.locator('.wg-slot .empty-state__action').count()
  expect(cellDoors, 'board card cells must not sprout calls to action').toBe(0)
})

test('a read-only guest sees the explanation but not the door', async ({ page }) => {
  // isGuest() gates it like every other write affordance — a babysitter has nothing
  // to add, so offering the ＋ would be a dead link with extra steps.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockApi(page, { fresh: true, signedIn: false })
  await page.route('**/api/guest/whoami**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'showcase' }) }),
  )
  await seedState(page, { theme: 'day', audience: 'parent', lang: 'fr', surface: 'mobile' })
  await page.addInitScript(() => localStorage.setItem('babillard-guest-token', 'e2e-guest-token'))
  await page.goto('/kitchen?tab=recipes')
  await page.locator('.hub__body').first().waitFor({ state: 'visible', timeout: 15_000 })
  await expect(page.locator('.empty-state__action')).toHaveCount(0)
})
